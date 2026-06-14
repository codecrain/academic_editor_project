# 타스크 109: 표 > 이미지 위치 렌더링 버그 수정

## 목표

`samples/basic/request.hwp`의 두 가지 렌더링 문제를 수정한다:
1. **표 배치**: "글앞으로"(InFrontOfText) 표가 본문 위에 떠있도록 세로 위치 처리
2. **셀 내 인라인 이미지**: treat_as_char 이미지가 텍스트와 같은 줄에 순서대로 배치

## 현재 상태

### 문제 1: 표 "글앞으로" 배치 미처리

- `table.attr` bit 21-23에 text_wrap 정보 존재 (3=InFrontOfText)
- `table.raw_ctrl_data[0..3]`에 v_offset (세로 오프셋) 존재
- 현재 `layout_table()`은 text_wrap을 무시하고 모든 표를 텍스트 흐름에 배치
- "글앞으로" 표는 v_offset 기준으로 절대 위치에 배치되어야 하며, 본문 텍스트를 밀어내지 않아야 함

### 문제 2: 셀 내 인라인 이미지 독립 배치

- 파서가 확장 컨트롤 문자를 텍스트에서 제거 → 이미지 플레이스홀더 없음
- `layout_horizontal_cell_text()`에서 텍스트와 컨트롤을 독립적으로 배치
- 이미지 X 위치가 셀 정렬 기준(Center → 셀 중앙)으로 결정, 텍스트 흐름 무시

## 구현 계획

### 1단계: "글앞으로" 표 세로 위치 처리

**파일**: `src/renderer/layout.rs`

- `layout_table()`에서 `table.attr` bit 21-23으로 text_wrap 추출
- text_wrap == InFrontOfText일 때:
  - `raw_ctrl_data[0..3]`에서 v_offset 추출
  - vert_rel_to (bit 3-4), vert_align (bit 5-7) 기반 세로 위치 계산
  - `table_y`를 v_offset 기반으로 결정 (y_start 대신)
- 호출부(`build_render_tree`)에서 "글앞으로" 표의 반환값으로 y_offset 전진하지 않도록 처리

### 2단계: `layout_composed_paragraph()`에 인라인 오프셋 파라미터 추가

**파일**: `src/renderer/layout.rs`

- 시그니처에 `first_line_x_offset: f64` 파라미터 추가
- 첫 줄(line_idx == start_line) 렌더링 시:
  - `available_width -= first_line_x_offset` (가용 폭 감소)
  - `x_start += first_line_x_offset` (텍스트 시작 위치 오프셋)
- 기존 10개 호출부는 모두 `0.0` 전달 (동작 변경 없음)

### 3단계: 셀 레이아웃에서 인라인 이미지 순차 배치

**파일**: `src/renderer/layout.rs`

두 곳의 셀 레이아웃 코드 수정 (line ~2166, ~3062):

- 텍스트 컴포즈 전에 인라인 이미지 총 폭 계산
- `layout_composed_paragraph` 호출 시 인라인 오프셋 전달
- 컨트롤 배치 시 `inline_x` 추적, 순차 X 위치 사용 (텍스트박스 패턴 참조)
- 비인라인 컨트롤은 기존 동작 유지

### 4단계: 검증 및 회귀 테스트

- request.hwp SVG 내보내기 확인:
  - 표가 본문 텍스트 위에 올바른 위치에 배치
  - 셀 내 인라인 이미지+텍스트 같은 줄
- k-water-rfp.hwp 회귀 테스트
- Worldcup_FIFA2010_32.hwp 회귀 테스트
- 전체 테스트 통과 확인

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/layout.rs` | 표 "글앞으로" 세로 위치 + `layout_composed_paragraph()` 시그니처 + 셀 레이아웃 2곳 인라인 배치 |

## 브랜치

`local/task109` (devel에서 분기)
