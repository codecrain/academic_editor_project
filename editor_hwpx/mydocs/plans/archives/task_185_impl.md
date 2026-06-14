# 타스크 185 구현 계획서: 문단 페이지 넘김 버그 수정

## 문제 핵심

Pagination의 `current_height` 누적과 Layout의 `y_offset` 누적이 불일치하여, pagination이 "들어갈 수 있다"고 판단한 문단들이 실제 렌더링에서 body area를 초과함.

### 디버그 추적 결과 (page_idx=3)

| para | HM total | PAG delta | LAYOUT delta | 차이 |
|------|----------|-----------|--------------|------|
| 40 | 21.33 | 21.33 | 34.13 | +12.80 |
| 41 | 21.33 | 21.33 | 43.73 | +22.40 |
| 47 | 21.33 | 21.33 | 43.73 | +22.40 |
| 48 | 18.67 | 18.67 | 37.87 | +19.20 |

- HeightMeasurer(HM): `total_height = sp_before + lines_total + sp_after`
- Pagination(PAG): `current_height += para_height` (HM의 total 사용)
- Layout: `y_offset += spacing_before(조건부) + 줄별_렌더링 + spacing_after`

**Layout delta > HM total인 이유**: HM이 composed line 데이터에서 `lines=5.33`(단일 줄)로 측정했지만, layout 실제 렌더링에서는 해당 문단이 더 많은 높이를 차지함.

---

## 단계별 구현 계획

### 1단계: 높이 불일치 정밀 진단

**목표**: HM의 lines_total과 layout의 실제 줄 높이 합계가 왜 다른지 규명

**작업 내용**:
- layout_paragraph 함수에서 각 줄의 `line_height + line_spacing` 합계를 계산하는 디버그 출력 추가
- HM의 `line_heights[]`, `line_spacings[]`와 layout이 사용하는 `composed.lines[].line_height/line_spacing` 비교
- 특히 para 40(HM lines=5.33, layout delta=34.13)의 composed 데이터 구조 확인
- 구역(section) 경계에서 composed 데이터가 올바르게 전달되는지 검증

**완료 조건**: 불일치의 정확한 원인 코드 라인 특정

### 2단계: HeightMeasurer 높이 계산 수정

**목표**: HM의 total_height가 layout의 실제 렌더링 높이와 일치하도록 수정

**작업 내용**:
- 1단계에서 특정한 원인에 따라 수정 적용
- 가능한 수정안:
  - (A) HM이 사용하는 composed/line_seg 데이터를 layout과 동일하게 사용
  - (B) layout이 추가하는 spacing(표 문단 spacing_before 등)을 HM에도 반영
  - (C) pagination에서 layout과 동일한 높이 누적 방식 적용
- 기존 테스트 657개 통과 확인

**완료 조건**: hwpp-001.hwp 전체 SVG 내보내기 시 overflow 건수 대폭 감소

### 3단계: 잔여 overflow 수정 및 회귀 테스트

**목표**: 남은 overflow 건 해결 + 다른 HWP 파일에 대한 회귀 테스트

**작업 내용**:
- 2단계 수정 후 남은 overflow 건 추적 및 수정
- `samples/` 내 주요 HWP 파일들의 SVG 내보내기로 회귀 확인
- 657개 테스트 전체 통과 확인
- WASM 빌드 및 웹 브라우저 테스트

**완료 조건**: hwpp-001.hwp overflow 0건, 기존 테스트 통과, WASM 빌드 성공
