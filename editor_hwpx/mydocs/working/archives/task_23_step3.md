# 타스크 23 - 3단계 완료 보고서: BodyText 직렬화 (문단, 텍스트, 컨트롤)

## 완료 항목

### 3-1. `src/serializer/body_text.rs` (약 380줄)
Section/Paragraph를 레코드 스트림으로 직렬화하는 모듈.

**주요 함수:**
| 함수 | 역할 |
|------|------|
| `serialize_section(section)` | Section → 레코드 바이트 스트림 (최상위) |
| `serialize_paragraph_list(paragraphs, base_level, records)` | 문단 리스트 → 레코드 (셀, 머리말 등 재귀 호출용) |
| `serialize_paragraph(para, base_level, records)` | 단일 문단 → 레코드 |
| `serialize_para_header(para)` | PARA_HEADER 데이터 (char_count, control_mask, shape_id, style_id, break_type) |
| `serialize_para_text(para)` | PARA_TEXT — 텍스트 + 컨트롤 → UTF-16LE |
| `serialize_para_char_shape(char_shapes)` | PARA_CHAR_SHAPE — (start_pos, char_shape_id) 쌍 |
| `serialize_para_line_seg(line_segs)` | PARA_LINE_SEG — 36바이트/줄 |
| `serialize_para_range_tag(range_tags)` | PARA_RANGE_TAG — 12바이트/태그 |
| `control_char_code(ctrl)` | Control enum → PARA_TEXT 컨트롤 문자 코드 매핑 |

**PARA_TEXT 직렬화 알고리즘:**
- `char_offsets` 간 갭(8 코드유닛 차이)을 이용하여 컨트롤 문자 위치 결정
- 탭(0x0009), 확장 컨트롤(0x000B 등): 8코드유닛(컨트롤코드 + 7개 패딩)
- 줄바꿈(0x000A), 묶음빈칸(0x0018): 1코드유닛
- 문단 끝(0x000D): 마지막에 자동 추가
- 서로게이트 페어 포함 일반 문자: UTF-16LE 인코딩

### 3-2. `src/serializer/control.rs` (약 570줄)
모든 Control enum variant를 CTRL_HEADER 레코드(+자식 레코드)로 직렬화하는 모듈.

**지원 컨트롤:**
| 컨트롤 | 함수 | 비고 |
|--------|------|------|
| SectionDef | `serialize_section_def` | + PAGE_DEF, FOOTNOTE_SHAPE×2, PAGE_BORDER_FILL |
| ColumnDef | `serialize_column_def` | attr 재구성 포함 |
| Table | `serialize_table` | + 캡션 + HWPTAG_TABLE + Cell 재귀 |
| Cell | `serialize_cell` | LIST_HEADER + 셀 데이터 + 자식 문단 |
| Header/Footer | `serialize_header_control/footer_control` | LIST_HEADER + 문단 |
| Footnote/Endnote | `serialize_footnote/endnote` | LIST_HEADER + 문단 |
| HiddenComment | `serialize_hidden_comment` | LIST_HEADER + 문단 |
| AutoNumber | `serialize_auto_number` | 단순 CTRL_HEADER |
| NewNumber | `serialize_new_number` | 단순 CTRL_HEADER |
| PageNumPos | `serialize_page_num_pos` | 단순 CTRL_HEADER |
| PageHide | `serialize_page_hide` | 단순 CTRL_HEADER |
| Bookmark | `serialize_bookmark` | CTRL_HEADER + CTRL_DATA |
| Picture | `serialize_picture_control` | gso + SHAPE_COMPONENT + SHAPE_COMPONENT_PICTURE |
| Shape (전체) | `serialize_shape_control` | Line, Rectangle, Ellipse, Arc, Polygon, Curve, Group |
| Unknown | 최소 stub | CTRL_HEADER만 출력 |

### 3-3. `src/serializer/mod.rs` 갱신
`pub mod body_text;`와 `pub mod control;` 추가.

## 테스트 결과

```
test result: ok. 319 passed; 0 failed; 0 ignored
```

| 카테고리 | 신규 테스트 수 | 설명 |
|----------|---------------|------|
| body_text | 13개 | 라운드트립: 단순 텍스트, 한글, 탭, 줄바꿈, 빈 문단, 복수 문단, char_shape, line_seg, range_tag, 컨트롤 문자, break_type, 컨트롤 코드 매핑 |
| control | 8개 | 라운드트립: SectionDef, ColumnDef, Table, AutoNumber, Bookmark, PageHide, Footnote, Header |

기존 299개 테스트 + 신규 20개 = 319개 전부 통과.

## 승인 요청

3단계 완료. 4단계(CFB 조립 + 압축 + WASM API + JS 통합) 진행을 승인해주십시오.
