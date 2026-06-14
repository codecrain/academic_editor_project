# rhwp Project SOLID Principles Code Review Report

> **Target**: rhwp Rust codebase (as of Task 141)  
> **Evaluation criteria**: SOLID principles (10-point scale)  
> **Date**: 2026-02-22  

---

## Overall Score: 5.2 / 10.0

| SOLID Principle | Score | Evaluation Summary |
|---|---|---|
| **S** -- Single Responsibility Principle (SRP) | 3 / 10 | Severely deficient due to multiple God Objects/Files |
| **O** -- Open-Closed Principle (OCP) | 6 / 10 | Some good abstractions like Renderer trait, but incomplete |
| **L** -- Liskov Substitution Principle (LSP) | 7 / 10 | Trait implementations adhere well to contracts |
| **I** -- Interface Segregation Principle (ISP) | 5 / 10 | Renderer trait is appropriate, but wasm_api has a giant interface problem |
| **D** -- Dependency Inversion Principle (DIP) | 5 / 10 | Good module-level separation, but many direct concrete type dependencies |

---

## 1. Single Responsibility Principle (SRP) -- 3/10

SRP violation is the project's most serious structural problem.

### 1.1 Critical: `wasm_api.rs` -- 24,586 lines, 568 items

The most severe SRP violation in the project. A single `HwpDocument` struct handles **all of the following responsibilities** simultaneously:

- File loading/parsing
- SVG/HTML/Canvas rendering
- Pagination
- Text editing (insert/delete/split/merge)
- Table editing (row/column insert/delete/merge/split)
- Character/paragraph formatting changes
- Clipboard (copy/paste/HTML conversion)
- Page setup
- Serialization/saving
- Diagnostics/debug

**This is a classic God Object pattern.** With 568 methods concentrated in a single struct, modifying any one feature can potentially affect the entire 24,000-line file.

### 1.2 Critical: `renderer/layout.rs` -- 8,709 lines

Layout placement, font metrics calculation, WASM JS bridge cache, paragraph numbering state management, text position calculation, and **multiple other concerns** are mixed in a single file.

### 1.3 Major: `renderer/pagination.rs` -- `paginate_with_measured()` single function at 1,456 lines

This single function contains all page splitting logic (table splitting, multi-column handling, header/footer placement, footnote placement, shape placement, master page handling). This is a **function-level SRP violation**, and each concern should be separated into distinct functions/modules.

### 1.4 Major: `main.rs` -- 990 lines

The CLI entry point directly implements several subcommands including `export_svg`, `show_info`, `dump_controls`, `diag_document`, `convert_hwp`. No CLI framework like `clap` is used.

### 1.5 Positive Examples

- The `model/` module is relatively well separated (document, paragraph, table, style, control, etc.)
- Sub-module separation in `parser/` is also good (cfb_reader, doc_info, body_text, header, etc.)
- The `serializer/` module maintains a symmetric structure with parser

---

## 2. Open-Closed Principle (OCP) -- 6/10

### 2.1 Positive Example: `Renderer` trait (renderer/mod.rs:239-257)

```rust
pub trait Renderer {
    fn begin_page(&mut self, width: f64, height: f64);
    fn end_page(&mut self);
    fn draw_text(&mut self, text: &str, x: f64, y: f64, style: &TextStyle);
    fn draw_rect(&mut self, ...);
    fn draw_line(&mut self, ...);
    fn draw_ellipse(&mut self, ...);
    fn draw_image(&mut self, ...);
    fn draw_path(&mut self, commands: &[PathCommand], style: &ShapeStyle);
}
```

4 implementations exist: `SvgRenderer`, `CanvasRenderer`, `HtmlRenderer`, `WebCanvasRenderer`. Adding a PDF backend requires only a new implementation, with no modification to existing code. **OCP best practice.**

### 2.2 Positive Example: `RenderObserver` / `RenderWorker` traits (scheduler.rs)

Well-designed abstractions for async rendering scheduling.

### 2.3 Issues: Parser/Serializer Extensibility

- `ParseError` enum is well-designed as a unified error type, but adding new parsing stages requires adding enum variants (closed structure)
- Adding new HWP control types to the `Control` enum requires simultaneous modifications to parser/control.rs, serializer/control.rs, layout.rs, etc.
- Enums like `NumberFormat`, `AutoNumberType` also require modification across multiple files with scattered match branches

### 2.4 Issue: Conditional Compilation in `wasm_api.rs`

`#[cfg(target_arch = "wasm32")]` and `#[cfg(not(target_arch = "wasm32"))]` are scattered throughout the code. Adding a new platform requires modifying existing code.

---

## 3. Liskov Substitution Principle (LSP) -- 7/10

### 3.1 Positive Examples

- 4 `Renderer` trait implementations (`SvgRenderer`, `CanvasRenderer`, `HtmlRenderer`, `WebCanvasRenderer`) faithfully fulfill the trait contract
- Error conversions like `From<HwpxError> for ParseError` are implemented without information loss

### 3.2 Deficiencies

