# Task 69 Implementation Plan

## Step 1: Fix PageAreas::from_page_def() Margin Calculation

**Modified file**: `src/model/page.rs`

Before:
```rust
let content_top = page_def.margin_top;
let content_bottom = page_height - page_def.margin_bottom;
```

After:
```rust
// HWP body start = margin_top + margin_header (per Hancom Help)
let content_top = page_def.margin_top + page_def.margin_header;
// HWP body end = height - margin_bottom - margin_footer
let content_bottom = page_height - page_def.margin_bottom - page_def.margin_footer;
```

Align header_area / footer_area for consistency:
```rust
let header_area = Rect {
    left: content_left as i32,
    top: page_def.margin_header as i32,           // header start
    right: content_right as i32,
    bottom: content_top as i32,                    // header end = body start
};

let footer_area = Rect {
    left: content_left as i32,
    top: content_bottom as i32,                    // footer start = body end
    right: content_right as i32,
    bottom: (page_height - page_def.margin_footer) as i32,  // footer end
};
```

## Step 2: Existing Test Modification and Verification

**Modified files**: `src/model/page.rs` (tests), `src/renderer/page_layout.rs` (tests)

- Update expected values in existing tests to match new margin calculation
- Add new test: verify margin_top + margin_header = content_top

## Step 3: SVG Rendering Verification + Full Tests

- `docker compose --env-file /dev/null run --rm test` — full test pass confirmation
- `hwp-multi-001.hwp` SVG export — confirm body start y-coordinate is ~94.5px
- Confirm no rendering regression for existing sample documents

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/model/page.rs` | Fix content_top/content_bottom calculation + tests | ~10 lines |
