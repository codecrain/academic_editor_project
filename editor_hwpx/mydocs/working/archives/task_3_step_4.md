# 타스크 3 - 4단계 완료 보고서: 컨트롤 파싱 (표, 도형, 그림, 머리말/꼬리말)

## 수행 내용

### 생성/수정된 파일

| 파일 | 라인 | 설명 |
|------|------|------|
| `src/parser/control.rs` | ~610 | 컨트롤 파싱 (표, 도형, 그림, 머리말/꼬리말, 각주/미주, 숨은 설명, 단순 컨트롤) |
| `src/parser/bin_data.rs` | ~91 | BinData 스토리지 추출 유틸리티 |
| `src/parser/body_text.rs` | 수정 | parse_paragraph/parse_paragraph_list 공개, 컨트롤 위임 |
| `src/parser/mod.rs` | +2 | control, bin_data 모듈 등록 |

### 구현 상세

#### control.rs - 컨트롤 파싱 디스패처

`parse_control(ctrl_id, ctrl_data, child_records) -> Control`

body_text.rs의 `parse_ctrl_header`에서 secd/cold 이외의 컨트롤을 위임받아 파싱한다.

##### 지원 컨트롤 목록

| ctrl_id | 컨트롤 | 파싱 함수 | 출력 |
|---------|--------|-----------|------|
| `tbl ` | 표 | `parse_table_control()` | `Control::Table(Table)` |
| `gso ` | 그리기 객체 | `parse_gso_control()` | `Control::Shape(CommonObjAttr, ShapeObject)` |
| `daeh` | 머리말 | `parse_header_control()` | `Control::Header(Header)` |
| `toof` | 꼬리말 | `parse_footer_control()` | `Control::Footer(Footer)` |
| `fn  ` | 각주 | `parse_footnote_control()` | `Control::Footnote(Footnote)` |
| `en  ` | 미주 | `parse_endnote_control()` | `Control::Endnote(Endnote)` |
| `tcmt` | 숨은 설명 | `parse_hidden_comment_control()` | `Control::HiddenComment(HiddenComment)` |
| `atno` | 자동 번호 | `parse_auto_number()` | `Control::AutoNumber(AutoNumber)` |
| `nwno` | 새 번호 | `parse_new_number()` | `Control::NewNumber(NewNumber)` |
| `pgnp` | 쪽 번호 위치 | `parse_page_num_pos()` | `Control::PageNumberPos(PageNumberPos)` |
| `pghi` | 감추기 | `parse_page_hide()` | `Control::PageHide(PageHide)` |
| `bokm` | 책갈피 | `parse_bookmark()` | `Control::Bookmark(Bookmark)` |
| 기타 | 미등록 | - | `Control::Unknown(UnknownControl)` |

##### 표 파싱 구조

```
CTRL_HEADER (tbl) → parse_table_control
  ├── HWPTAG_TABLE → parse_table_record (행수, 열수, 셀간격, 테두리)
  └── HWPTAG_LIST_HEADER × N → parse_cell (각 셀)
       └── HWPTAG_PARA_HEADER × M → parse_paragraph_list (셀 내 문단)
```

- `parse_table_record()`: row_count, col_count, cell_spacing, padding, border_fill_id
- `parse_cell()`: row_addr, col_addr, row_span, col_span, width, height, padding, border_fill_id, vert_align + 내부 문단

##### 도형/그림 파싱 구조

```
CTRL_HEADER (gso) → parse_gso_control
  ├── parse_common_obj_attr (공통 속성: 위치, 크기, 래핑)
  └── HWPTAG_SHAPE_COMPONENT → parse_shape_component_attr
       ├── HWPTAG_SHAPE_COMPONENT_LINE → LineShape
       ├── HWPTAG_SHAPE_COMPONENT_RECTANGLE → RectangleShape
       └── HWPTAG_SHAPE_COMPONENT_PICTURE → Picture
```

