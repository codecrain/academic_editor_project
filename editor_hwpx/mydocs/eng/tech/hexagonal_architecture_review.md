# Hexagonal Architecture Transition Review Report

Date: 2026-03-23

## 1. Overview

This report evaluates the current architecture of the rhwp project from a Hexagonal Architecture (Ports/Adapters pattern) perspective and reviews the feasibility of a full transition.

## 2. Hexagonal Architecture Concept

```
[Driving Adapter]  ->  [Port]  ->  [Domain Core]  <-  [Port]  <-  [Driven Adapter]
(Requester)            (Interface)    (Business Logic)   (Interface)    (Implementation)

Driving (Primary):              Driven (Secondary):
- CLI (main.rs)                 - HWP Parser (file input)
- WASM API (wasm_api.rs)        - HWP Serializer (file output)
- REST API (future)             - SVG Renderer (output)
                                - Canvas Renderer (output)
                                - Font Metrics (external data)
```

Core principle:
- Domain Core has **no dependencies** on external adapters
- External adapters access Core through Ports (Traits)
- Dependency direction is always **outside -> inside**

## 3. Current Structure Analysis

### 3.1 Module Dependency Direction

```
parser -> model                    Correct
serializer -> model                Correct
renderer -> model                  Correct
wasm_api -> document_core, model   Correct (driving adapter)
main.rs -> document_core, model    Correct (driving adapter)

document_core -> model             Correct
document_core -> renderer          100 couplings (core issue)
model -> parser                    1 violation (HWPTAG constants)
model -> serializer                1 violation
```

### 3.2 Areas Already Close to Hexagonal

| Area | Hexagonal Role | Current State | Assessment |
|------|---------------|---------------|------------|
| model | Domain Core (data) | Pure data structures, nearly zero dependencies | Perfect |
| parser | Driven Adapter (input) | Depends only on model, no coupling to other modules | Perfect |
| serializer | Driven Adapter (output) | Depends only on model | Good |
| wasm_api.rs | Driving Adapter | Thin wrapper of DocumentCore (Deref pattern) | Perfect |
| main.rs | Driving Adapter | CLI entry point | Perfect |
| Renderer trait | Port Abstraction | SVG/HTML/Canvas backend swappable | Already exists |

### 3.3 Hexagonal Principle Violation: document_core -> renderer Coupling

**document_core has 100 dependencies on renderer**. In hexagonal architecture, the Domain Core must not depend on externals.

#### Coupling Detailed Breakdown

| Coupling Type | Location | Count | Separation Difficulty |
|---------------|----------|-------|----------------------|
| Struct fields | `document_core/mod.rs` | 9 | Very high |
| Rendering queries | `queries/rendering.rs` | 25 | High |
| Cursor calculations | `queries/cursor_rect.rs`, `cursor_nav.rs` | 31 | Very high |
| Layout in commands | `commands/*.rs` | 35 | High |

#### Specific Coupling Examples

**A. DocumentCore Fields (mod.rs)**
```rust
pub struct DocumentCore {
    // Directly holds types from the renderer module as fields
    pub pagination_result: Option<PaginationResult>,    // renderer::pagination
    pub measured_sections: Vec<MeasuredSection>,         // renderer::height_measurer
    pub resolved_styles: Option<ResolvedStyleSet>,       // renderer::style_resolver
    pub composed_paragraphs: Vec<ComposedParagraph>,     // renderer::composer
    // ...
}
```

**B. Cursor Position Calculation (cursor_rect.rs)**
```rust
// Directly traverses RenderNode (renderer type)
fn find_cursor_in_tree(tree: &PageRenderTree, ...) {
    for node in &tree.nodes {
        match &node.node_type {
            RenderNodeType::TextLine { ... } => { ... }
            // Deeply coupled to renderer internals
        }
    }
}
```

**C. Reflow in Edit Commands (commands/text_editing.rs)**
```rust
// Immediately performs line reflow after text insertion
self.reflow_line_segs(section_idx, para_idx);  // calls renderer's composer
```

## 4. Full Transition Cost Analysis

### 4.1 Required Work

#### Port (Trait) Definitions Needed at 4 Boundaries

| Port | Abstraction Target | Impact Scope |
|------|--------------------|-------------|
| LayoutPort | compose_paragraph, reflow_line_segs, compute_char_positions | 35 items in commands |
| PaginationPort | Paginator, PaginationResult, PageItem | 25 items in queries |
| RenderTreePort | PageRenderTree, RenderNode traversal | 31 items in cursor |
| StyleResolverPort | resolve_styles, ResolvedStyleSet | 9 items in mod.rs |

#### Type Migration Required for 7 Structs

Currently defined in renderer but held as fields by document_core:
- `PaginationResult`, `PageItem`
- `MeasuredSection`, `MeasuredTable`
- `ResolvedStyleSet`, `ResolvedCharStyle`, `ResolvedParaStyle`
- `ComposedParagraph`, `ComposedLine`

#### Code Change Volume

