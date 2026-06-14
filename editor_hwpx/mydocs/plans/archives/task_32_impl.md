# 타스크 32: 서식 툴바 구현 — 구현 계획서

## 구현 단계 (6단계)

---

## 1단계: 텍스트 레이아웃 JSON 확장 + 속성 조회 API (Rust)

### 목표
기존 `getPageTextLayout` JSON에 서식 속성을 추가하고, 위치 기반 속성 조회 API를 추가한다.

### 변경 사항

**`src/wasm_api.rs`** — `get_page_text_layout_native()` (line 478~)

기존 `font_info` 문자열에 추가 필드 포함:
```rust
// 기존: fontFamily, fontSize, bold, italic, ratio, letterSpacing
// 추가: underline, strikethrough, textColor, charShapeId
let extended_info = format!(
    ",\"underline\":{},\"strikethrough\":{},\"textColor\":\"{}\"",
    text_run.style.underline,
    text_run.style.strikethrough,
    color_ref_to_css(text_run.style.color),
);
```

TextRunNode에 `char_shape_id` 필드 추가 필요 → `render_tree.rs` 수정.

문단 속성도 run에 포함:
```rust
// paraShapeId, alignment, lineSpacing
",\"alignment\":\"{}\",\"lineSpacing\":{}"
```

이를 위해 TextRunNode에 para_shape_id, alignment 정보 전달 필요.

**`src/renderer/render_tree.rs`** — TextRunNode 확장

```rust
pub struct TextRunNode {
    // 기존 필드...
    pub char_shape_id: Option<u32>,      // 추가
    pub para_shape_id: Option<u16>,      // 추가
}
```

**`src/renderer/layout.rs`** — TextRunNode 생성 시 char_shape_id, para_shape_id 전달

**`src/model/paragraph.rs`** — `char_shape_id_at()` 헬퍼

```rust
impl Paragraph {
    /// 주어진 문자 위치(UTF-8 인덱스)에 적용되는 CharShape ID를 반환
    pub fn char_shape_id_at(&self, char_offset: usize) -> u32 {
        let utf16_pos = self.char_offsets.get(char_offset).copied().unwrap_or(0);
        self.char_shapes.iter()
            .rev()
            .find(|cs| cs.start_pos <= utf16_pos)
            .map(|cs| cs.char_shape_id)
            .unwrap_or(0)
    }
}
```

**`src/wasm_api.rs`** — 새 API 2개

```rust
#[wasm_bindgen(js_name = getCharPropertiesAt)]
pub fn get_char_properties_at(&self, sec_idx: u32, para_idx: u32, char_offset: u32) -> Result<String, JsValue>
// → JSON: {fontFamily, fontSize, bold, italic, underline, strikethrough, textColor, shadeColor, charShapeId}

#[wasm_bindgen(js_name = getParaPropertiesAt)]
pub fn get_para_properties_at(&self, sec_idx: u32, para_idx: u32) -> Result<String, JsValue>
// → JSON: {alignment, lineSpacing, lineSpacingType, marginLeft, marginRight, indent, headType, paraLevel}
```

**유틸리티 함수** — `color_ref_to_css()`

```rust
/// HWP ColorRef (0x00BBGGRR) → CSS hex (#RRGGBB)
fn color_ref_to_css(color: u32) -> String {
    let r = color & 0xFF;
    let g = (color >> 8) & 0xFF;
    let b = (color >> 16) & 0xFF;
    format!("#{:02x}{:02x}{:02x}", r, g, b)
}
```

### 검증
- 기존 테스트 전체 통과
- 새 API 단위 테스트
- JS에서 JSON 파싱 확인

---

## 2단계: CharShape/ParaShape 변경 로직 (Rust)

### 목표
서식 적용 시 CharShape/ParaShape를 안전하게 생성/변경하는 로직 구현.

### 변경 사항

**`src/model/paragraph.rs`** — `apply_char_shape_range()`

