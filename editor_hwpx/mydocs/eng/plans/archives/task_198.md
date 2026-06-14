# Task 198 Execution Plan — Table Page Boundary Split Handling Verification

## Purpose

Verify that tables are properly split by row when crossing page boundaries, and investigate/fix related bugs.

## Background

- Table splitting is handled row-by-row in `split_table_rows()` (engine.rs)
- Binary search on `MeasuredTable`'s `cumulative_heights` determines the split position
- Intra-row split is also supported: rows are split mid-way when cell content is long
- Existing backlog B-011: hwpp-001.hwp page 23 table overflow bug exists

## Verification Method

1. **Reproduce existing bug**: B-011 (hwpp-001.hwp page 23) table overflow root cause analysis
2. **Native unit tests**: Verify page splitting with various table sizes/row counts
3. **E2E browser tests**: Visual verification of table page boundary splitting in web
4. **SVG output comparison**: Confirm rendering accuracy of split tables

## Verification Scenarios

| Scenario | Description | Expected Result |
|----------|-------------|-----------------|
| S1 | 10-row table starts at bottom 1/3 of page | Some rows on page 1, rest on page 2 |
| S2 | 50-row large table | Row-by-row split across multiple pages |
| S3 | Header row repeat enabled | Header row repeated from page 2 onward |
| S4 | Row with very long cell content | Intra-row split |
| S5 | B-011 reproduction | Identify body area overflow bug cause |
