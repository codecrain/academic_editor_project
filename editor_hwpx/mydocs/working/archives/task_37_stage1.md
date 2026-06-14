# 타스크 37 - 1단계 완료 보고서: 내부 클립보드 인프라 (WASM)

## 구현 내용

### 1. Clone derive 추가 (19개 타입)

클립보드 복사를 위해 IR 구조체를 복제 가능하도록 Clone derive를 추가했다.

| 파일 | 타입 |
|------|------|
| `src/model/paragraph.rs` | `Paragraph` |
| `src/model/control.rs` | `Control`, `HiddenComment` |
| `src/model/table.rs` | `Table`, `Cell` |
| `src/model/image.rs` | `Picture` |
| `src/model/shape.rs` | `ShapeObject`, `DrawingObjAttr`, `TextBox`, `LineShape`, `RectangleShape`, `EllipseShape`, `ArcShape`, `PolygonShape`, `CurveShape`, `GroupShape`, `Caption` |
| `src/model/header_footer.rs` | `Header`, `Footer` |
| `src/model/footnote.rs` | `Footnote`, `Endnote` |

### 2. ClipboardData 구조체

```rust
struct ClipboardData {
    paragraphs: Vec<Paragraph>,  // 서식 정보 포함 문단들
    plain_text: String,          // 플레인 텍스트
}
```

`HwpDocument` 구조체에 `clipboard: Option<ClipboardData>` 필드 추가.

### 3. 네이티브 API (8개 메서드)

| 메서드 | 설명 |
|--------|------|
| `has_internal_clipboard_native()` | 클립보드 데이터 유무 확인 |
| `get_clipboard_text_native()` | 플레인 텍스트 반환 |
| `clear_clipboard_native()` | 클립보드 초기화 |
| `copy_selection_native()` | 선택 영역 복사 (단일/다중 문단) |
| `copy_selection_in_cell_native()` | 셀 내부 선택 영역 복사 |
| `copy_control_native()` | 컨트롤 객체(표/이미지/도형) 복사 |
| `paste_internal_native()` | 내부 클립보드 붙여넣기 (본문) |
| `paste_internal_in_cell_native()` | 내부 클립보드 붙여넣기 (셀 내부) |

### 4. WASM 바인딩 (8개 JS API)

| JS 메서드 | WASM 바인딩 |
|-----------|-------------|
| `hasInternalClipboard()` | `has_internal_clipboard` |
| `getClipboardText()` | `get_clipboard_text` |
| `clearClipboard()` | `clear_clipboard` |
| `copySelection(secIdx, startPara, startOffset, endPara, endOffset)` | `copy_selection` |
| `copySelectionInCell(secIdx, parentPara, ctrlIdx, cellIdx, startCellPara, startOffset, endCellPara, endOffset)` | `copy_selection_in_cell` |
| `copyControl(secIdx, paraIdx, ctrlIdx)` | `copy_control` |
| `pasteInternal(secIdx, paraIdx, charOffset)` | `paste_internal` |
| `pasteInternalInCell(secIdx, parentPara, ctrlIdx, cellIdx, cellParaIdx, charOffset)` | `paste_internal_in_cell` |

### 5. 핵심 로직

#### 복사 전략
- **단일 문단 부분 선택**: 문단 clone → `split_at()`으로 양쪽 잘라내기
- **다중 문단 선택**: 첫 문단 잘라내기, 중간 문단 전체 복사, 마지막 문단 잘라내기
- **컨트롤 복사**: 컨트롤을 포함하는 단일 문단 생성

#### 붙여넣기 전략
- **단일 문단 텍스트 (컨트롤 없음)**: `insert_text_at()` + `apply_clipboard_char_shapes()`로 서식 보존
- **다중 문단/컨트롤**: `split_at()` → 첫 문단 merge → 중간 삽입 → 마지막 merge

#### 서식 보존
- 클립보드 문단의 `char_shapes` (글자 모양 참조)를 붙여넣기 대상에 적용
- UTF-16 위치 → char 인덱스 변환을 통해 정확한 범위 매핑
- 같은 문서 내 복사/붙여넣기이므로 CharShape ID 재매핑 불필요

## 테스트 결과

- 기존 테스트: 416 통과
- 신규 클립보드 테스트: 5 통과
- **총 421 테스트 통과**

### 신규 테스트 항목

| 테스트 | 검증 내용 |
|--------|-----------|
| `test_clipboard_copy_paste_single_paragraph` | 단일 문단 부분 복사 → 붙여넣기 |
| `test_clipboard_copy_paste_multi_paragraph` | 다중 문단 선택 복사 → 붙여넣기 |
| `test_clipboard_copy_control` | 표 컨트롤 복사 |
| `test_clipboard_clear` | 클립보드 초기화 |
| `test_clipboard_paste_empty` | 빈 클립보드 붙여넣기 처리 |

## 수정 파일 목록

| 파일 | 변경 |
|------|------|
| `src/model/paragraph.rs` | Clone derive 추가 |
| `src/model/control.rs` | Clone derive 추가 (Control, HiddenComment) |
| `src/model/table.rs` | Clone derive 추가 (Table, Cell) |
| `src/model/image.rs` | Clone derive 추가 (Picture) |
| `src/model/shape.rs` | Clone derive 추가 (11개 타입) |
| `src/model/header_footer.rs` | Clone derive 추가 (Header, Footer) |
| `src/model/footnote.rs` | Clone derive 추가 (Footnote, Endnote) |
| `src/wasm_api.rs` | ClipboardData, clipboard 필드, 8개 API + WASM 바인딩, 5개 테스트 |
