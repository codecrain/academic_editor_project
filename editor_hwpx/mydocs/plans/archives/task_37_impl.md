# 타스크 37: 클립보드 복사 및 붙여넣기 기능 구현 - 구현 계획서

## 현재 클립보드 관련 코드

```
[기존 Ctrl+C 흐름 — text_selection.js:755-768]
SelectionController._onKeyDown()
  → this.layout.getSelectedText(anchor, focus)  // 플레인 텍스트 추출
  → navigator.clipboard.writeText(text)          // 텍스트만 복사

[기존 붙여넣기 — 미구현]
Ctrl+V 핸들러 없음
```

## 핵심 설계 결정

### 클립보드 데이터 전략

| 복사 방향 | 포맷 | 설명 |
|-----------|------|------|
| 내부 → 내부 | HWP 바이너리 (메모리) | WASM 내부 버퍼에 선택 영역 직렬화. 서식/표/이미지 완벽 보존 |
| 내부 → HWP | text/html + text/plain | HTML로 서식 텍스트/표 구조 전달. HWP가 HTML 붙여넣기 지원 |
| HWP → 내부 | text/html + text/plain | HWP가 클립보드에 등록하는 HTML 파싱. 서식/표 복원 |

### 브라우저 Clipboard API

```javascript
// 쓰기 (복사) — text/html + text/plain 동시 등록
const clipboardItem = new ClipboardItem({
    'text/html': new Blob([htmlString], { type: 'text/html' }),
    'text/plain': new Blob([plainText], { type: 'text/plain' }),
});
await navigator.clipboard.write([clipboardItem]);

// 읽기 (붙여넣기) — 포맷 우선순위 선택
const items = await navigator.clipboard.read();
for (const item of items) {
    if (item.types.includes('text/html')) { ... }
    else if (item.types.includes('text/plain')) { ... }
}
```

---

## 단계별 구현 계획

### 1단계: 내부 클립보드 인프라 (WASM) — P0

선택 영역을 HWP 바이너리로 직렬화하고, 바이너리를 파싱하여 문서에 삽입하는 WASM API 구축.

#### 1-1. 선택 영역 추출 → 미니 Document 생성

**`src/wasm_api.rs`** — `copy_selection()` 함수 추가

```rust
/// 선택 영역을 HWP 바이너리로 직렬화하여 내부 클립보드에 저장
pub fn copy_selection(&mut self, section_idx: u32, para_idx: u32,
                      start_offset: u32, end_offset: u32) -> String
```

**동작:**
1. 원본 문서에서 선택된 단락 범위 추출 (start_offset ~ end_offset)
2. 참조되는 스타일(CharShape, ParaShape, BorderFill, FontFace) 수집
3. 참조되는 BinData(이미지 등) 수집
4. 미니 Document IR 구성 (최소 DocInfo + 1개 Section)
5. `serialize_hwp()` → `Vec<u8>` → 내부 클립보드 버퍼 저장

셀 내부 선택 버전도 추가:
```rust
pub fn copy_selection_in_cell(&mut self, section_idx: u32, parent_para_idx: u32,
                               control_idx: u32, cell_idx: u32,
                               cell_para_idx: u32, start_offset: u32,
                               end_offset: u32) -> String
```

#### 1-2. 컨트롤 객체 복사

**`src/wasm_api.rs`** — `copy_control()` 함수 추가

```rust
/// 컨트롤 객체(표, 이미지, 도형)를 HWP 바이너리로 직렬화
pub fn copy_control(&mut self, section_idx: u32, para_idx: u32,
                    control_idx: u32) -> String
```

**동작:**
1. 지정 단락의 controls[control_idx] 추출
2. Control이 Table인 경우: 셀 내부의 모든 스타일/이미지 참조 수집
3. Control이 Picture인 경우: BinData 수집
4. 미니 Document에 단일 단락 + 해당 Control 포함
5. 직렬화 → 내부 버퍼 저장

#### 1-3. 내부 클립보드 붙여넣기

**`src/wasm_api.rs`** — `paste_internal()` 함수 추가

```rust
/// 내부 클립보드의 HWP 바이너리를 파싱하여 캐럿 위치에 삽입
pub fn paste_internal(&mut self, section_idx: u32, para_idx: u32,
                      char_offset: u32) -> String
```