- `parse_common_obj_attr()`: ctrl_data에서 속성 비트, 수직/수평 기준, wrap, 위치/크기 추출
- `parse_shape_component_attr()`: offset_x, offset_y, rotation, scale_x, scale_y
- `parse_picture()`: bin_data_id, border 정보, crop 정보
- `parse_line_shape_data()`: start_x, start_y, end_x, end_y
- `parse_rect_shape_data()`: round_ratio

##### 머리말/꼬리말, 각주/미주 파싱

`find_list_header_paragraphs()` 헬퍼를 사용하여 LIST_HEADER 하위의 문단을 재귀적으로 파싱:

```
CTRL_HEADER (daeh/toof/fn/en) → parse_header/footer/footnote_control
  └── HWPTAG_LIST_HEADER
       └── HWPTAG_PARA_HEADER × N → parse_paragraph_list
```

#### bin_data.rs - BinData 스토리지 추출

| 함수 | 설명 |
|------|------|
| `extract_all_bin_data()` | CFB의 BinData/ 하위 모든 스트림 추출 |
| `bin_data_storage_name()` | bin_id → "BIN{XXXX}.{ext}" 변환 (XXXX = ID+1, 16진수 4자리) |
| `read_bin_data_by_name()` | 특정 이름의 BinData 읽기 |

#### body_text.rs 변경사항

- `parse_paragraph()`: 비공개 → `pub fn`으로 변경 (control.rs에서 재사용)
- `parse_paragraph_list()`: 신규 `pub fn`, 레코드 배열에서 PARA_HEADER 단위로 문단 파싱
- `parse_ctrl_header()`: secd/cold 이외의 컨트롤을 `super::control::parse_control()`로 위임

### 아키텍처 설계

```
body_text.rs                    control.rs
  parse_ctrl_header()
    ├── secd → SectionDef
    ├── cold → ColumnDef
    └── 그 외 ──→ parse_control()
                    ├── tbl  → parse_table_control
                    ├── gso  → parse_gso_control
                    ├── daeh → parse_header_control
                    ├── ...
                    └── _    → Unknown

                  ↓ (재귀 호출)
                  body_text::parse_paragraph_list()
                    → 셀/머리말/꼬리말/각주 내부 문단
```

## 빌드 검증

| 항목 | 결과 |
|------|------|
| 네이티브 빌드 | 성공 (경고 0개) |
| 전체 테스트 | **175개 통과** (+13개, 3단계 대비) |
| WASM 빌드 | 성공 |

### 테스트 증가 내역

| 모듈 | 3단계 | 4단계 | 증가 |
|------|-------|-------|------|
| parser::control | - | 10 | +10 |
| parser::bin_data | - | 2 | +2 |
| parser::body_text | 19 | 20 | +1 |
| 기타 | 143 | 143 | 0 |
| **합계** | **162** | **175** | **+13** |

### 신규 테스트 목록

| 테스트 | 검증 내용 |
|--------|----------|
| test_parse_table_basic | 표 기본 속성 파싱 |
| test_parse_header_control | 머리말 파싱 (LIST_HEADER + 문단) |
| test_parse_footer_control | 꼬리말 파싱 |
| test_parse_footnote_control | 각주 파싱 |
| test_parse_auto_number | 자동 번호 파싱 |
| test_parse_bookmark | 책갈피 파싱 |
| test_parse_page_hide | 감추기 파싱 |
| test_parse_hidden_comment | 숨은 설명 파싱 |
| test_parse_common_obj_attr | 공통 객체 속성 파싱 |
| test_parse_control_dispatch | ctrl_id별 디스패치 (Unknown 포함) |
| test_bin_data_storage_name | BinData 스토리지명 생성 |
| test_bin_data_content | BinDataContent 구조체 |
| test_parse_table_control_delegation | body_text → control.rs 위임 검증 |

## 다음 단계

5단계: API 연결 + CLI + 빌드 검증
- wasm_api.rs에 파서 연결 (CFB → Document 파싱 파이프라인)
- main.rs CLI 연결
- 통합 테스트 및 최종 빌드 검증

## 상태

- 완료일: 2026-02-05
- 상태: 승인 완료
