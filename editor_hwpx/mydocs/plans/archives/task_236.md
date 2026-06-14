# Task 236 수행계획서: 중첩 표 continuation 렌더링 및 한글 폰트 별칭 수정

## 문제 현상

### 문제 1: 중첩 표 continuation 렌더링 실패
kps-ai.hwp 67-68페이지에서 TAC 표 내부에 중첩 표가 있는 셀이 페이지 분할(PartialTable continuation)될 때, 연속 페이지에서 빈/아주 작은 표만 렌더링됨.

### 문제 2: 한글 폰트 space 너비 오류
"돋움", "바탕", "맑은 고딕" 등 일반적인 한국어 폰트 이름에 대한 메트릭 별칭이 없어서 space 문자 너비가 fallback(font_size × 0.5)으로 계산됨. 64페이지 "기관명 : 한전KPS주식회사 (직인)" 셀에서 space가 너무 좁게 렌더링됨.

## 원인 분석

### 문제 1 원인
PartialTable continuation에서 바깥 셀의 remaining 높이 계산 시 `cell.height - padding - offset` 방식을 사용하는데, cell.height(HWP 파일 값 70975 HU = 946.3px)가 실제 중첩 표 렌더링 높이(~1665px)보다 훨씬 작아서 remaining이 거의 0이 됨.

또한 pagination의 `split_start_content_offset`은 MeasuredTable 좌표 기반이고, layout의 행 높이는 cell.height 기반이어서 좌표 불일치가 발생함.

### 문제 2 원인
`resolve_metric_alias()`에 "돋움", "바탕", "맑은 고딕", "나눔고딕", "나눔명조" 매핑이 누락.

## 수정 대상 파일

- `src/renderer/layout/table_partial.rs` — 중첩 표 포함 셀의 continuation 높이 계산 수정
- `src/renderer/font_metrics_data.rs` — 한글 폰트 별칭 추가

## 구현 계획

### 1단계: 중첩 표 continuation 높이 수정

중첩 표 포함 셀의 remaining 높이를 `calc_nested_split_rows().visible_height + om_top + om_bottom`으로 계산하여 실제 렌더링될 가시 행 높이를 정확히 반영.

### 2단계: 한글 폰트 별칭 추가

`resolve_metric_alias()`에 돋움→HCR Dotum, 바탕→HCR Batang, 맑은 고딕→Malgun Gothic, 나눔고딕→NanumGothic, 나눔명조→NanumMyeongjo 매핑 추가.

### 3단계: 테스트 및 검증

1. `cargo test` 전체 통과 확인
2. WASM 빌드 후 브라우저에서 kps-ai.hwp 67-68페이지 및 64페이지 검증
