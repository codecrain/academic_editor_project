# rhwp Project 2nd Code Review Report

> **Target**: rhwp Rust codebase (78,463 lines, 4 modules)  
> **Scope**: 1st SOLID review + in-depth analysis of `wasm_api.rs` and `layout.rs` integrated  
> **Date**: 2026-02-22  

---

## Review History

| Phase | Report | Target | Score |
|---|---|---|---|
| 1st | [r-code-review-report.md](r-code-review-report.md) | Project-wide SOLID principles | 5.2 / 10 |
| 2nd-A | [wasm-api-quality-report.md](wasm-api-quality-report.md) | `wasm_api.rs` -- 12-item detailed evaluation | 4.8 / 10 |
| 2nd-B | [layout-quality-report.md](layout-quality-report.md) | `layout.rs` -- 12-item detailed evaluation | 4.5 / 10 |

---

## Overall Diagnosis: Project Code Quality Score

### Project Overall: 5.4 / 10.0

| Evaluation Area | Score | Basis |
|---|---|---|
| **Architecture** | 7 / 10 | Good model/parser/renderer/serializer 4-layer separation, Renderer trait best practice |
| **File structure** | 3 / 10 | 2 files (wasm_api + layout) account for 42% of total |
| **Function complexity** | 3 / 10 | 921-line (build_render_tree), 1,456-line (paginate_with_measured) giant functions |
| **Code duplication** | 3 / 10 | JSON parser 13x, ShapeObject matching 61x, table boilerplate 8x repetition |
| **Error handling** | 7 / 10 | Consistent Result + HwpError, minimized unwrap |
| **Documentation** | 7 / 10 | 698 doc comments, 92% coverage |
| **Testing** | 6 / 10 | 488 passing, but layout area coverage lacking |
| **Type safety** | 5 / 10 | Manual JSON parsing, unchecked `as` casting |
| **Naming** | 8 / 10 | Consistent rules (_native, _in_cell, layout_*) |
| **Extensibility** | 4 / 10 | Only Renderer trait is good; other areas require multi-file modification for extension |

---

## Identified Key Issues -- Top 5

### 1. God Object: `wasm_api.rs` (24,586 lines, 568 items)

A single `HwpDocument` struct handles **9 roles** (loading, rendering, text editing, table editing, formatting, clipboard, HTML conversion, serialization, cursor/hit testing) simultaneously. 31% of the entire project is concentrated in this file.

| Quantitative Metric | Value |
|---|---|
| Public methods (WASM bindings) | 100+ |
| Native implementations (_native) | 200+ |
| Duplicate JSON parser definitions | 13x |
| `format!("{{` manual JSON generation | 39x |
| `raw_stream = None` repetition | 55x |
| `self.paginate()` calls | 45x |

**Impact**: Every feature change must touch this file, maximizing merge conflict probability, code review burden, and new developer onboarding costs.

### 2. Giant Functions: `build_render_tree()` 921 lines, `paginate_with_measured()` 1,456 lines

Two functions individually handle **all page element placement** and **all page splitting logic** respectively.

| Function | File | Lines | Parameters |
|---|---|---|---|
| `paginate_with_measured()` | pagination.rs | 1,456 | -- |
| `build_render_tree()` | layout.rs | 921 | 12 |
| `layout_composed_paragraph()` | layout.rs | 421 | 14 |
| `layout_table()` | layout.rs | 500+ | 16 |
| `layout_inline_table_paragraph()` | layout.rs | 372 | 12 |

**10~29x** the industry-recommended function size (50~100 lines).

### 3. ShapeObject Pattern Matching Repeated 61 Times

Due to the absence of a `common()` method on the `ShapeObject` enum, identical code matching 8 variants repeats in layout.rs across **at least 6 locations, 61 times**.

