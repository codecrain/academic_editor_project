# 타스크 164 최종 결과보고서: 세로쓰기 칼럼 너비/오버플로우/폰트 매트릭 개선

## 개요

타스크 158에서 구현한 글상자/표셀 세로쓰기의 칼럼 너비 계산, 글상자 오버플로우 처리,
폰트 매트릭(advance/char_width) 계산을 한컴 렌더링과 일치하도록 개선.

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout/shape_layout.rs` | 글상자 세로쓰기: 칼럼 너비 개선, 오버플로우 구조 변경, half_advance, col_bottom 체크 |
| `src/renderer/layout/table_cell_content.rs` | 표 셀 세로쓰기: 칼럼 너비 개선, half_advance, char_width 전각 통일 |

## 주요 변경 사항

### 1. 칼럼 너비 계산 개선

- **변경 전**: `col_width = line_height` (너비 부족, 한컴보다 좁음)
- **변경 후**: `col_width = line_height + line_spacing` (전체 피치를 칼럼에 흡수)
- 마지막 칼럼은 `absorbed_spacing` 필드로 후처리하여 불필요한 spacing 제거
- `col_spacing`은 항상 0 (spacing이 col_width에 흡수되었으므로)

### 2. 글상자 오버플로우 처리 개선

- `layout_textbox_content` 함수 구조 변경:
  - 변경 전: `text_direction != 0` → 즉시 세로 레이아웃 호출 (오버플로우 건너뜀)
  - 변경 후: 오버플로우 감지를 가로/세로 공통으로 먼저 수행 후 분기
- `layout_vertical_textbox_text` → `layout_vertical_textbox_text_with_paras`로 리네임
  - `&[Paragraph]` 슬라이스를 인자로 받아 오버플로우 문단 전달 가능
- 세로쓰기 오버플로우 타겟 텍스트박스에도 세로 레이아웃 적용

### 3. half_advance: 구두점만 0.5 계산

- **변경 전**: `needs_rotation` 기반 (영문눕힘/영문세움 결과 다름)
- **변경 후**: 구두점/기호만 `font_size × 0.5`, 영문/숫자는 `font_size` (캐릭터 높이)
- 로직: `half_advance = needs_rotation || (!is_cjk_char(ch) && !ch.is_ascii_alphanumeric())`

| 문자 종류 | 영문세움 advance | 영문눕힘 advance |
|-----------|-----------------|-----------------|
| CJK (한글 등) | font_size | font_size |
| 영문 (A-Z, a-z) | font_size | font_size × 0.5 (회전) |
| 숫자 (0-9) | font_size | font_size × 0.5 (회전) |
| 구두점/기호 | font_size × 0.5 | font_size × 0.5 |
| 공백 | font_size × 0.5 | font_size × 0.5 |

### 4. char_width 전각 통일

- **변경 전**: 영문세움의 영문/숫자는 `font_size × 0.5` (반각)
- **변경 후**: 세로쓰기 모든 문자 `char_width = font_size` (전각 배치, 영문눕힘과 동일)
- 칼럼 중앙 정렬이 양 모드에서 동일하게 동작

### 5. col_bottom 오버플로우 체크 추가

- 글상자 세로쓰기에 `col_bottom` 초과 시 렌더링 중단 로직 추가
- `if char_y + advance > col_bottom + 0.5 { break; }`
- 기존에는 글자가 텍스트박스 하단 경계를 넘어 렌더링되는 문제 있었음

## 테스트

- 608개 테스트 전체 통과
- `samples/textbox-vert.hwp` SVG 내보내기 검증 완료 (글상자 정상)
- `samples/table-vert-cell.hwp` SVG 내보내기 검증 완료 (표 셀 정상)

## 커밋

- `22cb702` — 타스크 164: 세로쓰기 칼럼 너비/오버플로우/폰트 매트릭 개선