- Possible **behavioral differences** between `Renderer` trait implementations: `draw_image` has an empty implementation in CanvasRenderer while SvgRenderer does base64 encoding -- insufficient testing for equivalence verification
- `RenderBackend::from_str()` is defined as a custom method instead of implementing the standard `std::str::FromStr` trait

---

## 4. Interface Segregation Principle (ISP) -- 5/10

### 4.1 Positive Example: `Renderer` trait

Contains only 8 core drawing methods, keeping the interface concise. Each backend implements only what it needs. **ISP best practice.**

### 4.2 Issue: Giant Interface of `HwpDocument` (wasm_api.rs)

The `#[wasm_bindgen] impl HwpDocument` block has **100+ public methods**. From the JS client's perspective, a "viewer that only needs document rendering" and an "editor that needs editing" must use the **same interface**.

Separation proposal:
| Interface Area | Responsibility |
|---|---|
| `HwpViewer` | Loading, rendering, page info |
| `HwpEditor` | Text/table editing, formatting changes |
| `HwpSerializer` | Serialization, saving |
| `HwpClipboard` | Copy/paste |

### 4.3 Issue: Lack of Traits

Across the entire project, there are only three business-logic-level traits: `Renderer`, `RenderObserver`, and `RenderWorker`. Core features like parsing, serialization, and editing have no trait abstractions, making test mocking difficult and implementation swapping impossible.

---

## 5. Dependency Inversion Principle (DIP) -- 5/10

### 5.1 Positive Example: Module-level Layer Separation

```
lib.rs
 +-- model/     (data model -- no dependencies)
 +-- parser/    (depends on model)
 +-- renderer/  (depends on model)
 +-- serializer/(depends on model)
 +-- wasm_api   (depends on everything)
```

`model` is a pure data layer with no external dependencies. The parser -> model <- renderer structure has dependencies pointing inward (toward model).

### 5.2 Issue: Direct Concrete Type Dependencies

- `layout.rs` has some `dyn Renderer` usage but also directly references concrete types like `SvgRenderer`, `CanvasRenderer`
- `wasm_api.rs` directly calls **concrete functions** like `parser::parse_hwp()`, `serializer::serialize_hwp()`. No abstraction layer (e.g., `trait DocumentParser`) exists
- `#[cfg(target_arch = "wasm32")]` blocks in `layout.rs` directly depend on JS interfaces, causing code to differ significantly based on compilation target

### 5.3 Issue: Bidirectional Dependency of wasm_api

`wasm_api.rs` directly depends on all 4 modules, while simultaneously implementing all logic directly inside `HwpDocument`. Rather than delegating via the Facade pattern, it contains the business logic itself, so **changes in any module effectively affect this file**.

---

## File Size Distribution (Top 15)

| Rank | File | Lines | Notes |
|---|---|---|---|
| 1 | `wasm_api.rs` | 24,586 | God Object |
| 2 | `renderer/font_metrics_data.rs` | 9,818 | Auto-generated data (acceptable) |
| 3 | `renderer/layout.rs` | 8,709 | Multiple responsibilities |
| 4 | `renderer/pagination.rs` | 2,265 | Contains giant function |
| 5 | `renderer/composer.rs` | 2,027 | Good |
| 6 | `model/table.rs` | 1,768 | Good (domain complexity) |
| 7 | `parser/control.rs` | 1,744 | Good |
| 8 | `serializer/control.rs` | 1,520 | Good |
| 9 | `serializer/cfb_writer.rs` | 1,516 | Good |
| 10 | `parser/body_text.rs` | 1,429 | Good |
| | **Total** | **78,463 lines** | |

---

## Improvement Priority Recommendations

### P0 (Immediate Start Recommended)

1. **Split `wasm_api.rs`**: Separate document viewing, editing, serialization, and clipboard into distinct modules. `HwpDocument` becomes a Facade performing only delegation.

### P1 (Mid-term Improvements)

2. **Decompose `paginate_with_measured()` 1,456-line function**: Extract table splitting, multi-column handling, header/footer, etc. into separate functions
3. **Split `layout.rs`**: Separate text measurement, WASM cache, numbering state management into separate files

### P2 (Long-term Improvements)

4. **Introduce trait abstractions for parser/serializer**: Improve testability
5. **Adopt CLI framework for `main.rs`**: Use `clap` crate
6. **Separate `HwpDocument` interface by role**: Viewer / Editor / Serializer

---

## Conclusion

The rhwp project demonstrates good design judgment at the **module-level architecture** (model/parser/renderer/serializer 4-layer) and **Renderer trait abstraction**. In particular, the model layer being pure data with no external dependencies and the symmetric parser-serializer structure are advantageous for maintainability.

However, the massive God Object of `wasm_api.rs` (24,586 lines), along with oversized files/functions like `paginate_with_measured()` (1,456 lines) and `layout.rs` (8,709 lines), severely violate SRP, significantly dragging down the entire project's SOLID score. This structural debt could impede development speed and increase bug probability during the upcoming productization (Phases 1~2), so splitting `wasm_api.rs` should be the top priority.
