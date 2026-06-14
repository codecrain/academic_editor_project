# Task 142 Implementation Plan: Codebase Refactoring

## Goals

| Metric | Current | Target |
|--------|---------|--------|
| Files exceeding 1,200 lines | 15 | 0 |
| Clippy warnings | 0 (allow policy) | 0 (warn/deny policy) |
| Cognitive Complexity > 25 | 22 functions | 0 (≤15) |
| Tests | 582 passed | Maintain all |
| Coverage | 55.80% | 70%+ |

## Target Files (Exceeding 1,200 lines, excluding font_metrics_data)

### Rust (12 files)

| File | Lines | Step |
|------|------|------|
| `src/wasm_api.rs` | 24,585 | Step 1 |
| `src/renderer/layout.rs` | 8,708 | Step 2 |
| `src/renderer/pagination.rs` | 2,264 | Step 3 |
| `src/renderer/composer.rs` | 2,026 | Step 3 |
| `src/renderer/svg.rs` | 1,292 | Step 3 |
| `src/model/table.rs` | 1,767 | Step 4 |
| `src/parser/control.rs` | 1,744 | Step 4 |
| `src/serializer/control.rs` | 1,520 | Step 4 |
| `src/serializer/cfb_writer.rs` | 1,516 | Step 4 |
| `src/parser/body_text.rs` | 1,429 | Step 5 |
| `src/model/paragraph.rs` | 1,367 | Step 5 |
| `src/serializer/doc_info.rs` | 1,248 | Step 5 |

### TypeScript/CSS (3 files)

| File | Lines | Step |
|------|------|------|
| `rhwp-studio/src/engine/input-handler.ts` | 3,106 | Step 6 |
| `rhwp-studio/src/style.css` | 1,588 | Step 6 |
| `rhwp-studio/src/ui/para-shape-dialog.ts` | 1,496 | Step 6 |

---

## Step 1: wasm_api.rs Module Split

### Current Analysis

- **24,585 lines** — Largest file in the project
- Composition: `#[wasm_bindgen]` methods 87 (1,681 lines), `_native` methods 87 (9,628 lines), helper functions 46 (776 lines), tests 112 (13,074 lines), private methods 89
- Tests comprise **53%** (13,074 lines) of the file

### Split Strategy: Distributed `impl` Pattern

Rust allows defining `impl` blocks for a single struct across multiple files. Keep `HwpDocument` struct definition in one place and separate methods by functionality.

```
src/
├── wasm_api.rs              ← HwpDocument struct + #[wasm_bindgen] shim (thin delegation layer)
├── wasm_api/
│   ├── mod.rs               ← pub mod declarations
│   ├── document.rs          ← Document creation/loading/saving/settings native methods
│   ├── rendering.rs         ← Rendering/page info/page tree native methods
│   ├── text_editing.rs      ← Text insert/delete/paragraph split/merge native methods
│   ├── table_ops.rs         ← Table creation/row-column/cell operations/properties native methods
│   ├── cursor_hit.rs        ← Cursor/hit-test/line info/selection area native methods
│   ├── formatting.rs        ← Character/paragraph formatting/font application native methods
│   ├── clipboard.rs         ← Clipboard/HTML export/paste native methods
│   ├── helpers.rs           ← JSON parsing/color conversion/HTML processing 46 helpers
│   └── tests.rs             ← 112 test functions
```

### Module Details

#### `wasm_api.rs` (main body, ~800 lines max)
- `HwpDocument` struct definition (16 fields)
- `HwpError` enum definition
- `ClipboardData` struct definition
- `#[wasm_bindgen] impl HwpDocument` block: 87 shim methods (5-10 lines each, only JsValue conversion)
- `HwpViewer` struct + impl

#### `wasm_api/document.rs` (~600 lines)
- `from_bytes()`, `create_blank_document_native()`
- `export_hwp_native()`, `convert_to_editable_native()`
- `document()`, `set_document()`
- Settings: DPI, fallback font, paragraph marks, transparent borders