```rust
impl Paragraph {
    /// [start_offset, end_offset) 범위에 new_char_shape_id를 적용
    /// CharShapeRef 배열을 분할/교체한다
    pub fn apply_char_shape_range(
        &mut self,
        start_char_offset: usize,
        end_char_offset: usize,
        new_char_shape_id: u32,
    ) {
        // 1. UTF-8 → UTF-16 변환
        // 2. 겹치는 CharShapeRef 찾기
        // 3. 부분 겹침 시 분할
        // 4. 완전 겹침 시 교체
        // 5. 연속 동일 ID 병합
    }
}
```

**`src/model/document.rs`** — CharShape/ParaShape 관리

```rust
impl Document {
    /// 기존 CharShape를 복제하고 수정사항을 적용한 후, 동일한 것이 있으면 재사용
    pub fn find_or_create_char_shape(&mut self, base_id: u32, mods: &CharShapeMods) -> u32

    /// 기존 ParaShape를 복제하고 수정사항을 적용한 후, 동일한 것이 있으면 재사용
    pub fn find_or_create_para_shape(&mut self, base_id: u16, mods: &ParaShapeMods) -> u16
}
```

**`src/model/style.rs`** — 수정 사항 구조체

```rust
/// 글자 모양 수정 사항 (None이면 변경 안 함)
pub struct CharShapeMods {
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub underline: Option<bool>,
    pub strikethrough: Option<bool>,
    pub font_id: Option<u16>,
    pub base_size: Option<i32>,
    pub text_color: Option<ColorRef>,
    pub shade_color: Option<ColorRef>,
}

/// 문단 모양 수정 사항
pub struct ParaShapeMods {
    pub alignment: Option<Alignment>,
    pub line_spacing: Option<i32>,
    pub line_spacing_type: Option<LineSpacingType>,
    pub indent: Option<i32>,
}
```

**`src/model/style.rs`** — CharShape/ParaShape에 `PartialEq` derive 추가

```rust
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CharShape { ... }

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ParaShape { ... }
```

### 검증
- `apply_char_shape_range` 단위 테스트 (범위 전체, 부분 왼쪽, 부분 오른쪽, 여러 범위 걸침)
- `find_or_create_char_shape` 중복 제거 테스트
- 기존 테스트 전체 통과

---

## 3단계: WASM 서식 적용 API (Rust)

### 목표
JS에서 호출 가능한 서식 적용 API 구현.

### 변경 사항

**`src/wasm_api.rs`** — 4개 API 추가

```rust
#[wasm_bindgen(js_name = applyCharFormat)]
pub fn apply_char_format(
    &mut self, sec_idx: u32, para_idx: u32,
    start_offset: u32, end_offset: u32,
    props_json: &str,
) -> Result<String, JsValue>

#[wasm_bindgen(js_name = applyCharFormatInCell)]
pub fn apply_char_format_in_cell(
    &mut self, sec_idx: u32, parent_para_idx: u32, control_idx: u32,
    cell_idx: u32, cell_para_idx: u32,
    start_offset: u32, end_offset: u32,
    props_json: &str,
) -> Result<String, JsValue>

#[wasm_bindgen(js_name = applyParaFormat)]
pub fn apply_para_format(
    &mut self, sec_idx: u32, para_idx: u32,
    props_json: &str,
) -> Result<String, JsValue>

#[wasm_bindgen(js_name = applyParaFormatInCell)]
pub fn apply_para_format_in_cell(
    &mut self, sec_idx: u32, parent_para_idx: u32, control_idx: u32,
    cell_idx: u32, cell_para_idx: u32,
    props_json: &str,
) -> Result<String, JsValue>
```

**`applyCharFormat` 내부 처리 흐름:**

1. `props_json` 파싱 → `CharShapeMods` 생성
2. 대상 문단 참조 획득
3. 범위 내 각 CharShapeRef 구간별로:
   - `find_or_create_char_shape(base_id, mods)` → 새 ID
   - `paragraph.apply_char_shape_range(start, end, new_id)`
