# Task 72 Implementation Plan

## Fix Border/Content Duplication When Table Spans Pages

### Verification Targets: `samples/hancom-webgian.hwp` (table page break), `samples/k-water-rfp.hwp` (existing regression)

---

## Step 1: Add Content Area Clipping to SVG/Canvas Renderers

**Modified files**: `src/renderer/render_tree.rs`, `src/renderer/svg.rs`, `src/renderer/web_canvas.rs`

### Changes

#### render_tree.rs — Add clip_rect Field to Body Node

Add `clip_rect: Option<BoundingBox>` field to `RenderNodeType::Body`. Clip to content area boundary.

#### svg.rs — Apply SVG clipPath

When processing Body node in `render_node()`, wrap with `<clipPath>` + `<g clip-path>`.

#### web_canvas.rs — Apply Canvas clip()

When processing Body node in `render_node()`, use `ctx.save()` → `ctx.rect()` → `ctx.clip()` → render children → `ctx.restore()`.

---

## Step 2: Pass Clipping Info to Body Node in layout.rs

**Modified file**: `src/renderer/layout.rs`

### Changes

Set `col_area` coordinates as `clip_rect` when creating Body node in `build_render_tree()`.

---

## Step 3: Add Minimum Threshold for Pagination + Build Verification

**Modified file**: `src/renderer/pagination.rs`

### Changes

Apply minimum threshold to intra-row splitting: `avail_content > 0.0` → `avail_content >= MIN_SPLIT_CONTENT_PX (10.0)`.

### Build Verification

1. `docker compose --env-file /dev/null run --rm test` — all tests pass
2. `docker compose --env-file /dev/null run --rm wasm` — WASM build
3. `cd rhwp-studio && npx vite build` — Vite build
4. SVG export visual confirmation

---

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/renderer/render_tree.rs` | Add clip_rect field to Body node | ~5 lines |
| `src/renderer/svg.rs` | Body node clipping (clipPath) | ~15 lines |
| `src/renderer/web_canvas.rs` | Body node clipping (ctx.clip()) | ~10 lines |
| `src/renderer/layout.rs` | Pass clip_rect when creating Body node | ~5 lines |
| `src/renderer/pagination.rs` | Intra-row split minimum threshold | ~3 lines |
