# 타스크 235 구현 계획서

## 1단계: TAC 표 인라인 분류 기준 개선

### 변경 파일
- `src/renderer/height_measurer.rs` — `is_tac_table_inline()`

### 현재 문제
- 표 너비가 seg 너비의 90% 이상이면 블록으로 분류
- para=106: 표 48227 / seg 50752 = 95% → 블록 처리
- 그러나 공백 문자가 존재하므로 실제로는 인라인 배치 의도

### 수정 내용
- 텍스트가 공백만으로 구성된 경우에도, 공백+표 조합이면 인라인으로 분류
- 기존 90% 임계값을 유지하되, 공백 문자가 있는 경우 100%까지 허용

## 2단계: 인라인 TAC 표 렌더링 검증

### 변경 파일
- `src/renderer/layout/paragraph_layout.rs` — `layout_inline_table_paragraph()`

### 현재 동작
- 이미 공백+표 인터리빙 배치 로직이 구현되어 있음
- char_offsets 갭 분석으로 텍스트/표 순서를 파악하여 렌더링

### 수정 내용
- 1단계에서 인라인으로 재분류된 TAC 표가 이 경로를 타도록 확인
- 공백 폭 계산이 정상 작동하는지 검증

## 3단계: pagination/layout 높이 동기화

### 변경 파일
- `src/renderer/pagination/engine.rs`
- `src/renderer/layout.rs`

### 현재 문제
- 블록→인라인 전환 시 pagination의 높이 계산 경로도 변경됨
- 인라인 TAC의 높이는 `para_height` (LINE_SEG 기반)로 직접 사용
- layout은 `layout_inline_table_paragraph` 반환값 사용
- 두 값이 일치하는지 확인, 불일치 시 조정

### 수정 내용
- 비-TAC 표의 `host_line_spacing` 폴백 로직도 반영 (line_spacing==0 → line_height)
- 인라인 전환 후 오버플로우 감소 확인

## 4단계: 검증 및 회귀 테스트

### 검증 항목
- `cargo test` 전체 통과
- kps-ai.hwp LAYOUT_OVERFLOW 감소/제거
- WASM 빌드 + 호스트 크롬 테스트
- KTX.hwp, field-02.hwp, f11-01.hwp 렌더링 정상 확인