4. `doc_info.raw_stream = None` (직렬화 무효화)
5. `self.rebuild()` 호출 (스타일 재해석 → 재조판 → 재페이지네이션)
6. `{ok: true}` 반환

**공통 `rebuild()` 메서드:**

```rust
fn rebuild(&mut self) {
    self.styles = resolve_styles(&self.document.doc_info);
    self.composed = self.document.sections.iter()
        .map(|sec| compose_section(sec, &self.styles, self.dpi))
        .collect();
    self.paginate();
}
```

### 검증
- 통합 테스트: 서식 적용 후 text_layout JSON에서 변경 확인
- 셀 내 서식 적용 테스트
- 기존 테스트 전체 통과

---

## 4단계: 툴바 UI (HTML/CSS)

### 목표
webhwp과 동일한 서식 툴바 UI 구현.

### 변경 사항

**`web/editor.html`** — 기존 `#toolbar` 아래에 `#format-toolbar` 추가

```
[↶ ↷] | [글꼴 ▼] [크기 ▼] [A▲ A▼] | [B I U S] | [A색 HL색] | [≡L ≡C ≡R ≡J ≡D] | [↕줄간격] | [•목록 1.목록] | [→들여 ←내어]
```

각 버튼은 `data-command` 속성으로 명령 식별:
- `data-command="bold"`, `data-command="italic"` 등
- 토글 버튼: `.toggle-btn` 클래스
- 드롭다운: `<select>` 태그
- 색상: `.color-btn-wrapper` + `.color-indicator`

`format_toolbar.js` 스크립트 로드를 `<head>`에 추가.

**`web/editor.css`** — 서식 툴바 스타일

```css
#format-toolbar { height: 36px; border-bottom: 1px solid #ddd; display: flex; align-items: center; padding: 0 8px; gap: 2px; }
.toolbar-group { display: flex; align-items: center; gap: 2px; }
.toolbar-separator { width: 1px; height: 24px; background: #ddd; margin: 0 4px; }
.toolbar-select { height: 26px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px; }
.toggle-btn.active { background: #d0e0f0; border-color: #4a8bc2; }
.color-indicator { height: 3px; margin-top: -2px; }
```

### 검증
- 브라우저에서 편집기 열기 → 툴바 레이아웃 확인
- 문서 미로드 시 `hidden` 클래스로 숨김

---

## 5단계: 속성 반영 (JavaScript)

### 목표
캐럿/선택 변경 시 툴바에 현재 속성을 실시간 반영.

### 변경 사항

**새 파일 `web/format_toolbar.js`** — FormatToolbar 클래스

```javascript
class FormatToolbar {
    constructor(toolbarEl, doc) { ... }

    // 캐럿 변경 시 호출
    updateFromCaret(runs, caretPos, selectionRange) {
        const props = selectionRange
            ? this._getMergedProps(runs, selectionRange)
            : this._getRunProps(runs, caretPos);
        this._reflectToUI(props);
    }

    // 단일 run에서 속성 읽기
    _getRunProps(runs, caretPos) {
        const run = runs[caretPos.runIndex];
        return { fontFamily, fontSize, bold, italic, underline, strikethrough, textColor, alignment, ... };
    }

    // 선택 범위의 공통 속성 계산
    _getMergedProps(runs, range) {
        // 범위 내 모든 run 순회
        // 속성값이 동일하면 유지, 다르면 'mixed'
    }

    // UI에 속성 반영
    _reflectToUI(props) {
        // 글꼴 이름 select 값 설정
        // 글꼴 크기 select 값 설정
        // 토글 버튼 active 클래스
        // 색상 표시기 배경색
        // 정렬 버튼 active
    }
}
```

**`web/text_selection.js`** — SelectionController에 콜백 추가

```javascript
// 기존 캐럿 이동/선택 변경 코드에:
if (this.onCaretChange) {
    this.onCaretChange(this.caretPos, this.getSelectionRange());
}
```

**`web/editor.js`** — 초기화

