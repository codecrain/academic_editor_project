# Task 210 Implementation Plan

## Step 1: Bug Source Code Fix
- `table_layout.rs`: change `Alignment::Left` → `para_alignment` in nested table `layout_table()` call within cells
- `table_partial.rs`: same fix at 2 locations for nested table `layout_table()` calls in split table cell content

## Step 2: Test and SVG Verification
- `cargo test` all tests PASS confirmation
- SVG export for kps-ai.hwp p61 visual confirmation

## Step 3: E2E Test and Completion Report
- WASM build
- E2E test for web rendering confirmation
- Update daily task status
