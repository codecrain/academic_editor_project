# 타스크 196 수행계획서 — 웹편집기 텍스트 플로우 처리

## 배경

웹편집기(rhwp-studio)에서 텍스트 편집 시 텍스트 플로우(줄바꿈, 줄간격, 엔터 문단분리, 페이지 넘김)가 정상 동작하는지 검증하고 미비한 부분을 수정한다.

## 현재 상태 분석

### 이미 구현된 부분 (Rust 코어)
- **텍스트 입력**: `insert_text_native()` → reflow → recompose → paginate
- **엔터(문단 분리)**: `split_paragraph_native()` → 문단 분할 → reflow → paginate
- **줄바꿈**: `reflow_line_segs()` → 토큰 기반 줄바꿈 (한국어/영어/CJK 구분)
- **줄간격**: LineSeg.line_spacing → layout에서 hwpunit_to_px 변환
- **페이지 분할**: pagination engine → `advance_column_or_new_page()` → 동적 페이지 생성

### TS 연동 상태
- Enter 키 → `SplitParagraphCommand` → WASM `splitParagraph()` → 커서 이동
- `afterEdit()` → `document-changed` 이벤트 → `refreshPages()` → 페이지 수 갱신
- `refreshPages()` → `wasm.getPageInfo(i)` 루프 → 가상 스크롤 갱신

### 잠재적 이슈
1. 페이지 증가 시 새 캔버스 생성 및 스크롤 영역 갱신 타이밍
2. 커서가 다음 페이지로 넘어갔을 때 자동 스크롤 동작
3. 줄간격이 편집 모드에서 실시간 반영되는지
4. 장문 입력 시 성능 (reflow + paginate 반복)
5. Backspace로 문단 병합 시 페이지 감소 처리

## 수행 방법

1. **WASM 빌드 후 웹편집기에서 실제 동작 테스트**
   - 빈 문서에서 텍스트 입력 → 줄바꿈 확인
   - Enter로 문단 분리 → 줄간격 적용 확인
   - 텍스트를 충분히 입력하여 페이지 넘김 발생 확인
   - Backspace로 문단 병합 → 페이지 감소 확인

2. **발견된 버그 수정**
   - 각 이슈를 개별 단계로 나누어 수정

3. **테스트 검증**
   - cargo test 통과
   - 수동 테스트로 end-to-end 동작 확인

## 산출물
- 수정된 소스 코드
- 단계별 완료 보고서
- 최종 결과 보고서
