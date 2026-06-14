# Task 212 구현 계획서

## 핵심 원인

**마지막 행이 페이지보다 클 때 intra-row split 실패 시 강제 배치**

kps-ai.hwp p67의 표 구조:
- 행 3개, 행 0~1은 page 66에 분할 배치
- 행 2 (마지막 행): 높이 946.33px > 페이지 가용 918.37px (차이 ~28px)
- `approx_end=2 <= cursor_row=2` → 행 내부 분할(intra-row split) 시도
- 분할 조건 불충족 시 `end_row = cursor_row + 1 = 3 = row_count` → "나머지 전부 들어감" 분기 진입
- `partial_h=946.33`이 `avail=918.37`을 초과하지만 검증 없이 배치 → **overflow 발생**

## 1단계: intra-row split 조건 완화

**파일**: `src/renderer/pagination/engine.rs`

### 수정 위치: approx_end <= cursor_row 분기 (L918-938)

현재 `approx_end <= cursor_row`에서 `is_row_splittable(r) == false`이면 무조건 `end_row = r + 1`로 강제 배치.

수정: `is_row_splittable(r) == false`이더라도 행 높이가 페이지 가용 높이를 초과하면, 해당 행의 콘텐츠를 가용 높이에 맞춰 잘라서 배치 (강제 intra-row split).

### 수정 위치: "나머지 전부 들어감" 분기 (L1014)

현재 `end_row >= row_count && split_end_limit == 0.0`이면 무조건 배치.

수정: `partial_height > page_avail`인 경우 → 마지막 행도 intra-row split 적용하여 overflow 방지.

## 2단계: is_row_splittable 조건 확인

**파일**: `src/renderer/height_measurer.rs`

`is_row_splittable()`이 false를 반환하는 조건을 확인하고, 행 높이가 페이지를 초과하는 경우에는 true를 반환하도록 보완.

## 3단계: 테스트 및 검증

- `cargo test` — 684개 기존 테스트 PASS 확인
- SVG export: kps-ai.hwp p67 overflow 해소 확인
- hwpp-001.hwp 등 다른 문서 회귀 테스트
- WASM 빌드 + E2E 테스트
