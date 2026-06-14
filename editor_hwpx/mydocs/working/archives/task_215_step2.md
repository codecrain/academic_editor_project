# Task 215 — 2단계 완료보고서

## 완료 내용

### typeset_block_table() 정밀 분할 로직 이식

기존 Paginator의 split_table_rows와 동일한 세밀한 분할 로직을 TypesetEngine에 구현:

1. **find_break_row()**: O(log R) 이진 탐색 기반 분할점 탐색
2. **인트라-로우 분할**: 셀 내 문단 줄 단위 분할
   - is_row_splittable(): 분할 가능 여부 판별
   - remaining_content_for_row(): 남은 콘텐츠 높이
   - min_first_line_height_for_row(): 최소 첫 줄 높이
   - max_padding_for_row(): 셀 패딩
   - effective_row_height(): 오프셋 반영 유효 행 높이
   - MIN_SPLIT_CONTENT_PX (10px) 최소 분할 단위
3. **캡션 처리**: caption_is_top, caption_overhead, Bottom 캡션 공간 확보
4. **대형 행 강제 분할**: 페이지보다 큰 행의 강제 intra-row split
5. **content_offset 기반 이어쓰기**: 분할된 행의 다음 페이지 재개

### 높이 누적 규칙 (기존 Paginator와 동일)

- 전체 배치: `partial_height + host_spacing_total`
- 마지막 fragment: `partial_height + caption_extra + spacing_after`
- 중간 fragment: host_spacing 없이 advance

## 검증 결과

### TYPESET_VERIFY 비교

| 문서 | Phase 1 | 1단계 | 2단계 | Paginator |
|------|---------|-------|-------|-----------|
| k-water-rfp sec1 | 25→27 | 25→28 | **25→26** | 25 |
| kps-ai sec0 | 79→75 | 79→81 | **일치** | 79 |
| hwpp-001 sec3 | 57→55 | 일치 | **일치** | 57 |
| p222 sec2 | 44→43 | 일치 | **일치** | 44 |
| hongbo | 일치 | 일치 | 일치 | - |
| biz_plan | 일치 | 일치 | 일치 | - |

### 개선 사항

- **kps-ai**: 75→79 (Paginator와 완전 일치!) — 인트라-로우 분할 적용 효과
- **k-water-rfp**: 28→26 (25에 근접) — 나머지 1페이지 차이는 표 셀 내 각주 높이 예측 미구현

### 남은 차이 원인 (k-water-rfp 1페이지)

- 기존 Paginator는 표 내 각주 높이를 `table_available_height`에 미리 반영
- TypesetEngine은 현재 `st.available_height()`만 사용 (각주 미반영)
- 3단계에서 각주 처리 시 해결 예정

### 테스트

- 694개 PASS, 0 FAIL
- 빌드 성공