```rust
// This 8-line block repeats in 6 places
let common = match shape {
    ShapeObject::Line(s) => &s.common,
    ShapeObject::Rectangle(s) => &s.common,
    ShapeObject::Ellipse(s) => &s.common,
    ShapeObject::Arc(s) => &s.common,
    ShapeObject::Polygon(s) => &s.common,
    ShapeObject::Curve(s) => &s.common,
    ShapeObject::Group(g) => &g.common,
    ShapeObject::Picture(p) => &p.common,
};
```

Adding a new shape type requires **modifying 6+ locations simultaneously** -- OCP violation.

### 4. JSON Utility Absence (serde not used)

Issues arising from intentionally not using `serde`:

- **Parsing**: Functions like `parse_u32()`, `parse_bool()` are **duplicated 13 times in 4 different locations**
- **Generation**: `format!("{{\"ok\":true,...}}` pattern appears **39 times** -- risk of missing special character escaping
- **Type safety**: JSON key typos cannot be caught at compile time

### 5. Table Layout Code Duplication

`layout_table()` (for body text) and `layout_embedded_table()` (for textbox interiors) repeat **~200 lines of nearly identical logic**: column width calculation -> row height calculation -> cumulative position -> cell background -> border collection -> cell padding -> cell paragraph layout.

---

## Confirmed Strengths

### 1. Architecture Design (7/10)

```
model/ (pure data, 0 external dependencies)
  ^         ^         ^
parser/ -> model <- renderer/
                     ^
               serializer/
```

Clean layered structure with dependency direction pointing **inward (model)**. Parser-serializer symmetric structure maintained.

### 2. Renderer Trait Abstraction (8/10)

```rust
pub trait Renderer {
    fn begin_page(&mut self, width: f64, height: f64);
    fn draw_text(&mut self, text: &str, x: f64, y: f64, style: &TextStyle);
    fn draw_rect(&mut self, ...);
    // 8 core methods total
}
```

4 implementations (SVG, Canvas, HTML, WebCanvas) exist. Adding a PDF backend requires no modification to existing code. **OCP + ISP best practice.**

### 3. Error Handling Pattern (7/10)

- Unified `HwpError` enum + consistent `Result<T, HwpError>` usage
- `From<HwpError> for JsValue` fully bridges WASM errors
- Minimal `unwrap()`/`expect()` usage (almost none outside tests)
- Safe `.get()` + `ok_or_else()` pattern for index access

### 4. Documentation (7/10)

| File | Doc comment count | Item count | Coverage |
|---|---|---|---|
| wasm_api.rs | 523 | 568 | 92% |
| layout.rs | 175 | 133 | 100%+ |
| **Total** | 698+ | 701 | ~100% |

Consistent Korean documentation, explicit HWP spec references, Phase-labeled comments for functional area separation.

### 5. WASM Wrapper Pattern (6/10)

```rust
// WASM binding (thin wrapper)
pub fn insert_text(...) -> Result<String, JsValue> {
    self.insert_text_native(...).map_err(|e| e.into())
}

// Native implementation (testable)
pub fn insert_text_native(...) -> Result<String, HwpError> {
    // actual logic
}
```

Separating WASM bindings and business logic enables **direct testing in native environments**. Thanks to this pattern, file splitting using Rust's distributed `impl` blocks is possible **without API changes**.

---

## Two Key Files Comparative Analysis

| Item | wasm_api.rs | layout.rs |
|---|---|---|
| **Lines** | 24,586 | 8,709 |
| **Largest function** | ~200 lines | **921 lines** |
| **Number of roles** | 9 | 7 |
| **Test count** | 112 (53%) | 22 (8.6%) |
| **Key duplication pattern** | JSON parser 13x | ShapeObject matching 61x |
| **Overall score** | 4.8/10 | 4.5/10 |
| **Character** | High volume but simple functions | Lower volume but extremely complex functions |
| **Refactoring difficulty** | Medium (distributed impl available) | **High** (giant function decomposition required) |

> **Key insight**: wasm_api.rs is a **quantitative problem** (file too large), layout.rs is a **qualitative problem** (functions too complex). The approach strategies differ.

---

## Refactoring Priority (Overall)

