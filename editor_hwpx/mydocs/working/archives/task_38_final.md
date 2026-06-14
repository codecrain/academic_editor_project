# 타스크 38 최종 결과 보고서: HTML 표 붙여넣기 → HWP 표 컨트롤 변환

## 개요

클립보드에서 HTML `<table>` 태그가 포함된 내용을 붙여넣을 때, 이전에 탭 구분 텍스트로만 변환하던 방식을 HWP 네이티브 Table Control(`Control::Table`)로 변환하도록 구현했다.

## 구현 내용

### 1~2단계 통합: HTML 표 파싱 + Table Control 생성

`parse_table_html()` 함수를 완전 재구현하여 6단계 처리 파이프라인을 구축했다:

| 단계 | 내용 |
|------|------|
| 1 | HTML 파싱: `<tr>/<td>/<th>` 구조, colspan/rowspan, CSS 스타일 추출 |
| 2 | 그리드 정규화: rowspan으로 인한 셀 점유 그리드(occupied grid) 생성, 실제 col 인덱스 계산 |
| 3 | 셀 크기 계산: CSS pt/px/cm → HWPUNIT 변환, 미지정 열 균등 분할 |
| 4 | BorderFill 생성: CSS border → BorderLine, background-color → SolidFill, 동일 항목 재사용 |
| 5 | Table 구조체 조립: Cell, row_sizes, raw_ctrl_data(CommonObjAttr), repeat_header 설정 |
| 6 | Table Control Paragraph 생성: `\u{0002}` 제어문자, `Control::Table` 부착 |

### 3단계: 통합 및 호환성

| 항목 | 내용 |
|------|------|
| `paste_html_native` 확장 | 컨트롤 포함 문단 감지 시 직접 삽입 경로 추가 (merge_from은 controls 미전파) |
| `paste_html_in_cell_native` 보호 | 셀 내부에 Table 중첩 불가 → 컨트롤 문단 자동 텍스트 변환 |
| CSS 파싱 | border 축약형/개별, padding 축약형/개별, width/height (pt/px/cm/mm/in) |
| BorderFill 중복 방지 | 동일 BorderFill 검색 후 재사용, border_fill_id 1-based |

## 신규 함수 총괄

### wasm_api.rs 메서드 (HwpDocument impl)

| 함수 | 설명 |
|------|------|
| `parse_table_html()` | HTML `<table>` → Table Control 파싱/생성 (완전 재구현) |
| `create_border_fill_from_css()` | CSS 테두리/배경 → BorderFill 생성 및 DocInfo 등록 |

### 유틸리티 함수 (모듈 수준)

| 함수 | 설명 |
|------|------|
| `parse_html_attr_u16()` | HTML 속성에서 u16 값 추출 (colspan, rowspan) |
| `parse_css_dimension_pt()` | CSS 치수값 → pt 변환 (pt/px/cm/mm/in 지원) |
| `parse_css_padding_pt()` | CSS padding 축약형/개별 → [left, right, top, bottom] pt |
| `parse_single_dimension_pt()` | 단일 CSS 치수 → pt 변환 |
| `parse_css_border_shorthand()` | CSS border 축약형 → (width, color, style) |
| `css_border_width_to_hwp()` | CSS border 두께(pt) → HWP width 인덱스 (0~7) |
| `border_fills_equal()` | 두 BorderFill 동등성 비교 |

## 수정 파일 총괄

| 파일 | 변경 내용 |
|------|-----------|
| `src/wasm_api.rs` | `parse_table_html()` 재구현 (~230행), `create_border_fill_from_css()` 추가, `paste_html_native()` 컨트롤 삽입 경로 추가, `paste_html_in_cell_native()` 중첩 방지, 유틸리티 함수 7개, 테스트 5개 |

## 데이터 흐름

```
HTML 클립보드 (<table> 포함)
  ↓ parse_html_to_paragraphs()
  ↓   └─ <table> 감지 → parse_table_html()
  ↓       ├─ HTML 파싱 (tr/td/th, colspan, rowspan, CSS)
  ↓       ├─ 그리드 정규화 (occupied grid)
  ↓       ├─ 셀 크기 계산 (CSS → HWPUNIT)
  ↓       ├─ BorderFill 생성/재사용
  ↓       ├─ Cell 생성 (내용은 parse_html_to_paragraphs 재귀 호출)
  ↓       ├─ Table 구조체 조립
  ↓       └─ Paragraph { text: "\u{0002}", controls: [Table] }
  ↓
  paste_html_native()
  ↓ has_controls == true → 직접 삽입 경로
  ↓   ├─ split_at(cursor)
  ↓   ├─ 좌반 비어있으면 Table 문단으로 대체
  ↓   ├─ 우반 비어있지 않으면 새 문단으로 추가
  ↓   └─ reflow + compose + paginate
  ↓
  문서에 Table Control 삽입 완료
```

## 테스트 결과

| 구분 | 테스트 수 |
|------|-----------|
| 기존 테스트 | 428 (기존 429 - 1 텍스트→컨트롤 전환) |
| 신규: 2×2 기본 표 삽입 | 1 |
| 신규: colspan/rowspan 병합 표 | 1 |
| 신규: CSS 스타일 (크기/테두리/패딩/배경) | 1 |
| 신규: th 헤더 행 표 | 1 |
| 신규: 유틸리티 함수 테스트 | 1 |
| **총 합계** | **433 통과** |
| WASM 빌드 | 성공 |

## 기술적 결정 사항

| 결정 | 근거 |
|------|------|
| 1~2단계 통합 구현 | 중간 구조체가 함수 내부에서만 사용되어 분리 불필요 |
| merge_from 대신 직접 삽입 | Paragraph.merge_from()이 controls를 전파하지 않아 Table Control 소실 방지 |
| 셀 내부 Table 중첩 방지 | HWP 스펙에서 셀 내 Table Control 미지원, 텍스트 fallback |
| occupied grid 기반 그리드 정규화 | rowspan으로 인한 셀 위치 어긋남 방지 |
| BorderFill 동일성 검사 후 재사용 | DocInfo 비대화 방지, border_fill_id 1-based |
| 미지정 셀 크기 균등 분할 | A4 기본 폭(42520 HWPUNIT) ÷ col_count |

## CSS → HWP 단위 변환 참조

| CSS | HWP | 변환 |
|-----|-----|------|
| 1pt | 100 HWPUNIT | × 100 |
| 1px | 75 HWPUNIT | × 75 (96dpi 기준) |
| 1cm | 2834.65 HWPUNIT | × 2834.65 |
| 1mm | 283.465 HWPUNIT | × 283.465 |
| 1in | 7200 HWPUNIT | × 7200 |
| border width (pt → mm) | width index 0~7 | 0.1mm~0.5mm 범위 매핑 |
