# Task 391: Cell Vertical Center Alignment Height Calculation Error Fix

## Symptoms

- **File**: samples/gonggo-01.hwp page 3
- **Paragraph**: s0:pi=81 ci=0 table, cell[0] (14 paragraphs, va=Center)
- **Issue**: During vertical center alignment, `total_content_height` is calculated smaller than actual,
  causing `mechanical_offset` to be excessive → content pushed down and clipped at cell bottom
- **Expected**: When content height >= cell height, `offset=0` → start from top → full display

## Root Cause Analysis

In `calc_composed_paras_content_height`:
- Sums `line.line_height` from `composed_paras`
- Nested table heights are included in LINE_SEG lh, but may differ from composer's `line_height`
- Differences accumulate in complex cells with 14 paragraphs + nested tables

## Fix Direction

When `total_content_height` > `inner_height`, `mechanical_offset=0` so no problem.
The key is finding and fixing why `total_content_height` is underestimated.

## Implementation Plan (3 Steps)

### Step 1: Debug total_content_height — compare actual rendered height vs calculated height
### Step 2: Fix underestimation cause (LINE_SEG lh-based fallback or composed height correction)
### Step 3: Verification + commit
