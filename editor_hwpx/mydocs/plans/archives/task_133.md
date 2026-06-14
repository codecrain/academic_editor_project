# 타스크 133 수행계획서 — 빈 문서 만들기 + 저장

## 배경

### 현재 문제

rhwp-studio는 기존 HWP 파일을 열어 보는 뷰어 기능만 제공한다. 메뉴 > 파일 > "새로 만들기" 항목이 있지만 `canExecute: () => false` (stub 상태)이다. 빈 문서를 생성하고, 텍스트를 입력하고, 유효한 HWP 파일로 저장하는 워드프로세서의 기본 기능이 없다.

### 선결 과제 (엔터키 버그)

빈 문서에서 워드프로세서 기능을 사용하려면 엔터키(문단 분할)가 정상 동작해야 한다. 현재 두 가지 버그가 확인됨:

1. **두 번째 엔터 무응답**: 빈 문서를 열고 캐럿 위치에서 엔터를 입력하면 첫 번째는 정상이지만, 이후 엔터에 아무 반응이 없음
2. **엔터 후 저장 시 파일 손상**: 엔터키를 입력한 후 저장하면 한컴에서 "파일이 손상되었습니다" 오류 발생

### 진단 결과 (blanK2020.hwp vs blanK2020_enter_saved_currupt.hwp)

| 항목 | 원본 (13,824B) | 손상 (12,800B) | 차이 |
|------|---------------|---------------|------|
| DocInfo | CS=7, PS=20, 75 records | 동일 | 없음 |
| BodyText records | 12개 | 18개 | +6 (정상: 2개 문단 추가) |
| para[0] PARA_HEADER | 24B, cc=17 | 24B, **cc=1** | **char_count가 컨트롤 미포함** |
| para[0] PARA_TEXT | 34B (컨트롤 포함) | 34B (동일) | cc=1인데 34B PARA_TEXT → **불일치=손상** |
| 신규 para PARA_HEADER | - | **22B** | 원본 24B 대비 **2B 부족** (mergeFlags 누락) |
| 파일 크기 차이 | - | -1,024B | raw_header_extra 유실 + 구조 불일치 |

### 근본 원인

`split_at()` (`src/model/paragraph.rs:480-507`)에 3가지 버그:

1. **char_count가 컨트롤 코드유닛 미포함**: `self.char_count = split_pos + 1` → 분할 후 남은 controls의 8×N 코드유닛이 반영되지 않음. cc=1이지만 PARA_TEXT에 컨트롤 데이터가 포함되어 HWP 파서가 "손상"으로 판단
2. **raw_header_extra 유실**: `raw_header_extra: Vec::new()` → 원본의 12바이트 메타데이터(instanceId+mergeFlags)가 사라짐. PARA_HEADER가 24B→22B로 축소
3. **LineSeg tag 폴백**: `tag: 0` 폴백값 → HWP 기본값 `0x00060000` 이어야 함

## 구현 단계 (4단계)

---

### 1단계: 엔터키(문단 분할) 버그 수정

**목적**: 빈 문서에서 엔터키가 반복 정상 동작하고, 엔터 후 저장해도 파일이 손상되지 않도록 수정

**파일**: `src/model/paragraph.rs`, `rhwp-studio/src/engine/command.ts`

**수정 A**: char_count에 컨트롤 코드유닛 반영 (`paragraph.rs:482`)
```rust
// 수정 전: self.char_count = split_pos as u32 + 1;
// 수정 후: 남은 컨트롤의 코드유닛(각 8개) 반영
let ctrl_code_units: u32 = self.controls.len() as u32 * 8;
self.char_count = split_pos as u32 + ctrl_code_units + 1;
```

**수정 B**: raw_header_extra 복사 (`paragraph.rs:507`)
```rust
// 수정 전: raw_header_extra: Vec::new(),
// 수정 후: 원본 메타데이터 복사 (counts는 직렬화 시 재계산)
raw_header_extra: self.raw_header_extra.clone(),
```