#### `wasm_api/rendering.rs` (~800 lines)
- `render_page_svg/html/canvas_native()`
- `get_page_info/def_native()`, `set_page_def_native()`
- `get_page_text_layout_native()`, `get_page_control_layout_native()`
- `build_page_tree()`, `build_page_tree_cached()`
- Cache invalidation, 13 composition-related private methods

#### `wasm_api/text_editing.rs` (~800 lines)
- `insert_text_native()`, `delete_text_native()`
- `insert_text_in_cell_native()`, `delete_text_in_cell_native()`
- `split_paragraph_native()`, `merge_paragraph_native()`
- `split_paragraph_in_cell_native()`, `merge_paragraph_in_cell_native()`
- `reflow_paragraph()`, `reflow_cell_paragraph()` private methods

#### `wasm_api/table_ops.rs` (~1,100 lines)
- 4 row/column insert/delete native methods
- 4 cell merge/split native methods
- 2 table create/delete native methods
- 6 table/cell property get/set native methods
- Table resize, move, bbox related methods
- Picture insert/delete/property related methods

#### `wasm_api/cursor_hit.rs` (~1,100 lines)
- `hit_test_native()`, `get_cursor_rect_native/in_cell/by_path()`
- `get_caret_position_native()`, `get_line_info_native()`
- `get_selection_rects_native()`, `delete_range_native()`
- `move_vertical_native/by_path()`
- Path traversal private methods (resolve_paragraph, parse_cell_path, etc.)
- Cursor/selection related private methods (handle_body_boundary, enter_paragraph, etc.)

#### `wasm_api/formatting.rs` (~600 lines)
- `get_char/para_properties_at_native()`
- `get_cell_char/para_properties_at_native()`
- `apply_char/para_format_native()`, `_in_cell` variants
- `find_or_create_font_id_native()`
- `parse_char_shape_mods()`, `parse_para_shape_mods()` related logic

#### `wasm_api/clipboard.rs` (~1,100 lines)
- 6 basic clipboard native methods (has/get/clear/copy/paste)
- `copy_selection_in_cell_native()`, `copy_control_native()`
- `paste_internal_in_cell_native()`
- 6 HTML export/import native methods
- HTML parsing related private methods

#### `wasm_api/helpers.rs` (~800 lines)
- JSON parsing utilities (json_bool, json_i32, json_u16, json_str, json_color, etc.)
- Color conversion (css_color_to_bgr, color_ref_to_css, etc.)
- HTML processing (ascii_starts_with_ci, find_closing_tag, parse_inline_style, etc.)
- CSS parsing (parse_css_dimension_pt, parse_css_border_shorthand, etc.)
- Border conversion (border_line_type_to_u8_val, border_fills_equal, etc.)

#### `wasm_api/tests.rs` (~1,100 lines max, remainder distributed to feature-specific test files)
- 13,074 lines of tests distributed by feature:
  - `tests/wasm_api_document_tests.rs` — Document creation/loading
  - `tests/wasm_api_rendering_tests.rs` — Rendering
  - `tests/wasm_api_table_tests.rs` — Table operations
  - `tests/wasm_api_text_tests.rs` — Text editing
  - `tests/wasm_api_clipboard_tests.rs` — Clipboard/HTML
  - `tests/wasm_api_formatting_tests.rs` — Formatting
  - `tests/wasm_api_cursor_tests.rs` — Cursor/hit-test

### Risk Management
- `#[wasm_bindgen]` methods remain in main body file (WASM binding constraints)
- Control inter-module access with `pub(crate)` visibility
- Run `cargo clippy` + `cargo test` immediately after each module migration

### Verification Criteria
- `cargo clippy` warnings remain at 0
- `cargo test` all 582 pass
- Docker WASM build succeeds

---

## Step 2: renderer/layout.rs Split

### Current Analysis

