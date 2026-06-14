# Task 212 수행계획서

## 제목
kps-ai.hwp p67 표 페이지 경계 overflow 수정 (B-013)

## 현상
- **파일**: kps-ai.hwp, 67페이지 ("소프트웨어사업 영향평가 결과서")
- **문제**: 표가 편집 용지 하단을 ~26px 초과하여 렌더링됨
  - body-clip 하한: y=1046.88 (y=128.5 + height=918.37)
  - 표 마지막 셀 하단: y=1072.96 (cell-clip y=1049.3 + h=23.65)
  - 초과량: ~26px
- **한컴 동작**: 표가 페이지 경계에서 분할되어 다음 페이지로 넘어감

## 원인 분석 (예상)

### 페이지 분할 의사결정 흐름
1. `paginate_table_control()` (engine.rs:535-703) — 표가 현재 페이지에 맞는지 판단
2. `split_table_rows()` (engine.rs:798-1063) — 행 단위 분할 실행
3. `find_break_row()` (height_measurer.rs:989-1001) — 이진 탐색으로 분할 행 결정

### 핵심 의심 포인트
1. **available_height 계산 오차**: `table_available_height` 산정 시 margin/spacing/footnote 등 공제 항목 누락 또는 부정확
2. **find_break_row() 이진 탐색 정밀도**: target 계산에 부동소수점 오차 누적으로 1개 행을 과도하게 포함
3. **cell_spacing 이중/누락 계산**: cumulative_heights에 포함된 cell_spacing과 partial_height 계산 간 불일치
4. **26px ≈ 1~2 행 높이 또는 cell_spacing**: 체계적 과소 계산 가능성

## 수정 방안 (예상)
1. 디버그 출력으로 p67 표의 available_height, table_total_height, find_break_row 결과 추적
2. 원인 특정 후 pagination/height_measurer 수정
3. 기존 테스트 회귀 확인

## 검증 방법
1. `cargo test` — 684개 기존 테스트 PASS 확인
2. SVG export로 kps-ai.hwp p67 overflow 해소 확인
3. hwpp-001.hwp 등 다른 문서 회귀 테스트
4. WASM 빌드 + E2E 테스트

## 영향 범위
- 표 분할 로직 전체에 영향 (pagination engine)
- 모든 문서의 표 페이지 경계 처리
