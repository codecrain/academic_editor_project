# Task 398: LINE_SEG Match Rate Measurement Infrastructure

## Objective

Build test infrastructure to automatically compare HWP files' original LINE_SEG with rhwp `reflow_line_segs()` results. This serves as the foundation for quantitatively measuring improvement effectiveness in Tasks 399~401.

## Background

The core strategy for v1.0.0 is achieving identical typesetting with Hancom (Strategy C). For this, we need to measure how closely rhwp's reflow results match the Hancom originals. Currently there is no way to verify this quantitatively.

## Implementation Plan

### Step 1: LINE_SEG Comparison Function

- Write function to compare original LINE_SEG (from HWP file parsing) with reflow results field by field
- Comparison target fields: `text_start`, `segment_width`, `line_height`, `text_height`, `baseline_distance`, `line_spacing`, `vertical_pos`
- Return structured results with per-field match/mismatch + delta values

### Step 2: Match Rate Measurement Tests on Sample HWPs

- Batch measurement across HWP files in `samples/` folder
- Per paragraph: Original LINE_SEG line count vs reflow line count, per-field match rate
- Overall summary: Paragraph count, line count match rate, per-field average error

### Step 3: CLI Subcommand or Test Output

- Output match rate report via `cargo test` or CLI subcommand
- Classify mismatch patterns (line break positions, widths, baselines, etc.) to provide priority basis for Tasks 399~401

## Deliverables

- LINE_SEG comparison function (module in src/)
- Match rate measurement tests
- Baseline match rate report (`mydocs/working/task_398_baseline.md`)
- Per-step completion reports

## Notes

- Code change scope: Only adding comparison/measurement logic. No modification to existing reflow logic
- Tasks 399~401 will use this infrastructure to measure improvement effectiveness
