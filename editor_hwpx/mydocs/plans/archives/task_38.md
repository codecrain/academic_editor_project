# 타스크 38 수행계획서: HTML 표 붙여넣기 → HWP 표 컨트롤 변환

## 목표

클립보드에서 HTML `<table>` 태그가 포함된 내용을 붙여넣을 때, 현재 탭 구분 텍스트로 변환하는 방식 대신 HWP 문서의 네이티브 Table Control (`Control::Table`)을 생성하여 삽입한다.

## 현황 분석

### 현재 동작
- `parse_table_html()` (wasm_api.rs:3469)가 `<table>` HTML을 파싱
- `<tr>/<td>/<th>`에서 텍스트만 추출하여 탭(`\t`) 구분 텍스트 문단으로 생성
- 표 구조(행/열/병합/테두리/크기)가 모두 소실됨

### 목표 동작
- HTML `<table>` 구조를 완전히 파싱 (행/열, colspan/rowspan, CSS 스타일)
- HWP Table Control 생성 (Table 구조체 + Cell 구조체 + Paragraph 내용)
- CSS 스타일 → HWP 스타일 변환 (border → BorderFill, width/height → HWPUNIT, color → BGR)
- `\u{0002}` 제어문자를 포함하는 Paragraph에 Table Control을 부착하여 문서에 삽입

## 기술적 고려사항

### 1. 표 구조 파싱
| 항목 | HTML | HWP |
|------|------|-----|
| 행/열 수 | `<tr>/<td>` 개수 | `row_count`, `col_count` |
| 셀 병합 | `colspan`, `rowspan` 속성 | `Cell.col_span`, `Cell.row_span` |
| 셀 크기 | CSS `width`, `height` (pt/px) | `Cell.width`, `Cell.height` (HWPUNIT) |
| 셀 여백 | CSS `padding` | `Cell.padding` (HWPUNIT16) |
| 테두리 | CSS `border-*` | `BorderFill.borders[4]` |
| 배경색 | CSS `background-color` | `BorderFill.fill.solid` |
| 셀 내용 | 인라인 HTML | `Cell.paragraphs: Vec<Paragraph>` |

### 2. 단위 변환
- CSS pt → HWPUNIT: `1pt = 100 HWPUNIT` (1pt = 1/72인치, 7200/72 = 100)
- CSS px → HWPUNIT: `1px ≈ 75 HWPUNIT` (96dpi 기준, 7200/96 = 75)
- CSS color (#RRGGBB) → HWP BGR (0x00BBGGRR): 기존 `css_color_to_hwp_bgr()` 재사용

### 3. BorderFill 등록
- 셀별 테두리 스타일이 다를 수 있으므로 DocInfo에 BorderFill 항목 추가 필요
- 동일한 BorderFill이면 기존 항목 재사용 (ID 검색)
- `border_fill_id`를 Cell에 설정

### 4. Table Control 삽입 방식
- `copy_control_native()` (wasm_api.rs:2105) 패턴 참고
- `\u{0002}` 제어문자를 포함하는 Paragraph 생성
- `controls: vec![Control::Table(Box::new(table))]` 설정
- `char_shapes`, `line_segs` 등 메타데이터 설정
- 해당 Paragraph를 `parse_table_html()`이 반환하는 paragraphs 벡터에 추가

### 5. 호환성 소스
| 소스 | HTML 특징 |
|------|-----------|
| HWP 에디터 (자체) | `mso-` 접두사 CSS, 정밀한 pt 단위 |
| MS Word | `mso-*` 스타일, `class="MsoTableGrid"` |
| MS Excel | `class="xl"` 스타일, px 단위 |
| 웹 브라우저 | 다양한 CSS, `style` 속성 |
| Google Docs | 인라인 스타일 중심 |

## 범위 한정

### 포함
- `<table>/<tr>/<td>/<th>` 기본 구조 파싱
- colspan/rowspan 병합 처리
- CSS 크기(width/height) → HWPUNIT 변환
- CSS 테두리 → BorderFill 변환
- CSS 배경색 → Fill 변환
- 셀 내용 텍스트/서식 파싱 (기존 인라인 파서 재사용)

### 제외 (후속 타스크)
- 중첩 표 (nested table)
- 셀 내 이미지
- 표 캡션
- 셀 세로 정렬 (vertical-align) 고급 처리
