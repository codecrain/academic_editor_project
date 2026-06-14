# rhwp Code Refactoring Strategy

> **Baseline**: [SOLID Code Review](r-code-review-report.md) current score 5.2 -> target 9.2+  
> **Principle**: Maintain all 488 existing tests passing, preserve external API compatibility  
> **Date**: 2026-02-22  

---

## Score Improvement Roadmap

| SOLID Principle | Current | Target | Key Method |
|---|---|---|---|
| **SRP** | 3 -> | 9 | Split wasm_api.rs, split layout.rs, decompose large functions |
| **OCP** | 6 -> | 9 | Parser/serializer trait abstraction, platform isolation |
| **LSP** | 7 -> | 10 | Trait implementation consistency verification, standard trait implementation |
| **ISP** | 5 -> | 9 | Separate HwpDocument into role-based interfaces |
| **DIP** | 5 -> | 9 | Trait-based dependency injection, eliminate concrete type dependencies |
| **Overall** | **5.2** -> | **9.2** | |

---

## Phase Structure

```
Phase 1 --- wasm_api.rs split (SRP +4, ISP +3, DIP +2)
  |          Largest score improvement, highest risk
  |
Phase 2 --- Large function/file decomposition (SRP +2)
  |          paginate_with_measured 1,456 lines -> 10 or fewer functions
  |          layout.rs 8,709 lines -> 4~5 modules
  |
Phase 3 --- Trait abstraction introduction (OCP +3, DIP +3, LSP +2)
  |          Parser/Serializer/Editor traits, standard trait implementations
  |
Phase 4 --- main.rs cleanup and polishing (SRP +1, OCP +1)
             CLI framework adoption, final review
```

---

## Phase 1: wasm_api.rs Split (Target: SRP 3->7, ISP 5->8, DIP 5->7)

### 1.1 Current State Diagnosis

`wasm_api.rs` is 24,586 lines with 568 items, accounting for **31%** of the entire project (78,463 lines).

**Internal structure analysis** reveals that methods already fall into clear categorical patterns:

| Functional Area | WASM Bindings | Native Implementation | Tests |
|---|---|---|---|
| Viewing/Rendering | `render_page_svg()` etc. | `render_page_native()` etc. | `test_render_*` |
| Text Editing | `insert_text()` etc. | `insert_text_native()` etc. | `test_insert_text_*` |
| Table Editing | `insert_table_row()` etc. | `create_table_native()` etc. | `test_*_table_*` |
| Formatting | `apply_char_format()` etc. | `apply_char_format_native()` etc. | `test_apply_*` |
| Clipboard | `copy_selection()` etc. | `copy_selection_native()` etc. | `test_clipboard_*` |
| HTML Conversion | `paste_html()` etc. | `paste_html_native()` etc. | `test_paste_html_*` |
| Serialization/Save | `export_hwp()` etc. | `export_hwp_native()` etc. | `test_export_*` |
| Diagnostics/Info | `get_page_info()` etc. | Same | `test_*_info_*` |

> **Key finding**: All WASM methods are **thin wrappers** that call `_native` suffixed native implementations. Leveraging this structure, native implementations can be moved to separate modules while WASM bindings only perform delegation.

### 1.2 Split Strategy: Role-based Module Separation

```
src/
+-- wasm_api.rs              <- Facade (keep only HwpDocument + WASM bindings)
+-- wasm_api/                <- [New] Native implementation modules
|   +-- mod.rs               <- HwpDocument struct definition + shared utilities
|   +-- viewer.rs            <- Viewing: rendering, page info, DPI
|   +-- text_editor.rs       <- Text editing: insert/delete/split/merge
|   +-- table_editor.rs      <- Table editing: row/column CRUD, cell merge/split
|   +-- formatting.rs        <- Formatting: char/para shape changes, fonts
|   +-- clipboard.rs         <- Clipboard: copy/paste
|   +-- html_converter.rs    <- HTML conversion: import/export
|   +-- serializer.rs        <- Serialization: HWP save, empty document creation
|   +-- diagnostics.rs       <- Diagnostics: document info, debug
|   +-- cursor.rs            <- Cursor movement, hit testing
```

### 1.3 Implementation Approach