Arranged by **score improvement impact**, while maintaining all 488 existing tests and external API compatibility.

### P0 -- Immediate Start (Expected SOLID +3.0 points)

| # | Task | Effect | Difficulty |
|---|---|---|---|
| 1 | **Add `ShapeObject::common()` method** | 61x duplication -> 1 line, OCP improvement | Low |
| 2 | **JSON utility consolidation** (parse_u32 etc. -> single module) | DRY improvement, 13x duplication removed | Low |
| 3 | **Table edit post-processing helper extraction** (`invalidate_and_repaginate()`) | 8-function boilerplate removal | Low |

> P0 represents **quick wins with minimal code changes and low risk but high impact**.

### P1 -- Mid-term Improvements (Expected SOLID +2.5 points)

| # | Task | Effect | Difficulty |
|---|---|---|---|
| 4 | **`wasm_api.rs` role-based module split** | SRP +4, ISP +3, major maintainability improvement | Medium |
| 5 | **`build_render_tree()` 921-line decomposition** | Function complexity improvement, profiling enabled | Medium |
| 6 | **Table layout unification** (layout_table + layout_embedded_table) | 200 lines duplication removed | Medium |

### P2 -- Long-term Improvements (Expected SOLID +1.5 points)

| # | Task | Effect | Difficulty |
|---|---|---|---|
| 7 | **`paginate_with_measured()` 1,456-line decomposition** | Single function complexity resolution | High |
| 8 | **Parser/Serializer trait abstraction** | OCP/DIP improvement, test mocking enabled | High |
| 9 | **layout.rs file split** (text/table/shape/footnote -> separate files) | SRP, extensibility improvement | High |
| 10 | **main.rs CLI cleanup** (clap adoption) | SRP, OCP minor improvement | Medium |

---

## Expected Scores After Refactoring

| Stage | Tasks | Expected Score |
|---|---|---|
| Current | -- | **5.4 / 10** |
| After P0 | Quick win 3 items | **6.8 / 10** |
| After P1 | File split + function decomposition | **8.2 / 10** |
| After P2 | Trait abstraction + full cleanup | **9.2+ / 10** |

---

## Impact Assessment on Productization

### Current Code Quality Risks for Productization

| Risk | Current Impact | After P0 |
|---|---|---|
| **Phase 1 (HTML->HWP)** | Medium -- file expansion burden when adding new methods to wasm_api.rs | Low |
| **Phase 2 (MCP Server)** | High -- God Object structure blocks native API design | Medium |
| **PyO3 Bindings** | Medium -- need to select public APIs from 568 methods | Low |
| **Multi-developer Collaboration** | High -- single file concentration causes frequent merge conflicts | Low |

### Recommendation

**Execute P0 3 items immediately, then begin Phase 1 productization** -- this is the optimal strategy. P0 involves minimal code changes (each within 1 day), does not change APIs, does not affect existing tests, and establishes the foundation for subsequent work.

P1 (file splitting) can be done **in parallel** with Phase 1. Using Rust's distributed `impl` blocks, the public API of `HwpDocument` remains unchanged while only the implementations are moved to role-based files.

---

## Conclusion

The rhwp project has **very high functional completeness**: 488 tests passing, full HWP binary read/render/edit/save pipeline working, and Hancom Office compatibility verified. Module-level architecture separation (model/parser/renderer/serializer) and the Renderer trait abstraction represent good design judgment.

However, **implementation-level quality has not kept pace with architecture-level quality**. 42% of all code is concentrated in 2 files, 921-line and 1,456-line giant functions exist, and identical code is repeated up to 61 times. This is a result of prioritizing rapid development speed during the POC stage, and represents **technical debt that must be resolved before productization**.

Fortunately, **the refactoring barrier is low**: the 3 P0 items (ShapeObject::common, JSON utility, table edit helper) can each be completed within 1 day and do not affect API compatibility. These quick wins alone can raise the overall score from 5.4 to 6.8.

> **One-line summary**: "The design is good and functionality is complete, but implementation must catch up to the design for it to become a product."
