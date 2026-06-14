# Task 304 Implementation Plan: Page Number Feature Verification and Bug Fixes

## 1. Current State Analysis

### 1.1 Current Implementation Status (Confirmed by Expert Review)
- **Already implemented**: `build_page_number()` (layout.rs:841), `format_page_number()` (utils.rs:85)
- 10-position coordinate calculation, inside/outside odd/even branching: Implemented
- PageHide.hide_page_num check: Implemented
- prefix/suffix/dash_char handling: Implemented

### 1.2 Discovered Bugs
1. **Format mapping mismatch**: `NumberFormat::from_hwp_format` differs from HWP Spec Table 136 (formats 6~16)
2. **text_width calculation**: Uses `String::len()` (UTF-8 byte count) → Inaccurate for Korean/Roman characters
3. **dash_char spacing**: Hancom uses "- 1 -" format but current output may be "-1-"

## 2. Implementation Plan

### 2.1 Step 1: Fix Format Mapping
- Align `NumberFormat::from_hwp_format()` or `format_page_number()` internal mapping to Table 136
- Verification: Confirm page number output with various format values

### 2.2 Step 2: Fix text_width and dash Spacing
- Change `text_width = page_num_text.len()` → `page_num_text.chars().count()`
- Compare dash_char spacing with Hancom behavior

### 2.3 Step 3: Verify Rendering with Example Files
- Confirm SVG/WASM rendering with example files containing page numbers
- Verify correct placement for each position (top/bottom/left/center/right)

## 3. Impact Scope
- `src/renderer/layout.rs` — text_width fix in build_page_number
- `src/renderer/layout/utils.rs` — format_page_number dash handling
- `src/renderer/mod.rs` — NumberFormat::from_hwp_format mapping fix

## 4. Review History
- Expert review: Confirmed "already implemented", not "not implemented" → Scope adjusted to bug fixes
- Identified format mapping mismatch, text_width byte count bug, dash spacing omission