- **8,708 lines** — Second largest file
- 22 method groups of `LayoutEngine` struct
- Tests ~740 lines (lines 7965-8701)

### Split Strategy: Directory Modularization

```
src/renderer/layout/
├── mod.rs               ← LayoutEngine struct + core entry points (render_tree_for_page, etc.)
├── text_measurement.rs  ← Text width measurement, MeasureCache, character cluster splitting
├── table_layout.rs      ← layout_table(), layout_partial_table(), cell height calculation
├── shape_layout.rs      ← layout_shape(), layout_group_child_affine(), shape processing
├── picture_layout.rs    ← layout_picture(), layout_caption(), image placement
├── footnote_layout.rs   ← layout_footnote_area(), footnote numbering
├── border_rendering.rs  ← Cell border collection/rendering, transparent borders
├── utils.rs             ← Color/style conversion, font string building, numbering format
└── tests.rs             ← 25+ layout tests
```

### Expected Size Per Module

| Module | Expected Lines | Main Content |
|--------|---------------|-------------|
| `mod.rs` | ~800 | LayoutEngine struct, page/paragraph layout entry points |
| `text_measurement.rs` | ~600 | cached_js_measure, measure_char_width_*, estimate_text_width |
| `table_layout.rs` | ~1,100 | layout_table, layout_partial_table, calc_cell_*, vertical_cell_text |
| `shape_layout.rs` | ~700 | layout_shape, layout_group_child, layout_shape_object |
| `picture_layout.rs` | ~500 | layout_picture, layout_body_picture, layout_caption, compute_object_position |
| `footnote_layout.rs` | ~400 | layout_footnote_area, layout_footnote_paragraph_with_number |
| `border_rendering.rs` | ~500 | build_row_col_x, collect_cell_borders, render_edge_borders |
| `utils.rs` | ~600 | build_1000pt_font_string, style conversion, number format |
| `tests.rs` | ~740 | All layout tests |

### Risk Management
- Since `LayoutEngine`'s `&self` / `&mut self` methods are distributed across modules, manage struct field access with `pub(crate)`
- Watch for cross-calls between table_layout ↔ shape_layout (embedded tables, etc.)

---

## Step 3: renderer/ Remaining Splits (pagination, composer, svg)

### 3-A. pagination.rs (2,264 lines → directory)

```
src/renderer/pagination/
├── mod.rs               ← Paginator struct + paginate() entry point
├── state.rs             ← PaginationState state machine (paginate_with_measured decomposition)
├── header_footer.rs     ← Header/footer collection/application
├── footnote.rs          ← Footnote collection/height calculation/placement
└── tests.rs             ← Pagination tests
```

**Core refactoring**: `paginate_with_measured()` function is **1,460 lines** → Extract state into PaginationState struct and decompose into step-by-step methods

### 3-B. composer.rs (2,026 lines → directory)

```
src/renderer/composer/
├── mod.rs               ← compose_section(), compose_paragraph() entry points, data structures
├── tokenization.rs      ← tokenize_paragraph(), measure_token_width()
├── line_filling.rs      ← fill_lines(), reflow_line_segs()
├── inline_controls.rs   ← identify_inline_controls(), CharOverlap injection
└── tests.rs             ← Composer tests
```

### 3-C. svg.rs (1,292 lines → directory)

```
src/renderer/svg/
├── mod.rs               ← SvgRenderer struct + render_tree() + Renderer trait impl
├── gradient.rs          ← create_gradient_def(), build_gradient_stops()
├── image_rendering.rs   ← render_image_node(), positioned/tiled image, clip path
└── tests.rs             ← SVG tests
```

### Verification Criteria
- Verify with `cargo clippy` + `cargo test` after completing each of 3-A, 3-B, 3-C
- Confirm CC reduction after pagination split (major CC decrease expected for paginate_with_measured)

---

## Step 4: parser + serializer Large File Splits

### 4-A. parser/control.rs (1,744 lines)