```javascript
// 문서 로드 후
formatToolbar = new FormatToolbar(document.getElementById('format-toolbar'), doc);
selectionController.onCaretChange = (caretPos, selRange) => {
    formatToolbar.updateFromCaret(textLayout.runs, caretPos, selRange);
};
```

### 검증
- 문서 로드 → 텍스트 클릭 → 툴바에 글꼴/크기/서식 반영 확인
- 다른 서식의 텍스트 클릭 → 값 변경 확인
- 혼합 서식 선택 → indeterminate 표시 확인

---

## 6단계: 서식 명령 (JavaScript)

### 목표
툴바 버튼 클릭 및 단축키로 서식을 적용.

### 변경 사항

**`web/format_toolbar.js`** — 명령 핸들러

```javascript
// 토글 명령 (bold, italic, underline, strikethrough)
_handleToggle(property) {
    const newValue = this._currentProps[property] !== true;
    this._applyCharFormat({ [property]: newValue });
}

// 서식 적용 공통 로직
_applyCharFormat(props) {
    const range = this._getEditRange();
    const json = JSON.stringify(props);
    // Cell 여부에 따라 applyCharFormat / applyCharFormatInCell 호출
    doc.applyCharFormat(range.secIdx, range.paraIdx, range.start, range.end, json);
    renderCurrentPage();
    restoreCaretPosition();
}

// 문단 정렬
_handleAlignment(alignment) {
    this._applyParaFormat({ alignment });
}

// 글꼴 크기 증감
// HWP 표준 크기: [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]
```

**`web/editor.js`** — 단축키

```javascript
// keydown 이벤트에 추가:
if (ctrl && key === 'b') formatToolbar.toggleBold();
if (ctrl && key === 'i') formatToolbar.toggleItalic();
if (ctrl && key === 'u') formatToolbar.toggleUnderline();
```

**색상 팔레트 팝업** — `format_toolbar.js` 내

```javascript
// 기본 16색 팔레트
const COLORS = [
    '#000000', '#FF0000', '#FF8000', '#FFFF00',
    '#00FF00', '#00FFFF', '#0000FF', '#FF00FF',
    '#808080', '#C00000', '#C08000', '#C0C000',
    '#00C000', '#00C0C0', '#0000C0', '#C000C0',
];
```

### 검증
- 텍스트 선택 → 굵게 클릭 → 텍스트 굵게 변경 확인
- Ctrl+B 단축키 동작 확인
- 글꼴 변경, 크기 변경, 색상 변경 확인
- 정렬 변경 확인
- 서식 적용 후 저장 → 재로드 → 서식 유지 확인
- 표 셀 내 서식 적용 확인

---

## 파일 변경 요약

| 단계 | 파일 | 변경 내용 |
|------|------|----------|
| 1 | `src/wasm_api.rs` | JSON 확장, getCharPropertiesAt, getParaPropertiesAt |
| 1 | `src/renderer/render_tree.rs` | TextRunNode에 char_shape_id, para_shape_id 추가 |
| 1 | `src/renderer/layout.rs` | TextRunNode 생성 시 ID 전달 |
| 1 | `src/model/paragraph.rs` | char_shape_id_at() |
| 2 | `src/model/paragraph.rs` | apply_char_shape_range() |
| 2 | `src/model/document.rs` | find_or_create_char_shape/para_shape |
| 2 | `src/model/style.rs` | CharShapeMods, ParaShapeMods, PartialEq |
| 3 | `src/wasm_api.rs` | applyCharFormat, applyParaFormat + Cell 변형, rebuild() |
| 4 | `web/editor.html` | format-toolbar HTML |
| 4 | `web/editor.css` | 서식 툴바 CSS |
| 5 | `web/format_toolbar.js` | FormatToolbar 클래스 (신규) |
| 5 | `web/text_selection.js` | onCaretChange 콜백 |
| 5 | `web/editor.js` | 초기화 연결 |
| 6 | `web/format_toolbar.js` | 명령 핸들러, 색상 팔레트 |
| 6 | `web/editor.js` | Ctrl+B/I/U 단축키 |
