# Task 236 Execution Plan: Nested Table Continuation Rendering and Korean Font Alias Fix

## Problem 1: Nested Table Continuation Rendering Failure
kps-ai.hwp pages 67-68: when cells containing nested tables within TAC tables are split across pages (PartialTable continuation), only empty/very small tables render on continuation pages.

## Problem 2: Korean Font Space Width Error
No metric aliases for common Korean font names like "Dotum", "Batang", "Malgun Gothic" — space character width falls back to font_size * 0.5.

## Implementation Plan

### Step 1: Fix Nested Table Continuation Height
Calculate remaining height for cells containing nested tables using `calc_nested_split_rows().visible_height + om_top + om_bottom` to accurately reflect actual visible row height.

### Step 2: Add Korean Font Aliases
Add mappings in `resolve_metric_alias()`: Dotum→HCR Dotum, Batang→HCR Batang, Malgun Gothic→Malgun Gothic, NanumGothic→NanumGothic, NanumMyeongjo→NanumMyeongjo.

### Step 3: Testing and Verification