```
src/parser/
├── control.rs           ← Keep only parse_control() dispatch (~100 lines)
├── control_table.rs     ← parse_table_control, parse_table_record, parse_cell (~250 lines)
├── control_shape.rs     ← parse_gso_control, shape_component_full, subtypes (~600 lines)
├── control_simple.rs    ← auto_number, bookmark, char_overlap and other simple controls (~200 lines)
├── control_hf.rs        ← header/footer/footnote/endnote/comment (~150 lines)
```

### 4-B. serializer/control.rs (1,520 lines)

Symmetric structure with parser/control.rs:

```
src/serializer/
├── control.rs           ← Keep only serialize_control() dispatch (~100 lines)
├── control_table.rs     ← serialize_table, serialize_table_record (~200 lines)
├── control_shape.rs     ← serialize_shape_control, serialize_shape_component (~300 lines)
├── control_simple.rs    ← Simple control serialization (~150 lines)
├── control_hf.rs        ← header/footer/footnote serialization (~100 lines)
├── control_common.rs    ← serialize_common_obj_attr, common helpers (~150 lines)
```

### 4-C. serializer/cfb_writer.rs (1,516 lines)

```
src/serializer/
├── cfb_writer.rs        ← serialize_hwp, write_hwp_cfb, compress_stream (~200 lines)
├── cfb_writer_tests.rs  ← Round-trip tests (~1,300 lines) - separated with #[cfg(test)]
```

### 4-D. model/table.rs (1,767 lines)

```
src/model/
├── table.rs             ← Table/Cell struct definitions + grid/dimension methods (~500 lines)
├── table_ops.rs         ← insert/delete row/column, merge/split cell (~500 lines)
├── table_tests.rs       ← Table tests (~780 lines) - #[cfg(test)]
```

### Verification Criteria
- Confirm parser/serializer symmetric structure maintained
- All round-trip tests pass

---

## Step 5: Remaining Rust Large Files + Lint Policy Transition

### 5-A. parser/body_text.rs (1,429 lines)

```
src/parser/
├── body_text.rs         ← parse_body_text_section(), record tree processing (~500 lines)
├── body_text_para.rs    ← Detailed paragraph parsing (para_header, char_shapes, line_segs) (~500 lines)
├── body_text_tests.rs   ← Tests (~430 lines)
```

### 5-B. model/paragraph.rs (1,367 lines)

Data structure-centric file — split effect may be limited but exceeds 1,200 lines:

```
src/model/
├── paragraph.rs         ← Paragraph struct + core methods (~700 lines)
├── paragraph_ops.rs     ← Paragraph manipulation methods (split, merge, etc.) (~400 lines)
├── paragraph_tests.rs   ← Tests (~270 lines)
```

### 5-C. serializer/doc_info.rs (1,248 lines)

```
src/serializer/
├── doc_info.rs          ← serialize_doc_info() entry point + properties/mappings (~400 lines)
├── doc_info_styles.rs   ← char_shape, para_shape, style serialization (~400 lines)
├── doc_info_misc.rs     ← tab_def, numbering, bullet, bin_data serialization (~250 lines)
├── doc_info_tests.rs    ← Tests (~200 lines)
```

### 5-D. Lint Policy Transition

After Rust file splitting is complete, transition `Cargo.toml [lints.clippy]` policy:

| Lint | Phase 0 | After Step 5 Completion |
|------|---------|------------------------|
| `too_many_arguments` | allow | warn |
| `type_complexity` | allow | warn |
| `cognitive_complexity` | allow | warn |
| `needless_pass_by_value` | allow | warn |
| 31 code style lints | allow | warn (items fixed during splitting) |

### Verification Criteria
- All Rust files ≤ 1,200 lines
- `cargo clippy` 0 warnings (even under warn policy)
- CC > 25 functions: target 0, document CC > 15 function list if not achievable
- `cargo test` 582+ all pass

---

## Step 6: rhwp-studio TS/CSS Split

### 6-A. input-handler.ts (3,106 lines)

