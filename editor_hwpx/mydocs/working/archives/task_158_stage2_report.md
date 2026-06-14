# 타스크 158 2단계 완료 보고서

## 개요

글상자 패턴 채우기 렌더링과 세로쓰기 기호 대체 구현을 완료했다.

## 구현 내용

### 1단계: ShapeStyle 확장 + SVG 패턴 렌더링

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/mod.rs` | `PatternFillInfo` 구조체 추가, `ShapeStyle`에 `pattern` 필드 확장 |
| `src/renderer/layout/utils.rs` | `drawing_to_shape_style()`에서 `pattern_type > 0`일 때 패턴 정보 추출 |
| `src/renderer/svg.rs` | `create_pattern_def()`: 6종 패턴 SVG `<pattern>` 생성, `build_fill_attr()`: gradient→pattern→solid 우선순위, 3개 draw 함수 통합 |

**지원 패턴 종류:**
1. 가로줄 (horizontal lines)
2. 세로줄 (vertical lines)
3. 역대각선 (`\` backslash)
4. 대각선 (`/` forward slash)
5. 십자 (`+` cross)
6. 격자 (`x` cross-hatch)

### 2단계: Canvas 렌더러 패턴 지원

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/canvas.rs` | `FillPatternRect`, `FillPattern` 커맨드 추가, `draw_rect`/`draw_path`에서 패턴 우선 처리 |

### 3단계: 세로쓰기 기호 대체

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout/text_measurement.rs` | `vertical_substitute_char()`: 괄호류 16종, 대시 3종, 말줄임, 물결표, 밑줄 → CJK Vertical Forms 매핑 |
| `src/renderer/layout/shape_layout.rs` | 글상자 세로쓰기에서 대체 문자 적용 (회전 대신 세로 형태 사용) |
| `src/renderer/layout/table_cell_content.rs` | 표 셀 세로쓰기에서 대체 문자 적용 |

**기호 대체 매핑 (주요):**
- 괄호류: `(){}[]【】〈〉《》「」『』` → CJK Compatibility Forms (U+FE35~FE44)
- 대시: `— – ―` → 세로 대시 (U+FE31, FE32)
- 말줄임: `…` → `︙` (U+FE19)
- 물결표: `~` → `︴` (U+FE34)
- 밑줄: `_` → `︳` (U+FE33)
- 가로선: `─` → `│` (U+2502)

## 검증

- 608개 테스트 모두 통과
- `samples/tbox-fill-001.hwp` → 5개 패턴 정상 렌더링 확인
- `samples/textbox-vert.hwp` → 세로쓰기 기호 대체 정상
- `samples/table-vert-cell.hwp` → 표 셀 세로쓰기 정상

## 미해결 사항

- 회전 UI 연동 → 별도 타스크로 분리
