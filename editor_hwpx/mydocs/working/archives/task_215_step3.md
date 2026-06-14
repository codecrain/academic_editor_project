# Task 215 — 3단계 완료보고서

## 완료 내용

### 1. 각주 처리 구현

#### 표 셀 내 각주 높이 사전 계산 (format_table)
- `FormattedTable.table_footnote_height` 필드에 표 내 모든 각주 높이 합산
- `estimate_footnote_height()` 헬퍼 구현 (HeightMeasurer와 동일 로직)
- Paginator engine.rs:565-581 동일 패턴

#### 각주 반영 가용 높이 계산 (typeset_block_table)
- `table_footnote_height`를 사전 차감하여 `table_available_height` 계산
- 구분선 오버헤드(`footnote_separator_overhead`) 조건부 추가
- 안전 마진(`footnote_safety_margin`) 적용
- Paginator engine.rs:583-586 동일 패턴

#### 각주 수집
- 표 셀 내 각주: `typeset_table_paragraph()`에서 `FootnoteRef::TableCell` 생성
- 본문 각주: 메인 루프에서 `FootnoteRef::Body` 생성
- `st.add_footnote_height()` 호출로 가용 높이 동적 추적
- Paginator engine.rs:679-701, 515-525 동일 패턴

### 2. 인라인 컨트롤 처리 (비-표 문단)

- 비-표 문단의 `Control::Shape/Picture/Equation` → `PageItem::Shape` 생성
- 비-표 문단의 `Control::Footnote` → `FootnoteRef::Body` + 높이 추적
- Paginator engine.rs:509-525 동일 패턴

### 3. 마지막 fragment 높이 누적 버그 수정 (핵심 수정)

**근본 원인 발견**: Paginator와 TypesetEngine의 마지막 fragment 높이 누적 규칙 불일치

| 구분 | Paginator (정답) | TypesetEngine (수정 전) |
|------|-------------------|------------------------|
| 전체 배치 | `partial_height + host_spacing` | `partial_height + host_spacing_total` ✓ |
| 마지막 fragment | `partial_height + **sa**` | `partial_height + **host_spacing.after**` ✗ |
| 중간 fragment | advance만 | advance만 ✓ |

- `host_spacing.after = sa + outer_bottom + host_line_spacing`
- Paginator는 마지막 fragment에 `sa`만 적용 (host_line_spacing 미포함)
- TypesetEngine은 `host_spacing.after` 전체를 적용하여 높이 과다 계산
- 이 차이가 누적되어 k-water-rfp에서 1페이지 초과 발생

**수정**: `HostSpacing.spacing_after_only` 필드 추가, 마지막 fragment에서 사용

### 4. TYPESET_DETAIL 진단 도구 추가

- `TYPESET_DETAIL=1` 환경변수: 페이지별 항목 상세 비교 출력
- `TYPESET_ALL_PAGES=1` 환경변수: 차이 없는 페이지도 출력
- 항목 형식: `F{para}` (전체문단), `P{para}(시작-끝)` (부분문단), `T{para}` (표), `PT{para}(r시작-끝)` (부분표), `S{para}` (도형)

## 검증 결과

### TYPESET_VERIFY 비교

| 문서 | 2단계 | 3단계 | Paginator |
|------|-------|-------|-----------|
| k-water-rfp sec1 | 25→26 | **일치** | 25 |
| kps-ai sec0 | 일치 | 일치 | 79 |
| hwpp-001 sec3 | 일치 | 일치 | 57 |
| p222 sec2 | 일치 | 일치 | 44 |
| hongbo | 일치 | 일치 | - |
| biz_plan | 일치 | 일치 | - |
| hwp-multi-001 sec0 | 9→8 | 9→8 | 9 |
| synam-001 sec0 | 41→40 | 41→40 | 41 |

### 개선 사항

- **k-water-rfp**: 26→25 (Paginator와 완전 일치!) — 마지막 fragment 높이 수정 효과
- **15yers 전체 문서**: 모두 일치

### 남은 차이 원인

#### hwp-multi-001 (9→8, -1페이지)
- TAC 표 문단의 pre-table/post-table 텍스트 미생성
- Paginator는 `P14(0-1),T14` (텍스트+표), TypesetEngine은 `T14`만 생성
- vertical_offset 기반 표 앞 텍스트 높이 미반영으로 과소 계산
- 4단계에서 TAC 표 pre/post 텍스트 처리 추가 예정

#### synam-001 (41→40, -1페이지)
- 문단 높이 계산의 미세 차이 (Phase 1 영역)
- 표 분할과 무관한 일반 문단 높이 누적 차이

### 오버플로우 상태

k-water-rfp의 page 17 (para 195) 14.2px 오버플로우는 **Paginator의 결과**이며,
TypesetEngine이 실제 렌더링에 사용되면 해소될 예정 (Phase 3에서 전환).

### 테스트

- 694개 PASS, 0 FAIL
- 빌드 성공
