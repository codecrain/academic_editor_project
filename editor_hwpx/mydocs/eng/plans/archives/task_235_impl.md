# Task 235 Implementation Plan

## Step 1: Improve TAC Table Inline Classification Criteria
### Change Files
- `src/renderer/height_measurer.rs` — `is_tac_table_inline()`
### Modification
- When text consists only of spaces, classify space+table combination as inline even if table width exceeds 90% threshold (allow up to 100%)

## Step 2: Verify Inline TAC Table Rendering
### Change Files
- `src/renderer/layout/paragraph_layout.rs` — `layout_inline_table_paragraph()`
### Modification
- Confirm reclassified inline TAC tables from Step 1 take this path
- Verify space width calculation works correctly

## Step 3: Synchronize pagination/layout Height
### Change Files
- `src/renderer/pagination/engine.rs`
- `src/renderer/layout.rs`
### Modification
- Reflect non-TAC table `host_line_spacing` fallback (line_spacing==0 → line_height)

## Step 4: Verification and Regression Testing
- `cargo test` all pass
- kps-ai.hwp LAYOUT_OVERFLOW reduction/elimination
- WASM build + host Chrome test