**Core principle**: Rust `impl` blocks can be defined across multiple files. Define the `HwpDocument` struct in `wasm_api/mod.rs`, and implement methods in `impl HwpDocument` blocks in each role-based module.

```rust
// src/wasm_api/mod.rs
pub struct HwpDocument {
    pub(crate) doc: Document,
    pub(crate) composed: Vec<Vec<ComposedParagraph>>,
    pub(crate) pagination: Vec<PaginationResult>,
    pub(crate) render_trees: Vec<Vec<PageRenderTree>>,
    pub(crate) clipboard: Option<ClipboardData>,
    pub(crate) dpi: f64,
    // ...
}

// Shared helper methods
impl HwpDocument {
    pub(crate) fn repaginate_section(&mut self, section_idx: usize) { ... }
    pub(crate) fn get_section(&self, idx: usize) -> Result<&Section, HwpError> { ... }
}
```

```rust
// src/wasm_api/text_editor.rs
use super::HwpDocument;

impl HwpDocument {
    pub fn insert_text_native(&mut self, ...) -> Result<String, HwpError> { ... }
    pub fn delete_text_native(&mut self, ...) -> Result<String, HwpError> { ... }
    pub fn split_paragraph_native(&mut self, ...) -> Result<String, HwpError> { ... }
    // ...
}
```

```rust
// src/wasm_api.rs (final form — WASM binding Facade)
mod wasm_api_impl; // or internal pub mod wasm_api module

#[wasm_bindgen]
impl HwpDocument {
    // Each method is a 1~3 line wrapper calling native implementation
    pub fn insert_text(&mut self, ...) -> Result<String, JsValue> {
        self.insert_text_native(...).map_err(|e| e.into())
    }
}
```

### 1.4 Test Splitting

Currently there are approximately 170+ tests in the `#[cfg(test)] mod tests` block inside wasm_api.rs. These will be separated by functionality:

```
src/wasm_api/
+-- tests/
|   +-- viewer_tests.rs
|   +-- text_editor_tests.rs
|   +-- table_editor_tests.rs
|   +-- formatting_tests.rs
|   +-- clipboard_tests.rs
|   +-- html_converter_tests.rs
|   +-- serializer_tests.rs
|   +-- diagnostics_tests.rs
```

### 1.5 Risk Management

| Risk | Mitigation |
|---|---|
| WASM binding compatibility breaks | JS interface remains unchanged — only internal modularization |
| `pub(crate)` visibility issues | Set `HwpDocument` fields to `pub(crate)` to allow same-crate access |
| Circular dependencies | Place shared helpers in `mod.rs` to prevent cycles |
| Inability to verify incrementally | Move one module at a time, run `cargo test` after each |

---

## Phase 2: Large Function/File Decomposition (Target: SRP 7->9)

### 2.1 `paginate_with_measured()` 1,456 lines -> 10 or fewer functions

This function currently includes all of the following responsibilities:

| Responsibility | Proposed Extracted Function | Est. Lines |
|---|---|---|
| Table splitting (intra-row) | `split_table_across_pages()` | ~300 |
| Multi-column handling | `layout_multi_column()` | ~200 |
| Header/footer placement | `resolve_header_footer()` | ~150 |
| Footnote placement | `layout_footnotes()` | ~150 |
| Shape/image placement | `layout_floating_shapes()` | ~100 |
| Master page handling | `resolve_master_page()` | ~50 |
| Page boundary determination | `advance_page()` | ~100 |
| Body paragraph placement | `layout_body_paragraphs()` | ~200 |
| Entry point/coordination | `paginate_with_measured()` (after refactoring) | ~100 |

**Implementation approach**: Extract Function refactoring. Bundle local variables into a context struct for passing.

```rust
/// Pagination progress state
struct PaginationContext<'a> {
    paragraphs: &'a [Paragraph],
    measured: &'a MeasuredSection,
    page_def: &'a PageDef,
    column_def: &'a ColumnDef,
    current_page: PageContent,
    current_y: f64,
    // ...
}
```

### 2.2 `layout.rs` 8,709 lines -> 4~5 modules

