# Task #3: TAC Image Vertical Layout Bug in Table Cells — Plan

## Goal

Fix vertical layout to work correctly when multiple TAC (treat_as_char) images exist in a table cell, based on LINE_SEG line distribution information.

## Symptoms

- `samples/tac-img-02.hwpx` page 14, `s0:pi=165` (1x1 table)
- Cell contains 1 paragraph with 3 TAC images, LINE_SEG has 3 lines
- Images laid out only horizontally, exceeding cell width → cropping occurs

## Root Cause

| Location | Problem |
|------|------|
| `table_layout.rs:1213-1237` | TAC images placed only horizontally with `inline_x += pic_w`. LINE_SEG line info not referenced |
| `paragraph_layout.rs:1671` | `cell_ctx.is_none()` condition skips TAC images inside cells (delegated to table_layout) |
| `table_layout.rs:1132-1148` | `total_inline_width` sums all TAC widths (no per-line distribution) |

## Solution Strategy

In `table_layout.rs`'s cell TAC image placement loop, compare `composed.tac_controls`' char positions with `composed.lines`' `char_start` to determine which line each image belongs to. When the line changes, reset `inline_x` and move `y` coordinate based on the corresponding LINE_SEG vpos.

## Implementation Steps

### Step 1: Per-Line TAC Distribution Logic

- Modify TAC image placement loop in `table_layout.rs` (1213~)
- For each TAC control, determine which `composed.lines[i].char_start` range its `abs_pos` falls into
- When line changes, reset `inline_x` to line start x, move `y` based on LINE_SEG vpos
- Also change `total_inline_width` calculation to per-line maximum width

### Step 2: SVG Export Verification and Regression Tests

- Verify 3 images arranged vertically on `tac-img-02.hwpx` page 14 via SVG
- Confirm all existing `cargo test` passing
- Verify no regression in TAC image rendering for existing samples

### Step 3: Dump Code Cleanup

- Clean up debug output code added for cell internal control details (decide to keep or remove)

## Impact Scope

- `src/renderer/layout/table_layout.rs` — TAC image placement logic modification
- `src/main.rs` — Dump code cleanup (optional)

## Verification Criteria

- 3 images arranged top-to-bottom inside cell on `tac-img-02.hwpx` page 14
- `cargo test` all passing
- No TAC rendering regression in existing samples
