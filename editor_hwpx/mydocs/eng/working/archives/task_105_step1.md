# Task 105 - Step 1 Completion Report: Page Border/Background Feature Implementation

## Implementation Details

### Background Fill + Border Lines + Renderer Extension (Steps 1-3 Combined)

Steps 1-3 from the plan were combined into a single implementation.

### Changed Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Added `page_border_fill` parameter to `build_render_tree()`. BorderFill lookup → background color/gradient applied + 4-direction border line rendering |
| `src/renderer/render_tree.rs` | Added `gradient` field to `PageBackgroundNode` |
| `src/renderer/svg.rs` | Added gradient support to `PageBackground` rendering |
| `src/renderer/web_canvas.rs` | Added gradient support to `PageBackground` rendering |
| `src/renderer/canvas.rs` | Added `gradient: None` to test code |
| `src/wasm_api.rs` | Passed `page_border_fill` to `build_render_tree` call sites (2 locations) |

### Implementation Details

1. **Background fill**: `page_border_fill.border_fill_id` → `ResolvedBorderStyle` lookup → `fill_color` / `gradient` applied
   - `border_fill_id == 0` (not set) treated as default white
   - Fill area attr bits 3-4: 0=entire paper, 1=body area
   - Gradient takes priority over solid color when present

2. **Border lines**: `borders[4]` (left/right/top/bottom) → reuses `create_border_line_nodes()`
   - Position reference attr bit 0: 0=body, 1=paper
   - Spacing (HWPUNIT16 → px) applied for border offset

3. **SVG renderer**: Gradient → `create_gradient_def()` → `url(#gradN)` fill
4. **WebCanvas renderer**: Gradient → `apply_gradient_fill()` → Canvas gradient

### Verification Results

- `samples/basic/request.hwp`: border_fill_id=5, all 4-direction Solid border lines rendered correctly
- `samples/basic/Worldcup_FIFA2010_32.hwp`: border_fill_id=2 (empty BorderFill), white background only (correct)
- `samples/k-water-rfp.hwp`: border_fill_id=0 (not set), all 28 pages rendered correctly
- 565 tests passed
- WASM build success
