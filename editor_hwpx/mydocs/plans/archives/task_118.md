# 타스크 118 수행계획서

## 과제명
표 페이지 오버플로우 버그 수정

## 배경

`samples/hancom-webgian.hwp` 페이지 3에서 하단 표가 본문 클립 영역(y=1046.89)을 27.46px 초과하여 렌더링됨.
줄간격 처리(타스크 117) 이전에도 동일하게 발생하던 기존 이슈.

## 원인 분석

### 핵심 버그: pagination이 표 문단의 호스트 간격을 미반영

**layout.rs (627-721)** PageItem::Table 처리 시 실제로 추가되는 Y:
1. `spacing_before` (문단 앞 간격) — line 638
2. `line_spacing` (첫 line_seg의 줄간격) — line 646
3. `layout_table()` 반환값 (표 본체 높이) — line 674
4. `spacing_after` (문단 뒤 간격) — line 718

**pagination.rs (937)** 에서 추적하는 높이:
```rust
current_height += effective_height;  // 표 본체만! ①②④ 누락
```

→ pagination이 표가 들어간다고 판단하지만, 실제 layout은 spacing_before + line_spacing + spacing_after만큼 더 많은 공간을 소비하여 오버플로우 발생.

### 부가 버그: layout_partial_table 셀 높이 계산에서 마지막 줄 line_spacing 포함

**layout.rs (3137-3141)**: 모든 줄에 `line_height + line_spacing` 합산
**height_measurer.rs (353-361)**: 셀 마지막 줄은 `line_spacing` 제외

→ PartialTable의 행 높이가 height_measurer 추정보다 커서 누적 오버플로우 가능.

## 구현 계획 (3단계)

### 1단계: pagination에 호스트 문단 간격 반영

**파일**: `src/renderer/pagination.rs`

**수정 위치**: 전체 표 배치 (line 902-937) 및 분할 표 경로 (line 964-1046)

- 표가 전체 들어가는 경우 (line 937):
  - `current_height += effective_height` → `current_height += effective_height + host_spacing`
  - `host_spacing = spacing_before + line_spacing_from_first_seg + spacing_after`
  - `spacing_before`는 column top이 아닐 때만 적용 (layout.rs line 637과 일치)

- 표가 초과하여 분할하는 경우 (line 964+):
  - `remaining_on_page`에서 `spacing_before + line_spacing` 차감 (표 앞에 배치)
  - 마지막 파트의 `current_height`에 `spacing_after` 추가

### 2단계: layout_partial_table 셀 높이 계산 수정

**파일**: `src/renderer/layout.rs`

**수정 위치**: lines 3128-3146 (row_span==1), lines 3218-3235 (row_span>1)

셀 마지막 문단의 마지막 줄에서 `line_spacing` 제외:
```rust
// Before: 모든 줄에 line_height + line_spacing
// After: is_cell_last_line이면 line_height만
```

### 3단계: 테스트 + 시각적 검증

1. Docker 네이티브 빌드 + 전체 테스트
2. WASM 빌드
3. SVG 내보내기: `hancom-webgian.hwp` page 3 확인
4. 웹 뷰어에서 시각적 검증
5. 오늘할일 상태 갱신

## 핵심 참조 파일

| 파일 | 참조 이유 |
|------|----------|
| `src/renderer/layout.rs:627-721` | PageItem::Table 처리 (spacing 추가 확인) |
| `src/renderer/layout.rs:3128-3146` | layout_partial_table 셀 높이 계산 |
| `src/renderer/pagination.rs:895-962` | 표 배치 판단 + 높이 추적 |
| `src/renderer/pagination.rs:964-1050` | 표 행 분할 경로 |
| `src/renderer/height_measurer.rs:353-361` | 정확한 셀 높이 계산 (참조) |

## 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| host_spacing 추가로 기존에 한 페이지에 들어가던 표가 다음 페이지로 넘어갈 수 있음 | 이것이 올바른 동작임 (기존은 오버플로우) |
| PartialTable 셀 높이 변경이 행 분배에 영향 | height_measurer와 일관성 확보이므로 올바른 방향 |
