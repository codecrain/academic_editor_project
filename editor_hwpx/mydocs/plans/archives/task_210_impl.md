# Task 210 구현 계획서

## 1단계: 버그 원인 코드 수정
- `table_layout.rs`: 셀 내 중첩 표 `layout_table()` 호출 시 `Alignment::Left` → `para_alignment`
- `table_partial.rs`: 분할 표 셀 콘텐츠의 중첩 표 `layout_table()` 호출 2곳 동일 수정

## 2단계: 테스트 및 SVG 검증
- `cargo test` 전체 테스트 PASS 확인
- SVG export로 kps-ai.hwp p61 시각적 확인

## 3단계: E2E 테스트 및 완료 보고
- WASM 빌드
- E2E 테스트로 웹 렌더링 확인
- 오늘할일 상태 갱신