```
rhwp-studio/src/engine/
├── input-handler.ts            ← InputHandler class + initialization/event registration (~400 lines)
├── input-handler-mouse.ts      ← Mouse click/drag/hover handling (~600 lines)
├── input-handler-keyboard.ts   ← Keyboard input handling (~400 lines)
├── input-handler-text.ts       ← Text input/IME composition (~300 lines)
├── input-handler-table.ts      ← Table cell manipulation/resize/move (~500 lines)
├── input-handler-picture.ts    ← Picture insert/move/resize (~400 lines)
├── input-handler-clipboard.ts  ← Copy/paste/cut (~300 lines)
```

### 6-B. style.css (1,588 lines)

Split according to CSS prefix rules:

```
rhwp-studio/src/styles/
├── index.css             ← @import collection + body/base styles (~50 lines)
├── menu-bar.css          ← .md-* menu bar styles (~150 lines)
├── toolbar.css           ← .tb-* toolbar styles (~150 lines)
├── style-bar.css         ← .sb-* formatting bar styles (~150 lines)
├── status-bar.css        ← .stb-* status bar styles (~80 lines)
├── editor.css            ← #scroll-container, editor area (~150 lines)
├── dialogs.css           ← .dialog-* common dialog styles (~200 lines)
├── char-shape-dialog.css ← .cs-* character shape dialog (~100 lines)
├── para-shape-dialog.css ← .ps-* paragraph shape dialog (~100 lines)
├── table.css             ← Table editing UI (~100 lines)
├── picture.css           ← Picture editing UI (~80 lines)
├── context-menu.css      ← Context menu (~60 lines)
```

### 6-C. para-shape-dialog.ts (1,496 lines)

Split by tabs:

```
rhwp-studio/src/ui/
├── para-shape-dialog.ts         ← ParaShapeDialog class + initialization/apply/cancel (~400 lines)
├── para-shape-basic-tab.ts      ← Basic tab (alignment, margins, spacing) (~350 lines)
├── para-shape-extended-tab.ts   ← Extended tab (widow/orphan control, keep with next, etc.) (~200 lines)
├── para-shape-tab-tab.ts        ← Tab settings tab (~250 lines)
├── para-shape-border-tab.ts     ← Border/background tab (~300 lines)
```

### Verification Criteria
- `npx tsc --noEmit` succeeds
- Browser manual testing: all UI features work normally
- All TS/CSS files ≤ 1,200 lines

---

## Final Metrics Verification

After Step 6 completion, run `scripts/metrics.sh`:

| Metric | Baseline | Target |
|--------|---------|--------|
| Files exceeding 1,200 lines | 15 | 0 |
| Clippy warnings (warn policy) | 274 (baseline) | 0 |
| CC > 25 functions | 22 | 0 |
| CC > 15 functions | Unmeasured | Minimize (document list) |
| Tests | 582 passed | 582+ passed |
| Coverage | 55.80% | 70%+ |

## Step-by-Step Schedule and Commit Strategy

| Step | Target | Expected Split File Count | Commit Unit |
|------|--------|--------------------------|-------------|
| Step 1 | wasm_api.rs (24,585 lines) | 10 modules | 2-3 modules at a time |
| Step 2 | layout.rs (8,708 lines) | 9 modules | 2-3 modules at a time |
| Step 3 | pagination + composer + svg (5,582 lines) | 12 modules | Per module unit |
| Step 4 | parser + serializer + table (6,547 lines) | 14 modules | Per file |
| Step 5 | body_text + paragraph + doc_info + lint (4,044 lines) | 10 modules | Per file |
| Step 6 | TS/CSS (6,190 lines) | 24 files | Per component |

**At each step completion**:
1. `cargo clippy` + `cargo test` (Rust)
2. `npx tsc --noEmit` (Step 6)
3. `scripts/metrics.sh` metrics collection
4. Write step completion report
5. Commit to `local/task142` branch