- Direct impact: 15 files (within document_core)
- Indirect impact: 26 files (within renderer)
- Total change target: **approximately 65,000 lines**

### 4.2 Cost

| Item | Cost |
|------|------|
| Code change volume | 65,000 lines (49% of project) |
| Time required | 2-3 weeks (feature development freeze) |
| Trait indirection overhead | dyn Trait -> vtable dispatch performance degradation |
| If using generics | Compile time increase, code complexity increase |
| Test overhaul | Many of the 718 tests affected |
| Regression risk | High (layout/pagination precision coordinates) |

### 4.3 Benefits

| Item | Benefit | Current State |
|------|---------|---------------|
| Renderer swapping | SVG<->Canvas<->PDF swapping | **Already possible via Renderer trait** |
| Parser swapping | HWP5<->HWPX swapping | **Already possible** (just swap parser) |
| Mock testing | Test document_core without renderer | Current 608 tests work normally |
| Structural purity | Perfect dependency direction | Low practical value |

## 5. Decision: Full Transition Not Recommended

### 5.1 Rationale Against

**1. Inherent Nature of WYSIWYG Word Processors**

Cursor position calculation needing to traverse the render tree and edit commands needing to immediately perform line reflow are inherent requirements of WYSIWYG editors. Abstracting this coupling through traits only increases indirection with no practical benefit.

```
// Inevitable flow in WYSIWYG:
Text insert -> Line reflow -> Cursor position recalculation -> Screen update
(command)      (layout)       (render tree)                    (renderer)
```

Separating this flow with traits only increases code complexity.

**2. Swappability Already Secured**

- Renderer swapping: SVG/HTML/Canvas already swappable via `Renderer` trait
- Parser swapping: Parser depends only on model, so HWP5/HWPX already swappable
- Driving Adapter: wasm_api/main.rs are already thin wrappers

No additional swappability is gained from further abstraction.

**3. Insufficient Benefit for the Cost**

Compared to the cost of 65,000 lines changed + 2-3 weeks of feature development freeze, there is almost no practical benefit gained.

**4. Over-engineering Risk**

As an HWP viewer/editor, the likelihood of fundamentally changing parser or renderer implementations is very low. There is a significant risk of "abstraction for the sake of abstraction."

### 5.2 Similar Project References

| Project | Architecture | document<->renderer coupling |
|---------|-------------|----------------------------|
| LibreOffice Writer | Direct coupling | SwDoc <-> SwLayout tightly coupled |
| Google Docs | Direct coupling | Model <-> Layout tightly coupled |
| VS Code (Monaco) | Direct coupling | TextModel <-> ViewLayout coupled |
| ProseMirror | Separated | State <-> View separated (but web-specific) |

Most WYSIWYG editors tightly couple document and renderer. This is not a design flaw but a reasonable choice based on domain characteristics.

## 6. Recommendation: Incremental Improvement

Instead of a full transition, improve dependency direction through **data structure relocation**.

### 6.1 Improvement Direction

```
Current:
  document_core -> renderer (100 items, types + logic)

After improvement:
  document_core -> model <- renderer (data structs moved to model)
  document_core -> renderer (logic calls only, reduced to ~35)
```

### 6.2 Type Migration Candidates to model

| Current Location | Type | After Move |
|------------------|------|-----------|
| renderer::pagination | PaginationResult, PageItem, PageContent | model::page |
| renderer::height_measurer | MeasuredSection, MeasuredTable | model::measured |
| renderer::style_resolver | ResolvedStyleSet, ResolvedCharStyle, ResolvedParaStyle | model::resolved_style |
| renderer::composer | ComposedParagraph, ComposedLine | model::composed |

### 6.3 Couplings That Will Not Be Moved (Accepted)

| Coupling | Reason |
|----------|--------|
| cursor_rect -> RenderNode traversal | Inherent WYSIWYG requirement |
| text_editing -> reflow_line_segs | Immediate reflow after editing is essential |
| rendering.rs -> LayoutEngine | Render tree generation is renderer's responsibility |

### 6.4 Expected Results

- document_core -> renderer dependencies: 100 -> ~35 (65% reduction)
- model purity: maintained (only data structs added, no logic)
- Change scope: ~5,000 lines (1/13 of full transition)
- Regression risk: low (only type locations change, logic unchanged)

## 7. Conclusion

| Item | Full Transition | Incremental Improvement |
|------|----------------|------------------------|
| Change volume | 65,000 lines | 5,000 lines |
| Time required | 2-3 weeks | 2-3 days |
| Dependency improvement | 100 -> 0 | 100 -> 35 |
| Regression risk | High | Low |
| Additional benefit | Structural purity | Practical dependency cleanup |
| Decision | **Not recommended** | **Recommended** |

rhwp's current structure is not an "incomplete hexagonal" but rather a **practical architecture optimized for the WYSIWYG editor domain**.

Through incremental improvement (data structure relocation), dependency direction can be cleaned up, achieving sufficient structural soundness without a full transition.