**수정 C**: LineSeg tag 폴백값 (`paragraph.rs:438`)
```rust
// 수정 전: _ => (400, 400, 320, 0, 0, 0),
// 수정 후: HWP 기본 플래그 적용
_ => (400, 400, 320, 0, 0, 0x00060000),
```

**수정 D**: SplitParagraphCommand 반환값 검사 (`command.ts:173-177`)
```typescript
// 수정 전: wasm.splitParagraph(sec, para, charOffset);
//          return { sectionIndex: sec, paragraphIndex: para + 1, charOffset: 0 };
// 수정 후:
const result = JSON.parse(wasm.splitParagraph(sec, para, charOffset));
if (result.ok) {
  return { sectionIndex: sec, paragraphIndex: result.paraIdx, charOffset: 0 };
}
return this.position;
```

---

### 2단계: WASM API — `createBlankDocument`

**목적**: 내장 템플릿에서 유효한 빈 HWP 문서를 생성하는 Rust 함수 추가

**파일**: `src/wasm_api.rs`

**접근 방식**: `include_bytes!("../saved/blank2010.hwp")`로 WASM에 템플릿 내장

**이유**: `Document::default()`는 유효한 HWP가 아님. FIX-4에서 DocInfo 재직렬화가 불완전. 한컴이 생성한 blank2010.hwp를 사용하면 DocInfo raw_stream이 유효하고 모든 필수 참조가 올바름.

**API**: `createBlankDocument() → JSON(version, sectionCount, pageCount, fontsUsed)`

---

### 3단계: WasmBridge + main.ts 통합

**목적**: JS에서 빈 문서 생성 → 문서 초기화 → 편집 가능 상태로 전환

**파일**: `rhwp-studio/src/core/wasm-bridge.ts`, `rhwp-studio/src/main.ts`

- WasmBridge에 `createNewDocument()` 메서드 추가
- `loadFile()`에서 공통 `initializeDocument()` 추출
- `createNewDocument()` 함수 생성 (eventBus 연결)

---

### 4단계: 커맨드 활성화 + 단축키 + 메뉴

**목적**: `file:new-doc` 커맨드를 활성화하고 사용자가 접근할 수 있게 함

**파일**: `rhwp-studio/src/command/commands/file.ts`, `rhwp-studio/src/command/shortcut-map.ts`

- `canExecute: () => true`, `execute` → `eventBus.emit('create-new-document')`
- Alt+N 단축키 추가 (한컴 표준, Ctrl+N은 브라우저 가로챔)

---

## 변경 파일 요약

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/model/paragraph.rs` | split_at() char_count/raw_header_extra/tag 수정 | ~5줄 |
| `src/wasm_api.rs` | createBlankDocument API 추가 | ~40줄 |
| `rhwp-studio/src/engine/command.ts` | SplitParagraphCommand 반환값 검사 | ~5줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | createNewDocument() 메서드 추가 | ~10줄 |
| `rhwp-studio/src/main.ts` | initializeDocument() 추출 + createNewDocument() | ~25줄 |
| `rhwp-studio/src/command/commands/file.ts` | file:new-doc 구현 | ~5줄 |
| `rhwp-studio/src/command/shortcut-map.ts` | Alt+N 단축키 추가 | ~2줄 |
| **합계** | | **~90줄** |

## 검증 방법

1. `docker compose run --rm test` — 회귀 테스트 전체 통과 확인
2. `docker compose run --rm wasm` — WASM 빌드 성공 확인
3. 브라우저에서 Alt+N 또는 메뉴 > 파일 > 새로 만들기 → 빈 문서 1페이지 생성 확인
4. 빈 문서에서 텍스트 입력 → 정상 렌더링 확인
5. 빈 문서에서 엔터키 반복 입력 → 문단 분할 정상 동작 확인
6. 빈 문서에서 텍스트 + 엔터 입력 후 Ctrl+S 저장 → 한컴에서 정상 오픈 확인
7. 저장한 파일을 rhwp-studio에서 다시 열기 → 내용 보존 확인