**동작:**
1. 내부 버퍼의 HWP 바이너리를 `parse_hwp()` 로 파싱
2. 파싱된 Document에서 단락/컨트롤 추출
3. 대상 단락에 텍스트 삽입 or 컨트롤 삽입
   - 텍스트만 있는 경우: 기존 `insert_text_at()` 활용
   - 컨트롤이 있는 경우: 대상 Section의 단락 목록에 삽입
4. 스타일 ID 재매핑 (원본 DocInfo → 대상 DocInfo)
5. BinData 병합 (중복 제거)
6. reflow + compose + paginate

#### 1-4. 내부 클립보드 버퍼

**`src/wasm_api.rs`** — `HwpDocument` 구조체에 필드 추가

```rust
pub struct HwpDocument {
    // 기존 필드...
    clipboard_buffer: Option<Vec<u8>>,  // 내부 HWP 바이너리 클립보드
}
```

#### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | `clipboard_buffer` 필드, `copy_selection()`, `copy_control()`, `paste_internal()` |
| `src/wasm_api.rs` | 스타일 ID 재매핑 헬퍼, BinData 병합 헬퍼 |

---

### 2단계: 플레인 텍스트 붙여넣기 (JS) — P0

기본적인 Ctrl+V 처리와 플레인 텍스트 붙여넣기를 JS 측에서 구현.

#### 2-1. Ctrl+V 핸들러 추가

**`web/editor.js`** — keydown 핸들러에 Ctrl+V 추가

```javascript
if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault();
    handlePaste();
    return;
}
```

#### 2-2. handlePaste() 함수

**`web/editor.js`** — 붙여넣기 메인 함수

```javascript
async function handlePaste() {
    // 1. 내부 클립보드 우선 확인
    if (doc.hasInternalClipboard()) {
        pasteFromInternal();
        return;
    }
    // 2. 브라우저 클립보드 읽기
    try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            if (item.types.includes('text/html')) {
                const blob = await item.getType('text/html');
                const html = await blob.text();
                pasteFromHtml(html);
                return;
            }
        }
        // 3. fallback: 플레인 텍스트
        const text = await navigator.clipboard.readText();
        if (text) handleTextInsert(text);
    } catch (err) {
        // 4. execCommand fallback
        console.error('클립보드 읽기 실패:', err);
    }
}
```

#### 2-3. Ctrl+X (잘라내기) 추가

**`web/editor.js`** 및 **`web/text_selection.js`**

```javascript
// Ctrl+X = 복사 + 삭제
if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
    e.preventDefault();
    handleCut();
}
```

#### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `web/editor.js` | Ctrl+V/X 핸들러, `handlePaste()`, `handleCut()` |
| `web/text_selection.js` | Ctrl+C 확장 (내부 클립보드 동시 저장) |

---

### 3단계: 서식 텍스트 복사 — HTML 생성 (WASM + JS) — P1

선택 영역을 HTML로 변환하여 클립보드에 등록. HWP 편집기가 HTML을 붙여넣을 수 있도록 한다.

#### 3-1. 선택 영역 → HTML 변환

**`src/wasm_api.rs`** — `export_selection_html()` 함수 추가

```rust
/// 선택 영역을 HTML 문자열로 변환
pub fn export_selection_html(&self, section_idx: u32, para_idx: u32,
                              start_offset: u32, end_offset: u32) -> String
```

**HTML 출력 구조:**
```html
<div style="font-family:'함초롬돋움'; font-size:10pt; ...">
  <p style="text-align:justify; margin-left:0px; ...">
    <span style="font-weight:bold; color:#000000; ...">선택된 텍스트</span>
  </p>
</div>
```

#### 3-2. 컨트롤 객체 → HTML 변환

표의 경우:
```html
<table border="1" style="border-collapse:collapse; ...">
  <tr>
    <td style="padding:5px; ...">셀 내용</td>
    <td>...</td>
  </tr>
</table>
```

이미지의 경우:
```html
<img src="data:image/png;base64,..." width="..." height="..."/>
```

#### 3-3. 클립보드에 HTML + 플레인 텍스트 동시 등록

**`web/text_selection.js`** — Ctrl+C 수정

```javascript
// 기존 텍스트 복사 + HTML 복사 + 내부 클립보드 저장
const plainText = this.layout.getSelectedText(this.anchor, this.focus);
const html = doc.exportSelectionHtml(secIdx, paraIdx, startOffset, endOffset);
doc.copySelection(secIdx, paraIdx, startOffset, endOffset); // 내부 버퍼

const clipboardItem = new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([plainText], { type: 'text/plain' }),
});
await navigator.clipboard.write([clipboardItem]);
```

#### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | `export_selection_html()`, `export_control_html()` |
| `web/text_selection.js` | Ctrl+C 확장 — ClipboardItem으로 HTML+텍스트 동시 등록 |
| `web/editor.js` | 컨트롤 객체 복사 시 HTML 생성 경로 |

---

### 4단계: HTML 붙여넣기 파싱 — P1

외부 클립보드(HWP 편집기 등)에서 복사한 HTML을 파싱하여 서식/구조를 복원.

#### 4-1. HTML → Document IR 변환

**`src/wasm_api.rs`** — `paste_html()` 함수 추가

```rust
/// HTML 문자열을 파싱하여 캐럿 위치에 삽입
pub fn paste_html(&mut self, section_idx: u32, para_idx: u32,
                  char_offset: u32, html: &str) -> String
```

**파싱 전략:**
1. 간단한 HTML 파서 (외부 크레이트 없이 직접 구현 또는 최소 파서)
2. 지원 태그: `<p>`, `<span>`, `<b>`, `<i>`, `<u>`, `<table>`, `<tr>`, `<td>`, `<img>`, `<br>`
3. CSS 인라인 스타일 파싱: `font-family`, `font-size`, `font-weight`, `color`, `text-align` 등
4. 표 구조 복원: `<table>` → Table Control 생성
5. 이미지 복원: `<img src="data:...">` → BinData + Picture Control

#### 4-2. 스타일 매핑

외부 HTML의 CSS 스타일을 문서의 CharShape/ParaShape로 매핑:
- `font-family` → FontFace 검색 또는 생성 → CharShape.font_ids
- `font-size` → CharShape.base_size (pt → HWPUNIT)
- `font-weight: bold` → CharShape.bold
- `color` → CharShape.text_color (CSS RGB → HWP BGR)
- `text-align` → ParaShape.alignment

#### 4-3. JS 측 HTML 붙여넣기 경로

**`web/editor.js`** — `pasteFromHtml()` 함수

```javascript
function pasteFromHtml(html) {
    const docPos = selectionController.getDocumentPos();
    if (!docPos) return;
    // 선택 범위 삭제 (있으면)
    deleteSelectionIfAny();
    // WASM 호출
    const resultJson = doc.pasteHtml(docPos.secIdx, docPos.paraIdx, docPos.charOffset, html);
    // 재렌더링 + 캐럿 복원
    renderAndRestoreCaret(resultJson, docPos);
}
```

#### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | `paste_html()` 함수, HTML 파서, 스타일 매핑 |
| `web/editor.js` | `pasteFromHtml()` 함수, HTML 붙여넣기 경로 |

---

## 의존 관계

```
1단계 (내부 클립보드) ──→ 독립 수행 가능
2단계 (플레인 텍스트)  ──→ 독립 수행 가능 (1단계와 병렬 가능하나 순차 진행)
3단계 (HTML 생성)     ──→ 2단계에 의존 (클립보드 쓰기 경로 필요)
4단계 (HTML 파싱)     ──→ 2단계에 의존 (클립보드 읽기 경로 필요)
```

## 위험 요소

| 위험 | 대응 |
|------|------|
| 스타일 ID 재매핑 복잡도 | CharShape/ParaShape/BorderFill 동일성 비교 → 기존 ID 재사용 or 신규 생성 |
| HTML 파서 없는 환경 (no_std WASM) | 최소 태그 파서 직접 구현 또는 JS에서 DOMParser 사용 후 구조화 데이터 전달 |
| 이미지 base64 크기 | 대용량 이미지 경고, 선택적 포함 |
| 클립보드 권한 (HTTPS 필요) | HTTP 환경에서 execCommand fallback |

## 검증 기준

- **1단계**: 내부 복사/붙여넣기 — 서식 텍스트, 표, 이미지 보존 확인
- **2단계**: Ctrl+V로 외부 텍스트 붙여넣기 동작 확인
- **3단계**: Ctrl+C로 복사한 내용이 HWP 편집기에서 서식 유지되어 붙여넣어지는지 확인
- **4단계**: HWP 편집기에서 복사한 표가 우리 에디터에 구조 유지되어 붙여넣어지는지 확인
- 기존 테스트 전체 통과
- WASM 빌드 정상
