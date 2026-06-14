# Task 214 — 3단계 완료보고서

## 완료 내용

### DocumentCore 통합 및 병렬 검증

- `DocumentCore::paginate()`에 TypesetEngine 병렬 검증 로직 추가
  - `#[cfg(debug_assertions)]`로 디버그 빌드에서만 실행
  - 기존 Paginator 결과와 TypesetEngine 결과의 페이지 수를 비교
  - 차이 시 `TYPESET_VERIFY` 경고를 eprintln으로 출력

### 검증 결과

| 문서 | 구역 | Paginator | TypesetEngine | 일치 |
|------|------|-----------|---------------|------|
| 20250130-hongbo.hwp | sec0 | 16 | 16 | O |
| biz_plan.hwp | sec0 | 4 | 4 | O |
| p222.hwp | sec0~1 | 일치 | 일치 | O |
| p222.hwp | sec2 (표) | 44 | 43 | X (표) |
| kps-ai.hwp | sec0 (표) | 79 | 75 | X (표) |
| hwpp-001.hwp | sec3 (표) | 57 | 55 | X (표) |

### 분석

- **비-표 구역**: 완전 일치 확인 — format()→fits()→place/split 흐름이 정확
- **표 포함 구역**: 페이지 수 차이 발생
  - 원인: TypesetEngine의 표 분할 로직이 단순화되어 있음 (intra-row split, 머리행 반복, 캡션, 각주, host_spacing 등 미구현)
  - Phase 2에서 표 조판 전환 시 해결 예정

## 테스트

- 694개 PASS, 0 FAIL
