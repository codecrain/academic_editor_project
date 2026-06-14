# Task 229 완료보고서: 필드 컨트롤 파싱 및 기본 렌더링

## 구현 요약

HWP 바이너리 파일의 필드 컨트롤(`%clk`, `%hlk` 등)을 파싱하고, 누름틀(ClickHere) 안내문을 빨간색 기울임체로 렌더링하는 기능을 구현했다.

## 구현 내용

### 1단계: 필드 컨트롤 바이너리 파싱

- **`src/parser/tags.rs`**: 15개 필드 ctrl_id 상수 정의 (`FIELD_CLICKHERE`, `FIELD_HYPERLINK` 등) 및 `is_field_ctrl_id()` 함수 추가
- **`src/parser/control.rs`**: `parse_control()`에 필드 ctrl_id 매칭 추가, `parse_field_control()` 구현 (속성 4B + 기타속성 1B + command 가변 + id 4B 파싱)
- **`src/model/control.rs`**: `Field` struct에 `properties`, `extra_properties`, `field_id`, `ctrl_id` 필드 확장, `guide_text()` 메서드 추가

### 2단계: 필드 텍스트 범위 추적 및 렌더링

- **`src/model/paragraph.rs`**: `FieldRange` struct 추가 (start_char_idx, end_char_idx, control_idx), `Paragraph`에 `field_ranges` 필드 추가, insert/delete/split/merge 연산에서 field_ranges 처리
- **`src/parser/body_text.rs`**: `parse_para_text()`에서 0x03(FIELD_BEGIN)/0x04(FIELD_END) 위치를 추적하여 `FieldRange` 생성, extended 컨트롤 인덱스 카운터로 controls[] 대응
- **`src/renderer/layout/paragraph_layout.rs`**: `layout_composed_paragraph()`에서 빈 ClickHere 필드 감지 시 안내문 TextRunNode를 빨간색 기울임체로 삽입

### 3단계: 직렬화 및 테스트

- **`src/serializer/control.rs`**: `Control::Field`의 ctrl_id를 사용하여 CTRL_HEADER 레코드 생성
- **`src/serializer/body_text.rs`**: PARA_TEXT 직렬화 시 필드 ctrl_id 정확 기록
- **테스트 3건 추가**:
  - `test_task229_field_parsing`: 6개 ClickHere 필드 파싱 + 범위 추적 검증
  - `test_task229_field_roundtrip`: 직렬화→재파싱 라운드트립 검증
  - `test_task229_field_svg_guide_text`: SVG 안내문 렌더링 검증 (빨간색, 기울임체)

## 테스트 결과

- 전체 테스트: 700개 통과, 0개 실패, 1개 무시 (기존 무시 항목)
- samples/field-01.hwp: 6개 ClickHere 필드 파싱 성공, Unknown 필드 0개

## 렌더링 스타일

한컴 워드프로세서의 조판 부호 숨김 모드 기준:
- 빈 누름틀의 안내문 텍스트: **빨간색(`#ff0000`) 기울임체**
- 조판 부호(`[누름틀 시작/끝]`)는 뷰어 모드에서 숨김 (추후 편집 모드에서 토글 가능)

## 수정된 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/parser/tags.rs` | 필드 ctrl_id 상수 15개 + `is_field_ctrl_id()` |
| `src/parser/control.rs` | `parse_field_control()`, `ctrl_id_to_field_type()` |
| `src/parser/body_text.rs` | 필드 범위 추적 (char_count 기반), `is_extended_only_ctrl_char()` |
| `src/model/control.rs` | `Field` 확장, `guide_text()` 메서드 |
| `src/model/paragraph.rs` | `FieldRange` struct, `field_ranges` 필드, 편집 연산 처리 |
| `src/renderer/layout/paragraph_layout.rs` | 누름틀 안내문 TextRunNode 삽입 |
| `src/serializer/control.rs` | Field ctrl_id 직렬화 |
| `src/serializer/body_text.rs` | Field ctrl_id PARA_TEXT 직렬화 |
| `src/wasm_api/tests.rs` | 테스트 3건 추가 |
