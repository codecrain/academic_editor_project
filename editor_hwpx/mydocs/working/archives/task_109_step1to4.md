# 타스크 109: 표 > 이미지 위치 렌더링 버그 수정 - 단계별 완료 보고서

## 1단계: "글앞으로" 표 세로 위치 처리

### 수행 내용

- `layout_table()`에서 `table.attr` bit 21-23으로 `table_text_wrap` 추출
- `text_wrap == 2(글뒤로) / 3(글앞으로)` 표에 대해:
  - `raw_ctrl_data[0..3]`에서 `v_offset` 추출
  - `vert_rel_to` (bit 3-4), `vert_align` (bit 5-7) 기반 세로 위치 계산
  - `table_y`를 v_offset 기반 절대 위치로 결정
- 반환값: 글뒤로/글앞으로 표는 `y_start` 반환 (본문 텍스트 밀어내지 않음)
- `calculate_shape_reserved_height()`에서 `InFrontOfText` 도형 제외 (본문 밀어내기 방지)

## 2단계: `layout_composed_paragraph()` 파라미터 추가

### 수행 내용

- 시그니처에 `first_line_x_offset: f64` 파라미터 추가
- 첫 줄 렌더링 시:
  - `available_width -= inline_offset` (가용 폭 감소)
  - `x_start += inline_offset` (텍스트 시작 위치 오프셋)
- 기존 11개 호출부 모두 `0.0` 전달 (동작 변경 없음)

## 3단계: 인라인 이미지 순차 배치

### 발견 사항

조사 결과, request.hwp의 인라인 이미지(hancom 로고)는 **테이블 셀** 안이 아닌 **텍스트박스(도형)** 안에 있음이 확인됨. 셀의 `para.controls`에 Picture가 없고, 이미지는 PageItem::Shape으로 처리되는 도형 내 텍스트박스의 인라인 컨트롤이었음.

### 수행 내용 (3곳 수정)

**A. 텍스트박스 레이아웃 (`layout_textbox_content`)**
- `layout_composed_paragraph` 호출 전에 인라인 컨트롤 총 폭(`tb_inline_width`) 계산
- 첫 줄 오프셋으로 전달하여 텍스트가 이미지 뒤에 배치
- `inline_x` 계산 시 이미지+텍스트 전체 폭(`total_line_width`) 기준으로 정렬

**B. 셀 레이아웃 1 (`layout_table` 내 가로쓰기 셀)**
- 인라인 컨트롤 총 폭 사전 계산, `layout_composed_paragraph`에 오프셋 전달
- 인라인 컨트롤 배치 시 `inline_x` 순차 추적, 정렬 기반 시작 X 계산

**C. 셀 레이아웃 2 (`layout_partial_table` 내 분할 행 셀)**
- 동일한 인라인 폭 계산 및 오프셋 전달
- `inline_x` 순차 배치 패턴 적용

## 4단계: 검증 및 피드백 반영

### 피드백 반영

- **문제**: `calculate_shape_reserved_height()`가 `InFrontOfText` 도형을 `TopAndBottom`과 동일하게 처리하여 본문을 77.88px 아래로 밀어냄
- **수정**: `InFrontOfText` 조건 제거, `TopAndBottom`만 본문 밀어내기 처리

### 검증 결과

| 항목 | 결과 |
|------|------|
| 전체 테스트 | 565개 통과 |
| WASM 빌드 | 성공 |
| request.hwp | 이미지(x=75.89) + 텍스트(x=195.05) 같은 줄, 본문 y=200.76 정상 |
| k-water-rfp.hwp | 29페이지 SVG 정상 내보내기, 회귀 없음 |
| Worldcup_FIFA2010_32.hwp | 1페이지 SVG 정상 내보내기, 회귀 없음 |

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/layout.rs` | 표 "글앞으로" 세로 위치 + `layout_composed_paragraph()` 시그니처 + 텍스트박스/셀 레이아웃 인라인 배치 + `calculate_shape_reserved_height` InFrontOfText 제외 |