| Split Target | New File | Est. Lines | Reason |
|---|---|---|---|
| WASM JS measurement cache | `renderer/wasm_measure.rs` | ~150 | Isolate platform-dependent code |
| Text position calculation | `renderer/text_layout.rs` | ~2,000 | Independent concern |
| Table layout | `renderer/table_layout.rs` | ~2,000 | Independent concern |
| Paragraph numbering state | `renderer/numbering.rs` | ~200 | Independent concern |
| Shape layout | `renderer/shape_layout.rs` | ~1,500 | Independent concern |
| Core layout | `renderer/layout.rs` (remaining) | ~2,800 | Coordination/entry point |

### 2.3 `main.rs` 990 lines -> Modularized

```
src/
+-- main.rs              <- Entry point only (under 50 lines)
+-- cli/
|   +-- mod.rs           <- CLI parsing (clap crate)
|   +-- export_svg.rs    <- SVG export command
|   +-- show_info.rs     <- Document info command
|   +-- dump_controls.rs <- Control dump command
|   +-- convert.rs       <- Conversion command
|   +-- diagnostics.rs   <- Diagnostics command
```

---

## Phase 3: Trait Abstraction Introduction (Target: OCP 6->9, DIP 5->9, LSP 7->10)

### 3.1 Core Trait Design

```rust
// src/parser/mod.rs
pub trait DocumentParser {
    fn parse(&self, data: &[u8]) -> Result<Document, ParseError>;
    fn detect_format(&self, data: &[u8]) -> FileFormat;
}

// src/serializer/mod.rs
pub trait DocumentSerializer {
    fn serialize(&self, doc: &Document) -> Result<Vec<u8>, SerializeError>;
}

// src/wasm_api/mod.rs (or separate editor module)
pub trait TextEditor {
    fn insert_text(&mut self, section: usize, para: usize, offset: usize, text: &str) -> Result<(), HwpError>;
    fn delete_text(&mut self, section: usize, para: usize, offset: usize, count: usize) -> Result<usize, HwpError>;
    fn split_paragraph(&mut self, section: usize, para: usize, offset: usize) -> Result<usize, HwpError>;
    fn merge_paragraph(&mut self, section: usize, para: usize) -> Result<usize, HwpError>;
}

pub trait TableEditor {
    fn insert_row(&mut self, section: usize, para: usize, ctrl: usize, row: u16, below: bool) -> Result<(), HwpError>;
    fn insert_column(&mut self, section: usize, para: usize, ctrl: usize, col: u16, right: bool) -> Result<(), HwpError>;
    fn delete_row(&mut self, section: usize, para: usize, ctrl: usize, row: u16) -> Result<(), HwpError>;
    fn delete_column(&mut self, section: usize, para: usize, ctrl: usize, col: u16) -> Result<(), HwpError>;
    fn merge_cells(&mut self, ...) -> Result<(), HwpError>;
    fn split_cell(&mut self, ...) -> Result<(), HwpError>;
}
```

### 3.2 Standard Trait Implementations

| Current | Improvement |
|---|---|
| `RenderBackend::from_str()` custom method | `impl std::str::FromStr for RenderBackend` |
| `ParseError` manual `Display` | Use `thiserror` crate |
| `HwpError` manual conversion | Systematic `impl From<ParseError> for HwpError` etc. |

### 3.3 Platform Code Isolation

```rust
// src/renderer/measure.rs
pub trait TextMeasurer {
    fn measure_char_width(&self, font: &str, ch: char, font_size: f64) -> f64;
}

// src/renderer/native_measure.rs
pub struct NativeMeasurer { /* font_metrics_data based */ }
impl TextMeasurer for NativeMeasurer { ... }

// src/renderer/wasm_measure.rs
#[cfg(target_arch = "wasm32")]
pub struct WasmMeasurer { /* JS measureText calls */ }
#[cfg(target_arch = "wasm32")]
impl TextMeasurer for WasmMeasurer { ... }
```

This way, `#[cfg(target_arch = "wasm32")]` only exists at each module's declaration, while business logic uses `dyn TextMeasurer` for abstraction.

---

## Phase 4: Polishing (Target: All items 9+ points)

### 4.1 CLI Framework Adoption

Use the `clap` crate to declaratively define subcommands.

