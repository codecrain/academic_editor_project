# 타스크 198 구현계획서 — 표 페이지 경계 분할 처리 검증 및 버그 수정

## 발견된 버그

### BUG-1: 비-TAC 표 높이 추적 불일치 (pagination ↔ layout)

- **증상**: 페이지 후반부 표가 body area를 초과하여 렌더링됨 (예: hwpp-001.hwp page 31)
- **원인**: 레이아웃(layout.rs:1208-1213)에서 비-TAC 표 아래에 호스트 문단의 `line_spacing`을 추가하지만, 페이지네이션(engine.rs)의 `host_spacing`에는 이 값이 포함되지 않음
- **영향**: 페이지 내 표가 많을수록 누적 오차 증가 → 후반 표가 body area 초과
- **수정**: `host_spacing` 계산에 비-TAC 표의 `line_spacing` 추가 (이미 적용)

### BUG-2: PartialTable 최종 배치 시 spacing_after 누락

- **증상**: 분할 표의 마지막 부분 배치 시 레이아웃의 `spacing_after` 가 페이지네이션에 반영되지 않음
- **원인**: `split_table_rows`의 PartialTable 최종 배치(line 976)에서 `spacing_after` 미포함
- **수정**: 최종 배치에 `spacing_after` 추가 (이미 적용)

### BUG-3: 중첩 표(nested table)가 PartialTable 셀 경계 초과 렌더링

- **증상**: PartialTable의 셀 내 중첩 표가 셀 높이를 초과하여 body area 밖에 렌더링됨
- **원인**: `layout_partial_table`에서 셀 내 중첩 표를 전체 높이로 렌더링하되, 셀 clipPath로 시각적 잘림 처리. 그러나 잘린 부분이 다음 페이지에 표시되지 않아 콘텐츠 손실 발생
- **영향**: 셀 내 중첩 표가 큰 경우 일부 행이 보이지 않음
- **수정**: 중첩 표가 있는 셀의 행 분할 시 `NestedTableSplit`을 적용하여 보이는 부분만 렌더링

## 단계별 구현 계획

### 1단계: BUG-1, BUG-2 수정 및 네이티브 테스트 (완료)

- `host_spacing`에 비-TAC 표의 `line_spacing` 추가
- PartialTable 최종 배치에 `spacing_after` 포함
- 기존 677개 테스트 전체 통과 확인

### 2단계: 중첩 표 경계 초과 수정 (BUG-3)

- PartialTable 레이아웃에서 중첩 표가 셀 경계를 초과할 때 `NestedTableSplit`을 적용
- 셀 내 렌더링 가능 공간(`visible_space`)을 중첩 표에 전달
- 중첩 표의 보이는 행만 렌더링하도록 수정

### 3단계: 네이티브 단위 테스트 추가

- S1: 10행 표가 페이지 하단에서 시작 → 행 단위 분리 검증
- S2: 50행 대형 표 → 여러 페이지 분할 검증
- S3: 셀 내 중첩 표가 있는 행의 분할 검증
- S4: B-011 버그 재현 테스트 (표 높이가 body area 초과하지 않음)

### 4단계: E2E 브라우저 테스트 및 최종 결과보고서

- 웹 편집기에서 표 생성 후 페이지 경계 분할 시각 검증
- SVG 출력 비교로 overflow 여부 확인
- 최종 결과보고서 작성
