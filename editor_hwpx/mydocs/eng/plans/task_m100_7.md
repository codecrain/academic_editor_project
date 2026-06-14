# Task #7: HWPX switch/case Namespace Branching — Plan

## Goal

Handle `<switch>/<case>/<default>` namespace branching in the HWPX parser, prioritizing `HwpUnitChar` case values for paragraph spacing/line spacing.

## Symptoms

- `paraPr` `margin` (prev/next) and `lineSpacing` are not parsed when inside `<switch>`
- Default case's large values are applied, causing excessive spacing
- Fixed line spacing prevents parallel layout of TAC tables and paragraphs

## Implementation Steps

### Step 1: Handle switch/case in paraPr Parsing

- In `parse_para_shape()`, enter `<switch>` when encountered
- When `<case required-namespace="...HwpUnitChar">` tag is found, parse inner `margin`, `lineSpacing`
- If case values exist, override default values (HwpUnitChar takes priority)
- Values inside `<default>` used only when no case match

### Step 2: Verification

- Verify `tac-img-02.hwpx` page 19 layout
- paraPr id=215: Confirm prev=400, next=400, line=1800/Fixed
- `cargo test` all passing
- No regression in full 67-page export

## Impact Scope

- `src/parser/hwpx/header.rs` — paraPr parsing

## Verification Criteria

- paraPr id=215 spacing uses HwpUnitChar case values (400/400/1800)
- Reduced LAYOUT_OVERFLOW on page 19
