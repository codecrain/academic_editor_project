# 타스크 185 - 1단계 완료 보고서: 높이 불일치 정밀 진단

## 진단 결과

### 근본 원인

`layout_paragraph` (paragraph_layout.rs:562-578)에서 LineSeg의 `line_height`가 해당 줄의 최대 폰트 크기보다 작을 때, ParaShape의 줄간격 설정(line_spacing_type, line_spacing)으로 line_height를 재계산하는 보정 로직이 있음.

```rust
let line_height = if raw_lh < max_fs {
    let computed = match ls_type {
        Percent   => max_fs * ls_val / 100.0,
        Fixed     => ls_val.max(max_fs),
        SpaceOnly => max_fs + ls_val,
        Minimum   => ls_val.max(max_fs),
    };
    computed.max(max_fs)
} else {
    raw_lh
};
```

**HeightMeasurer의 `measure_paragraph()`에는 이 보정이 없음.** LineSeg의 raw line_height(5.33px = 400 HWPUNIT)를 그대로 사용하여 `lines_total`을 계산.

### 검증 데이터 (page_idx=3, para 40)

| 항목 | HM | Layout |
|------|-----|--------|
| raw line_height | 5.33px (400 HU) | 5.33px (400 HU) |
| max_font_size | (미계산) | 21.33px (16pt) |
| 보정 적용 | 없음 → 5.33 사용 | raw < max_fs → 21.33 × 160% = 34.13 |
| lines_total | 5.33 | 34.13 |

### 영향

- 이 보정이 적용되는 문단마다 HM과 layout의 높이 차이가 누적
- page_idx=3에서 누적 차이 76.80px → 마지막 3개 아이템이 body area 초과

## 수정 방향

HeightMeasurer의 `measure_paragraph()`에서 각 줄의 line_height를 계산할 때, 해당 줄의 최대 폰트 크기를 구하고 `raw_lh < max_fs`이면 동일한 보정 공식을 적용.
