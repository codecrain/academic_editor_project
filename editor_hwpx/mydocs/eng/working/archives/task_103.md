# Task 103 — Completion Report

## Task Name
"In Front of Text" Layout Control Body Push-Down Exception Handling

## Work Period
2026-02-17

## Background
The HWP editor pushes body content (tables) down by the control area even when "InFrontOfText" is set.
The existing implementation only reserved height for `TopAndBottom` per spec, causing InFrontOfText text boxes and tables to overlap.
Reproduction file: `samples/table-ipc.hwp` page 1, title text box "Sponsorship Usage Statement".

## Change Details

### `src/renderer/layout.rs` — `calculate_shape_reserved_height()`

- Condition change: Processing only `TopAndBottom` → now processes both `TopAndBottom | InFrontOfText`
- Updated function comment: Added explanation of HWP editor exception behavior

```rust
// Before
if common.text_wrap != TextWrap::TopAndBottom {
    continue;
}

// After
if !matches!(common.text_wrap, TextWrap::TopAndBottom | TextWrap::InFrontOfText) {
    continue;
}
```

## Verification Results

| Item | Result |
|------|--------|
| Tests | 564 passed |
| SVG export | Table start y: 113.39 → 204.09 (moved below text box bottom) |

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | `calculate_shape_reserved_height()` 1 condition line + 2 comment lines |
