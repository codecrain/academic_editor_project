# Task 215 — 4단계 완료보고서

## 완료 내용

### 1. multi-TAC trailing_ls 버그 수정 (핵심)

**문제**: hwp-multi-001 ✓ (trailing_ls 복원 시)이지만 kps-ai ✗ (79→80, 회귀)

**근본 원인**: `place_table_with_text()`에서 trailing_ls 복원 조건의 `has_post_text` 판단이 Paginator와 불일치

| 구분 | Paginator (정답) | TypesetEngine (수정 전) |
|------|-------------------|--------------------------|
| post-text 배치 조건 | `tac_table_count <= 1` | `tac_table_count <= 1` ✓ |
| trailing_ls 복원의 has_post_text | `!text.is_empty() && lines > start` | `tac_table_count <= 1` 포함 ✗ |

- Paginator는 trailing_ls 복원 시 `tac_table_count`와 무관하게 텍스트 줄 존재 여부만 확인
- multi-TAC 표(tac_count > 1)에서: 텍스트 줄이 있으면 `has_post_text=true` → trailing_ls 복원 안 함
- TypesetEngine은 `tac_table_count <= 1` 조건을 `has_post_text`에 포함시켜, multi-TAC일 때 잘못 복원

**수정**: `should_add_post_text` (post-text 배치용)와 `has_post_text` (trailing_ls 판단용)를 분리

```rust
// post-text 배치: tac_table_count <= 1 조건 포함
let should_add_post_text = is_last_table && tac_table_count <= 1 && ...;

// trailing_ls 복원: tac_table_count와 무관, 텍스트 줄 존재만 확인
let has_post_text = !para.text.is_empty() && total_lines > post_table_start;
if is_tac && fmt.total_height > fmt.height_for_fit && !has_post_text { ... }
```

### 2. TYPESET_VERIFY / TYPESET_DETAIL 검증 완료

페이지 수 비교 + 페이지별 항목(PageItem) 단위 비교 도구 동작 확인.

### 3. 코드 정리 확인

- Phase 1 스텁 (`process_table_controls`, `split_table_into_pages`): 이미 제거 완료
- TODO/FIXME/HACK 코멘트: 없음
- 디버그 출력: 테스트 유틸리티 내 `eprintln!`만 존재 (의도적)
- 주석 처리 코드: 없음
- 미사용 함수: 없음

### 4. 테스트

- 694개 PASS, 0 FAIL, 1 IGNORED
- 빌드 성공

## 최종 검증 결과

### TYPESET_VERIFY 비교 (전체 문서 일치)

| 문서 | Paginator | TypesetEngine | 결과 |
|------|-----------|---------------|------|
| k-water-rfp sec1 | 25 | 25 | ✓ 일치 |
| kps-ai sec0 | 79 | 79 | ✓ 일치 |
| hwpp-001 sec3 | 57 | 57 | ✓ 일치 |
| p222 sec2 | 44 | 44 | ✓ 일치 |
| hongbo | - | - | ✓ 일치 |
| biz_plan | - | - | ✓ 일치 |
| hwp-multi-001 sec0 | 9 | 9 | ✓ 일치 |
| synam-001 sec0 | 41 | 41 | ✓ 일치 |

### 이전 단계 대비 개선

| 문서 | 1단계 | 2단계 | 3단계 | 4단계 |
|------|-------|-------|-------|-------|
| k-water-rfp | 25→27 | 25→26 | ✓ 일치 | ✓ 일치 |
| kps-ai | 79→75 | ✓ 일치 | ✓ 일치 | ✓ 일치 |
| hwpp-001 | 57→55 | ✓ 일치 | ✓ 일치 | ✓ 일치 |
| hwp-multi-001 | 9→8 | 9→8 | ✓ 일치 | ✓ 일치 |
| synam-001 | 41→40 | 41→40 | ✓ 일치 | ✓ 일치 |

### LAYOUT_OVERFLOW 현황

k-water-rfp에 6건의 overflow가 여전히 존재하나, 이는 **Paginator의 pagination 결과**로 인한 것이며 TypesetEngine으로 렌더링 전환(Phase 3) 시 해소 예정.

## Task 215 전체 완료 요약

### Phase 2에서 구현한 기능

1. **Break Token 패턴**: `TypesetBreakToken::Table`로 표 분할 상태 명시적 전달
2. **format_table()**: 표 높이 단일 패스 계산 (측정-배치 일원화)
3. **typeset_block_table()**: fits/split 분기, 행 단위 분할
4. **typeset_tac_table()**: TAC 표 전용 조판 (LINE_SEG 기반)
5. **place_table_with_text()**: pre/post 텍스트 + trailing_ls 복원
6. **각주 사전 계산**: 표 셀 내 각주 높이 → 가용 높이 차감
7. **HostSpacing.spacing_after_only**: 마지막 fragment 높이 정밀 계산
8. **TYPESET_DETAIL 진단**: 페이지별 항목 비교 도구

### 해결된 버그

| 버그 | 원인 | 수정 |
|------|------|------|
| k-water-rfp 26→25 | 마지막 fragment에 host_line_spacing 과다 적용 | spacing_after_only 필드 |
| hwp-multi-001 8→9 | pre/post 텍스트 미생성 | place_table_with_text() |
| synam-001 40→41 | TAC 높이 보정(tac_seg_total) 미적용 | paginator 동일 로직 이식 |
| kps-ai 80→79 | multi-TAC trailing_ls 잘못 복원 | has_post_text 분리 |
