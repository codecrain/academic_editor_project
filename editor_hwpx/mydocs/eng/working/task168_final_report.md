# Task 168 Final Report: Style System Implementation

## Overview

Implemented the full pipeline for querying and applying HWP document styles (Base Text, Body, Outline 1~7, etc.) in the editor.

## Implementation Scope

### Stage 1: WASM API (Rust)

Added 5 methods to `src/wasm_api.rs`:

| API | Function |
|-----|----------|
| `getStyleList()` | Returns document-wide style list as JSON |
| `getStyleAt(sec, para)` | Queries style of a paragraph |
| `getCellStyleAt(sec, para, ctrl, cell, cellPara)` | Queries style of a paragraph inside a cell |
| `applyStyle(sec, para, styleId)` | Applies style to a paragraph |
| `applyCellStyle(sec, para, ctrl, cell, cellPara, styleId)` | Applies style to a paragraph inside a cell |

### Stage 2: Native Style Application Logic (Rust)

`src/document_core/commands/formatting.rs`:

- `apply_style_native()` / `apply_cell_style_native()` — Core style application logic
- `resolve_style_para_shape_id(style_id, current_psid)` — Determines ParaShape per style
  - Outline paragraphs: Preserves `numbering_id` + changes only `para_level`/`margin_left`
  - Normal paragraphs: Uses referenced paragraph's ParaShape or falls back to style default
- `find_reference_para_shape_for_style()` — References ParaShape from existing paragraphs with same style
- `find_para_shape_with_nid_and_level()` — Searches ParaShape matching nid+head_type+level
- `parse_outline_level_from_style()` — Parses outline level from style name

### Stage 3: Studio UI (TypeScript)

| File | Change |
|------|--------|
| `wasm-bridge.ts` | 5 style API wrappers |
| `toolbar.ts` | `initStyleDropdown()` + `cursor-style-changed` event listener |
| `input-handler.ts` | `applyStyle()`, `changeOutlineLevel()`, `cursor-style-changed` event emission |
| `format.ts` | `format:apply-style`, `format:level-increase`, `format:level-decrease` commands |
| `index.html` | Removed style dropdown defaults, activated level increase/decrease menus |
| `main.ts` | `toolbar.initStyleDropdown()` call |

## Bugs Resolved

| Problem | Cause | Solution |
|---------|-------|----------|
| Style dropdown not updating on cursor move | Event not emitted | Added `cursor-style-changed` event |
| Margins/indentation reset on style change | Using style default ParaShape (margin 0) | Used reference paragraph ParaShape |
| Subsequent numbers reset on outline level change | `numbering_id` change resets NumberingState | Preserved current paragraph's `numbering_id` |
| PartialParagraph number counter missing | Missing from `build_page_tree` replay | Added PartialParagraph replay |
| Block table/inline table number counter missing | `apply_paragraph_numbering` omitted in table path | Added counter progression to table path |

## Tests

- Rust unit tests: 613 passed (including 3 new NumberingState tests)
- WASM build: Succeeded
- Studio build: Succeeded
- Browser verification: `samples/biz_plan.hwp` page 5 outline level change with correct subsequent number recalculation confirmed

## Commit History

| Commit | Content |
|--------|---------|
| `66082de` | Task 168: Style system implementation (WASM API + Studio UI + number preservation) |
| `6f753ae` | Task 168 supplement: Activated level increase/decrease menus + competitive advantage tracking document |

## Byproducts

- `mydocs/report/competitive_advantages.md` — Competitive advantage feature tracking document newly written (29 items)

---

*Written: 2026-02-27*
