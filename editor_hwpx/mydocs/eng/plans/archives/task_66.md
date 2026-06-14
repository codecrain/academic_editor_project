# Task 66 Execution Plan: Fix Rendering of Paragraphs Containing Both Text and Table

## Background

During Task 65, a problem was discovered on page 1 of `img-start-001.hwp` where text in paragraphs containing both text and a Table control was not being rendered, and it was registered as backlog item B1.

## Symptoms

- `para[1]` contains both text (80 characters: "Department: Digital Transformation Promotion Team, Director Oh Eun...") and a Table control simultaneously
- In `layout.rs:241-252`, when `has_table=true`, the paragraph text rendering is skipped with `continue`
- Result: the text is not displayed in both SVG and Canvas

## Root Cause

The code assumes "Table paragraph = no text". This assumption is correct for most HWP documents, but some documents have text and Table coexisting in one paragraph.

## Modification Scope

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Add `para.text.is_empty()` check to `has_table` condition |
| `src/renderer/pagination.rs` | Include height calculation for Table paragraphs with text |
| `src/renderer/height_measurer.rs` | Apply same condition |

## Verification

1. All Rust tests pass
2. Confirm text rendering via SVG export
3. No regression in existing Table layouts
