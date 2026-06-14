# Task 216 수행계획서: k-water-rfp.hwp p17 마지막 문단 크롭핑 수정

## 문제 현상

k-water-rfp.hwp 17페이지의 마지막 문단 "3. 제안요청내용"이 페이지 하단에서 잘려서 표시된다.

## 원인 분석

### 직접 원인
pagination의 `cur_h`(890.7)와 layout의 `y_offset`(897.3) 사이에 **6.6px 누적 오차**가 발생한다.
pagination은 "문단 콘텐츠가 남은 공간에 들어간다"(910.7 ≤ 915.5)고 판정하지만,
layout에서는 실제로 초과한다(917.3 > 915.5).

### 근본 원인
height_measurer의 **표 셀 높이 계산**에서 줄 높이 보정(max_fs correction)이 누락되어 있다.

| 구분 | height_measurer (표 셀) | layout |
|------|------------------------|--------|
| 줄 높이 | `hwpunit_to_px(line.line_height)` (raw) | max_fs 보정 적용 |
| 셀 내 문단 줄간격 | LINE_SEG 원본 | 최대 글자크기 × 줄간격비율 |

문단 내 여러 줄의 줄간격은 해당 줄의 최대 글자 크기에 비례하지만,
문단 간 간격(spacing_before/after)은 글자 크기와 무관한 고정값이다.
height_measurer의 표 셀 계산에서 전자(줄 높이 보정)가 빠져 있어서
표마다 약 22.5px씩 layout과 차이가 나고, vpos 보정 후에도 표당 3.3px 잔여 오차가 누적된다.

## 수정 대상 파일

- `src/renderer/height_measurer.rs` — 표 셀 높이 계산에 max_fs 보정 추가

## 구현 계획

### 1단계: height_measurer 표 셀 높이 계산에 max_fs 보정 적용

**대상**: `height_measurer.rs`의 표 셀 높이 계산 부분 (3곳)

현재 코드 (line 448-457):
```rust
let h = hwpunit_to_px(line.line_height, self.dpi);
```

수정 후:
```rust
let raw_lh = hwpunit_to_px(line.line_height, self.dpi);
let max_fs = line.runs.iter()
    .map(|r| styles.char_styles.get(r.char_style_id as usize)
        .map(|cs| cs.font_size).unwrap_or(0.0))
    .fold(0.0f64, f64::max);
let h = if max_fs > 0.0 && raw_lh < max_fs {
    // layout_composed_paragraph와 동일한 보정
    match ls_type { ... }
} else { raw_lh };
```

동일한 보정을 적용하는 위치:
1. `measure_table` 내 셀 높이 계산 (~line 448)
2. `measure_table_row_split` 내 셀 높이 계산 (~line 557)
3. `compute_cell_line_ranges` 내 줄 높이 계산 (~line 668)

### 2단계: 공통 함수 추출 및 검증

height_measurer의 문단 높이 계산(line 233-252)과 표 셀 높이 계산, layout의
`layout_composed_paragraph`(paragraph_layout.rs:572-585)에서 동일한 max_fs 보정 로직이
반복되므로, 공통 헬퍼 함수로 추출한다.

```rust
/// LINE_SEG line_height가 줄의 최대 글자 크기보다 작으면
/// ParaShape의 줄간격 설정으로 재계산한다.
fn corrected_line_height(
    raw_lh: f64, max_fs: f64,
    ls_type: LineSpacingType, ls_val: f64,
) -> f64
```

### 3단계: 테스트 및 SVG 검증

1. `cargo test` 전체 통과 확인
2. k-water-rfp.hwp p17 SVG 내보내기 — "3. 제안요청내용" 크롭핑 해소 확인
3. LAYOUT_OVERFLOW 경고 확인
4. 기존 샘플 파일 회귀 검증
