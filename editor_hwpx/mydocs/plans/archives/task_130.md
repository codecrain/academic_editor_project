# 타스크 130 수행계획서 — 문서별 동적 웹폰트 로딩

## 배경

### 현재 문제

현재 `font-loader.ts`는 문서 내용과 무관하게 **88개 폰트 이름 × 31개 woff2 파일(~31MB)**을 전부 로드한다. 대부분의 HWP 문서는 2~5개 폰트만 사용하므로 70~90%의 대역폭이 낭비된다.

### 현재 로딩 흐름

```
main.ts: loadWebFonts()           ← 문서 로드 전에 호출
  ├─ 1단계: CSS @font-face 88개 등록 (네트워크 미발생)
  ├─ 2단계: CRITICAL_FONTS 2개 즉시 로드 (함초롬바탕/돋움)
  └─ 3단계: 나머지 86개 백그라운드 배치 로드 (4개씩)
```

문서가 어떤 폰트를 사용하는지 알 수 없으므로 모든 폰트를 로드해야 한다.

### 해결 방향

WASM `getDocumentInfo()`에 문서가 사용하는 폰트 목록을 추가하고, `font-loader.ts`가 해당 폰트만 선별 로드하도록 변경한다.

## 핵심 데이터 흐름

```
HWP 파일 → WASM 파서 → document.font_faces[0..6] (7개 언어 카테고리)
  → getDocumentInfo() → { ..., fontsUsed: ["함초롬바탕", "Calibri", ...] }
    → font-loader.ts → 해당 woff2만 선별 로드
```

### font_faces 구조 (Rust)

```rust
// document.doc_info.font_faces: Vec<Vec<Font>>
// [0]=한국어, [1]=영어, ..., [6]=사용자
// Font { name: "함초롬바탕", alt_type: 2, alt_name: Some("한양신명조"), ... }
```

## 구현 단계 (3단계)

---

### 1단계: WASM API 확장 — fontsUsed 추가

**파일**: `src/wasm_api.rs` (라인 253)

`get_document_info()`에 `fontsUsed` 필드를 추가한다. 문서의 `font_faces` 7개 카테고리에서 고유 폰트 이름을 수집하고, 치환(`resolve_font_substitution`)을 적용한 최종 이름을 반환한다.

```rust
pub fn get_document_info(&self) -> String {
    // 기존 필드 (version, sectionCount, pageCount, encrypted, fallbackFont)
    // + fontsUsed: 문서에서 사용하는 고유 폰트 이름 목록
    let mut fonts = std::collections::BTreeSet::new();
    for (lang_idx, lang_fonts) in self.document.doc_info.font_faces.iter().enumerate() {
        for font in lang_fonts {
            let resolved = resolve_font_substitution(&font.name, font.alt_type, lang_idx)
                .unwrap_or(&font.name);
            fonts.insert(resolved.to_string());
        }
    }
    // JSON 배열로 직렬화
}
```

**파일**: `rhwp-studio/src/core/types.ts`

```typescript
export interface DocumentInfo {
  // ... 기존 필드 ...
  fontsUsed: string[];  // 문서에서 사용하는 폰트 이름 목록
}
```

---

### 2단계: font-loader 동적 로딩 + 상태바 진행 표시

**파일 1**: `rhwp-studio/src/core/font-loader.ts`

현재 `loadWebFonts()`를 문서 폰트 목록을 받는 방식으로 변경한다:

```typescript
export async function loadWebFonts(
  docFonts?: string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ backgroundDone: Promise<void> }> {
  // 1) CSS @font-face는 전체 등록 (네트워크 미발생, 기존과 동일)
  // 2) docFonts가 있으면 해당 폰트 + CRITICAL_FONTS만 로드
  //    docFonts가 없으면 기존처럼 전체 로드 (호환성)
  const usedFiles = docFonts
    ? FONT_LIST.filter(f => docFonts.includes(f.name) || CRITICAL_FONTS.has(f.name))
    : FONT_LIST;
  // 3) 즉시 로드 + 백그라운드 로드 (onProgress 콜백으로 진행률 전달)
}
```

핵심: CSS @font-face 등록은 전체 유지 (비용 없음). **실제 네트워크 로드만 선별**.

**상태바 진행 표시**: `onProgress` 콜백을 통해 `#sb-message` 영역에 진행률 표시:

```
폰트 로딩 중... (3/5)   →   폰트 로딩 완료 (5개)   →   (2초 후 자동 소멸)
```

---

### 3단계: main.ts 통합 + 테스트

**파일**: `rhwp-studio/src/main.ts`

문서 로드 후 `fontsUsed`를 `loadWebFonts`에 전달:

```typescript
// [현재] 문서 로드 전에 폰트 로드
await loadWebFonts();

// [변경] 초기에는 CRITICAL만 로드, 문서 로드 후 추가 폰트 로드
await loadWebFonts();  // CRITICAL만 (docFonts 없음)
// ... loadDocument() ...
loadWebFonts(docInfo.fontsUsed);  // 문서 폰트 추가 로드
```

또는 더 간단하게: 문서 로드 직후에 한 번만 호출:

```typescript
const docInfo = wasm.loadDocument(data);
await loadWebFonts(docInfo.fontsUsed);  // 문서 폰트만 로드
```

**테스트**:

| 항목 | 방법 |
|------|------|
| 571개 회귀 테스트 | `docker compose run --rm test` |
| WASM 빌드 | `docker compose run --rm wasm` |
| TypeScript 타입 체크 | `npx tsc --noEmit` |
| fontsUsed 반환 확인 | 샘플 HWP → getDocumentInfo → fontsUsed 배열 확인 |
| 선별 로드 확인 | 함초롬바탕만 사용하는 문서 → hamchob-r.woff2만 로드 |

---

## 변경 파일 요약

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/wasm_api.rs` | `get_document_info()`에 fontsUsed 추가 | ~15줄 |
| `rhwp-studio/src/core/types.ts` | DocumentInfo에 fontsUsed 필드 | 1줄 |
| `rhwp-studio/src/core/font-loader.ts` | docFonts 선별 로드 + onProgress 콜백 | ~20줄 |
| `rhwp-studio/src/main.ts` | 문서 로드 후 fontsUsed 전달 + 상태바 진행 표시 | ~10줄 |

## 설계 결정 근거

| 결정 | 이유 |
|------|------|
| CSS @font-face는 전체 유지 | 비용 없음(네트워크 미발생), 폰트 편집 시 즉시 사용 가능 |
| 네트워크 로드만 선별 | 실제 대역폭 절감 대상 |
| resolve_font_substitution 적용 | Rust 렌더러가 사용하는 최종 폰트명과 일치시킴 |
| docFonts 없으면 전체 로드 | 하위 호환성 (web/editor.html 등) |

## 기대 효과

| 항목 | 현재 | 적용 후 |
|------|------|---------|
| 일반 문서 (2~5폰트) | 31MB 전체 로드 | 2~8MB 선별 로드 |
| 대역폭 절감 | 0% | 70~90% |
| 초기 렌더링 속도 | 백그라운드 86개 로드 | 필요 폰트만 즉시 로드 |
| 변경 규모 | — | 4개 파일, ~35줄 |
