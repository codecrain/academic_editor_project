# Task 7: 2-Pass Pagination Implementation

## Goal
Resolve the content overlap issue caused by the difference between pre-calculated heights (LineSeg.line_height, Cell.height) and actual rendering heights.

## Problem Analysis

### Current Situation
- samples/2010-01-06.hwp: outputs 5 pages (original is 6 pages)
- On page 3, table data and description paragraph overlap in the y=868-1034 range
- Cause: pre-calculated height ≠ actual rendering height

### Overlap Location
```
page 3:
- y=916.01: "15) Net Lending : ..." (description paragraph)
- y=923.84: "Current Expenditure 62,645..." (table data)
→ 7.83px gap causing visual overlap
```

## Solution: 2-Pass Pagination

### Pass 1: Height Measurement
- Use LayoutEngine to measure actual rendering height of each content
- Cache measurement results for reuse

### Pass 2: Page Splitting
- Perform accurate page splitting based on measured heights
- Generate pages without overflow

## Implementation Phases

### Phase 1: Height Measurement Infrastructure
- Define `MeasuredParagraph` struct (actual height per paragraph)
- Define `MeasuredTable` struct (actual height per table)
- Implement `HeightMeasurer` (LayoutEngine-based)

### Phase 2: Paginator Modification
- Pass 1: Measure all content heights with HeightMeasurer
- Pass 2: Split pages using measured heights

### Phase 3: Verification and Optimization
- Verify 6-page output for samples/2010-01-06.hwp
- Confirm content overlap resolution
- Minimize performance impact

## Expected Changed Files

| File | Changes |
|------|---------|
| src/renderer/pagination.rs | 2-pass logic implementation |
| src/renderer/layout.rs | Add height measurement functions |
| src/renderer/mod.rs | New module export |
| src/wasm_api.rs | Modify paginate() call |

## Verification Method

1. `docker compose run --rm test` — Existing 213 tests pass
2. `docker compose run --rm dev cargo run -- export-svg "samples/2010-01-06.hwp" --output output/`
3. SVG results:
   - 6-page output
   - No content overlap on page 3
   - Title at the start of each page
