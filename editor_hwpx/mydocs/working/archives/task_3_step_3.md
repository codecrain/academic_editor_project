# 타스크 3 - 3단계 완료 보고서: BodyText 문단 파싱

## 수행 내용

### 생성/수정된 파일

| 파일 | 라인 | 설명 |
|------|------|------|
| `src/parser/body_text.rs` | 866 | BodyText 섹션/문단 파싱 (레코드 트리 → Section/Paragraph) |
| `src/parser/mod.rs` | +2 | body_text 모듈 등록 |
| `src/model/document.rs` | fix | SectionDef에 Clone derive 추가 |

### 구현 상세

#### body_text.rs - 섹션/문단 파싱

##### 레코드 트리 탐색

HWP의 레코드는 level 필드로 부모-자식 관계를 형성한다:
```
PARA_HEADER (level 0) → Paragraph
  PARA_TEXT (level 1)       → text
  PARA_CHAR_SHAPE (level 1) → char_shapes
  PARA_LINE_SEG (level 1)   → line_segs
  PARA_RANGE_TAG (level 1)  → range_tags
  CTRL_HEADER (level 1)     → controls
    PAGE_DEF (level 2)
    FOOTNOTE_SHAPE (level 2)
    ...
```

`parse_body_text_section()` → `parse_paragraph()` → `parse_ctrl_header()` 순으로 재귀적 분해.

##### 텍스트 파싱 (UTF-16LE + 컨트롤 문자)

- HWP 텍스트는 UTF-16LE로 저장
- 0x0000~0x001F 범위는 컨트롤 문자
- **확장 컨트롤** (8 code unit = 16바이트): 0x0002(구역/단), 0x0003(필드시작), 0x000B(표/도형) 등
- **인라인 컨트롤** (1 code unit = 2바이트): 0x0009(탭), 0x000A(줄바꿈), 0x000D(문단끝) 등
- 서로게이트 페어 처리로 BMP 외 유니코드 지원

##### 파싱 함수 목록

| 함수 | 입력 | 출력 |
|------|------|------|
| `parse_body_text_section()` | 레코드 바이트 | `Section` |
| `parse_paragraph()` | 레코드 그룹 | `Paragraph` |
| `parse_para_header()` | PARA_HEADER 데이터 | `Paragraph` 기본 필드 |
| `parse_para_text()` | PARA_TEXT 데이터 | `String` |
| `parse_para_char_shape()` | PARA_CHAR_SHAPE | `Vec<CharShapeRef>` |
| `parse_para_line_seg()` | PARA_LINE_SEG | `Vec<LineSeg>` |
| `parse_para_range_tag()` | PARA_RANGE_TAG | `Vec<RangeTag>` |
| `parse_ctrl_header()` | CTRL_HEADER 그룹 | `Control` |
| `parse_section_def()` | secd 데이터 | `SectionDef` |
| `parse_column_def_ctrl()` | cold 데이터 | `ColumnDef` |
| `parse_page_def()` | PAGE_DEF | `PageDef` |
| `parse_footnote_shape_record()` | FOOTNOTE_SHAPE | `FootnoteShape` |
| `parse_page_border_fill()` | PAGE_BORDER_FILL | `PageBorderFill` |

##### 컨트롤 처리 (단계별 분담)

- **3단계 구현**: `SectionDef(secd)`, `ColumnDef(cold)` → 완전 파싱
- **4단계 예약**: `Table(tbl)`, `Shape(gso)`, `Header(head)`, `Footer(foot)` 등 → `Control::Unknown(ctrl_id)` 스텁

### 모델 변경사항

- `SectionDef`: `#[derive(Debug, Default)]` → `#[derive(Debug, Clone, Default)]` 추가
  - `parse_body_text_section()`에서 SectionDef를 Section으로 복사할 때 필요

## 빌드 검증

| 항목 | 결과 |
|------|------|
| 네이티브 빌드 | 성공 (경고 0개) |
| 전체 테스트 | **162개 통과** (+19개, 2단계 대비) |
| WASM 빌드 | 성공 |

### 테스트 증가 내역

| 모듈 | 2단계 | 3단계 | 증가 |
|------|-------|-------|------|
| parser::body_text | - | 19 | +19 |
| 기타 | 143 | 143 | 0 |
| **합계** | **143** | **162** | **+19** |

### 신규 테스트 목록

| 테스트 | 검증 내용 |
|--------|----------|
| test_parse_para_text_simple | 영문 텍스트 파싱 |
| test_parse_para_text_korean | 한글 텍스트 파싱 |
| test_parse_para_text_with_tab | 탭 문자 처리 |
| test_parse_para_text_with_extended_ctrl | 확장 컨트롤 건너뛰기 |
| test_parse_para_text_empty | 빈 문단 |
| test_is_extended_ctrl_char | 컨트롤 문자 분류 |
| test_parse_para_char_shape | 글자 모양 참조 파싱 |
| test_parse_para_line_seg | 줄 세그먼트 파싱 |
| test_parse_para_range_tag | 범위 태그 파싱 |
| test_parse_page_def | A4 용지 설정 |
| test_parse_page_def_landscape | 가로 방향 |
| test_parse_section_simple | 단일 문단 섹션 |
| test_parse_section_multiple_paragraphs | 복수 문단 |
| test_parse_section_with_section_def | 구역 정의 포함 |
| test_parse_section_with_column_def | 단 정의 포함 |
| test_parse_unknown_control | 미구현 컨트롤 스텁 |
| test_parse_para_header_fields | PARA_HEADER 필드 |
| test_parse_page_border_fill | 쪽 테두리/배경 |
| test_parse_empty_section | 빈 섹션 |

## 다음 단계

4단계: 컨트롤 파싱 (표, 도형, 그림, 머리말/꼬리말)

## 상태

- 완료일: 2026-02-05
- 상태: 승인 완료
