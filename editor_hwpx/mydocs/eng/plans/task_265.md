# Task 265 Plan: Page Number Hide Feature Implementation

## Symptoms

- samples/style-02.hwp: Page number displayed on first page (cover)
- In Hancom, the `[Page Hide]` control (`pghd`) hides the page number on the first page

## Implementation Plan

### Step 1: Parser Fix
- Fix `CTRL_PAGE_HIDE` tag ID: `pghi` → `pghd` (spec error)
- Ensure PageHide control is parsed correctly

### Step 2: Pagination Integration
- Add `page_hide: Option<PageHide>` field to `PageContent`
- Collect PageHide in `collect_header_footer_controls` (including paragraph index)
- Assign PageHide to the appropriate page based on paragraph position in `finalize_pages`

### Step 3: Layout Application
- Check `page_hide.hide_page_num` in `build_page_number`
- Skip page number rendering if true

## Reference Files

| File | Change |
|------|------|
| src/parser/tags.rs | CTRL_PAGE_HIDE: `pghi` → `pghd` |
| src/renderer/pagination.rs | Add page_hide field to PageContent |
| src/renderer/pagination/engine.rs | PageHide collection + paragraph-based page matching |
| src/renderer/pagination/state.rs | PageContent initialization |
| src/renderer/layout.rs | Hide check in build_page_number |
| src/main.rs | Add page_num field to dump |
