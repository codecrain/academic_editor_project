# 타스크 41 단계 2 완료보고서: DIFF-1, DIFF-5, DIFF-7 수정

## 수정 내용

### DIFF-1: 빈 셀 공백 제거 (심각도: 높음)

**상태**: 이미 수정됨 (확인 및 테스트 추가)

현재 코드의 `parse_table_html()` (wasm_api.rs:3921-3936)에서 이미 올바르게 처리:
1. `html_to_plain_text(&pc.content_html).is_empty()` → `&nbsp;` 를 공백으로 변환 후 trim하여 빈 셀 감지
2. 빈 셀은 `Paragraph::new_empty()` (char_count=0) 생성
3. 셀 보정 코드에서 `char_count = 0 + 1 = 1`, `char_count_msb = true` 설정
4. `has_para_text = false` 유지 → PARA_TEXT 레코드 생성 안 됨

**검증**: `test_diff1_empty_cell_nbsp` 테스트 추가
- `&nbsp;` 셀: char_count=1, text empty, has_para_text=false ✓
- `&nbsp;&nbsp;&nbsp;` 셀: char_count=1, text empty, has_para_text=false ✓

### DIFF-5: TABLE 레코드 attr 플래그 (심각도: 낮음~중간)

**문제**: bit 1 (셀 분리 금지)이 `has_header_row` 일 때만 설정됨
**수정**: `raw_table_record_attr`를 항상 `0x04000006`으로 설정 (bit 1 = 셀 분리 금지 항상 활성)

```rust
// 수정 전
let tbl_rec_attr: u32 = if has_header_row {
    0x04000006
} else {
    0x04000004  // bit 1 미설정
};

// 수정 후
let tbl_rec_attr: u32 = 0x04000006; // bit 1(셀분리금지) + bit 2 항상 설정
```

**코드 위치**: wasm_api.rs:4129-4136

### DIFF-7: CTRL_HEADER 인스턴스 ID (심각도: 낮음)

**문제**: `raw_ctrl_data[28..32]` 의 instance_id가 항상 0
**수정**: 행/열 수, 셀 수, 총 폭/높이를 조합한 해시 기반 비-0 instance_id 생성

```rust
let instance_id: u32 = {
    let mut h: u32 = 0x7c150000;
    h = h.wrapping_add(row_count as u32 * 0x1000);
    h = h.wrapping_add(col_count as u32 * 0x100);
    h = h.wrapping_add(total_width);
    h = h.wrapping_add(total_height.wrapping_mul(0x1b));
    h ^= cells.len() as u32 * 0x4b69;
    if h == 0 { h = 0x7c154b69; }
    h
};
raw_ctrl_data[28..32].copy_from_slice(&instance_id.to_le_bytes());
```

**코드 위치**: wasm_api.rs:4093-4107

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/wasm_api.rs` | DIFF-5: raw_table_record_attr 수정, DIFF-7: instance_id 생성, 테스트 어설션 업데이트 |

## 테스트

- `test_diff1_empty_cell_nbsp`: DIFF-1 검증 (신규 추가)
- `test_paste_html_table_as_control`: DIFF-5, DIFF-7 검증 (어설션 업데이트)
- 전체 테스트: 475개 통과 (474 → 475, DIFF-1 테스트 1개 추가)