```rust
#[derive(Parser)]
#[command(name = "rhwp", about = "HWP document processing tool")]
enum Cli {
    ExportSvg(ExportSvgArgs),
    Info(InfoArgs),
    Dump(DumpArgs),
    Convert(ConvertArgs),
    Diag(DiagArgs),
}
```

### 4.2 Module Dependency Verification

Final dependency structure:

```
                    +----------+
                    |  model/  |  <- Pure data (no dependencies)
                    +--+---+---+
                 +-----+   +-----+
          +------v------+ +------v------+
          |  parser/    | | serializer/ |  <- Depends only on model
          +------+------+ +------+------+
                 |               |
          +------v---------------v------+
          |       renderer/             |  <- Depends only on model
          |  +----------+ +----------+  |
          |  | layout/  | | paginate |  |  <- Depends on Measurer trait
          |  +----------+ +----------+  |
          +-------------+---------------+
                        |
          +-------------v---------------+
          |       wasm_api/             |  <- Facade (delegation only)
          |  +--------+ +--------+     |
          |  | viewer | | editor | ... |  <- Trait implementations
          |  +--------+ +--------+     |
          +-----------------------------+
```

### 4.3 Documentation Enhancement

Strengthen `//!` doc comments for each module, and achieve 100% `///` documentation comments for all `pub` items.

---

## Execution Order and Expected Impact

| Step | Phase | Task | SOLID Score Change | Risk |
|---|---|---|---|---|
| 1 | P1 | `wasm_api/mod.rs` struct separation | SRP +1 | Low |
| 2 | P1 | `wasm_api/viewer.rs` method migration | SRP +0.5, ISP +0.5 | Low |
| 3 | P1 | `wasm_api/text_editor.rs` migration | SRP +0.5 | Low |
| 4 | P1 | `wasm_api/table_editor.rs` migration | SRP +0.5 | Low |
| 5 | P1 | `wasm_api/formatting.rs` migration | SRP +0.5 | Low |
| 6 | P1 | `wasm_api/clipboard.rs` migration | SRP +0.5 | Low |
| 7 | P1 | `wasm_api/html_converter.rs` migration | SRP +0.5 | Low |
| 8 | P1 | `wasm_api/serializer.rs` + remaining | SRP +0.5, ISP +2.5 | Low |
| 9 | P1 | Test splitting + full verification | -- | Medium |
| 10 | P2 | `paginate_with_measured()` function decomposition | SRP +1 | Medium |
| 11 | P2 | `layout.rs` module split | SRP +1 | Medium |
| 12 | P3 | Parser/Serializer trait introduction | OCP +1.5, DIP +2 | Low |
| 13 | P3 | TextMeasurer trait introduction | OCP +1, DIP +1.5 | Medium |
| 14 | P3 | Editor trait introduction | OCP +0.5, DIP +0.5 | Low |
| 15 | P3 | Standard trait implementations (FromStr, thiserror) | LSP +3 | Low |
| 16 | P4 | CLI clap adoption, main.rs cleanup | SRP +1, OCP +1 | Low |

---

## Verification Plan

The following is repeated at every step:

```bash
# 1. Native build (compilation verification)
cargo build

# 2. All tests pass (functional regression verification)
cargo test

# 3. WASM build (cross-compilation verification)
# Using Docker environment
docker compose --env-file .env.docker run --rm wasm

# 4. Release build (optimization verification)
cargo build --release
```

**Additional verification upon Phase 1 completion**:
- wasm_api.rs contains only WASM binding wrappers (under 2,000 lines)
- Each module file is under 3,000 lines
- `cargo doc --no-deps` generates documentation successfully

**Upon final completion**:
- SOLID review re-evaluation -> confirm 9.2+ score achieved
- All files under 3,000 lines (excluding font_metrics_data.rs)
- All functions under 200 lines
- Confirm mock implementations work in trait tests

---

## Strategy Summary

Splitting the God Object in wasm_api.rs (24,586 lines) into role-based modules provides the **largest score improvement** (SRP +4, ISP +3, DIP +2). Since WASM wrapper + `_native` implementation pair patterns already exist internally, modularization is possible **without any API changes** by leveraging Rust's distributed `impl` blocks.

Completing Phase 2's large function/file decomposition and Phase 3's trait abstraction will make the leap from 5.2 to 9.2+ achievable.
