# Task 197 Execution Plan — Page Break Verification with Various Line Spacing Documents

## Purpose

Verify that page break calculations are accurate in documents with various per-paragraph line spacing (100%, 160%, 250%, 300%, fixed values, etc.).

## Background

- Line spacing types: Percent, Fixed, SpaceOnly, Minimum (4 types)
- Line spacing is reflected via `LineSeg.line_spacing`, and during pagination `line_height + line_spacing` accumulates to determine page overflow
- Since Task 196 fixed the `vertical_pos` accumulation bug, verification is needed to confirm correct behavior with various line spacings

## Verification Methods

1. **Native unit tests**: Rust tests verifying page break positions are correct with various line spacing combinations
2. **E2E browser tests**: Change per-paragraph line spacing via WASM `applyParaFormat` API and visual verification with screenshots

## Verification Scenarios

| Scenario | Line Spacing Setting | Expected Result |
|----------|---------------------|----------------|
| S1 | All paragraphs 160% (default) | Page break at ~35 lines |
| S2 | All paragraphs 100% (tight) | More lines fit before break |
| S3 | All paragraphs 300% (wide) | Fewer lines before break |
| S4 | Mixed: 160% → 300% → 100% | Correct height accumulation at spacing change points |
| S5 | Fixed line spacing | Fixed pitch regardless of font size |

## Change Scope

- `src/document_core/commands/text_editing.rs` — Add line spacing page break unit tests
- `rhwp-studio/e2e/line-spacing.test.mjs` — E2E line spacing verification test (new)
- Bug fixes for any issues found
