# Task 95 Execution Plan

## Task Name
Master Page Implementation

## Goal
Parse HWP document's master page data into a structured model and render it as page background.

## Background
- Master pages are section-level page templates, configurable in 3 types: both pages / odd pages / even pages
- Current: preserved as RawRecords in `SectionDef.extra_child_records` (round-trip possible, rendering not possible)
- Reuse existing header/footer pattern for implementation

## Scope
- Parsing: Extract master page data from LIST_HEADER in SectionDef child records
- Pagination: Select active master page per page (both/odd/even)
- Rendering: Display master page content in SVG and Canvas renderers
- Serialization: Maintain existing extra_child_records-based round-trip

## Technical Reference
- HWP Spec 5.0: Table 139 (master page info 10 bytes)
- HWP Help: `mydocs/manual/hwp/Help/extracted/format/masterpages/master_pages(compose).htm`

## Expected Modified Files
9 files (model 2, parser 1, renderer 5, API 1)

## Branch
`local/task95`
