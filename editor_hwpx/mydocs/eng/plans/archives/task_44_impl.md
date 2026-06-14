# Task 44 Implementation Plan: Editing Engine Architecture Design

## Strategic Direction

Maintain the current rhwp core (parser, document model, renderer) as a **shared foundation** while designing the editing engine in a separate web project `rhwp-studio`. The design document is an **architecture document**, not code, serving as a blueprint for future implementation.

## Core Design Challenge

Fundamental difference between the current viewer pipeline and a word processor editing pipeline:

```
[Current Viewer Pipeline]
HWP File -> Parser -> Document Model -> compose(full) -> paginate(full) -> layout -> render(1 page)
                                  ^ Full re-execution on edit ^

[Target Editor Pipeline]
                    +-- Edit command (at cursor position)
                    v
Document Model -> Change detection -> reflow(affected paragraph) -> re-paginate(from affected page) -> render(viewport)
    ^                                                                                                      v
    +-- Undo/Redo history <---------------------------------------------------------------------------+
```

## Phase Structure (4 Phases)

### Phase 1: Current Architecture Analysis + rhwp-studio Project Design

**Tasks**:
- Deep analysis of 6 current layout modules (Composer, HeightMeasurer, Paginator, LayoutEngine, RenderTree, WASM API)
- Identify reuse scope and refactoring needs for each module
- Design rhwp-studio project structure, build system, WASM integration

**Deliverable**: Design document Section 1 (Current Architecture Analysis) + Section 2 (rhwp-studio Project Structure)

### Phase 2: Layout Engine Design (TextFlow / BlockFlow / PageFlow)

**Tasks**:
- Design 3-layer flow engine for word processor
  - TextFlow: Line breaking within paragraphs, inline element placement
  - BlockFlow: Vertical placement of paragraphs/tables/objects, floating handling
  - PageFlow: Page splitting, headers/footers, footnotes, table splitting
- Incremental layout strategy: dirty flags, impact range calculation, cache invalidation
- Continuous scroll canvas view design: virtual scroll, viewport-based rendering

**Deliverable**: Design document Section 3 (Flow Engine) + Section 4 (Incremental Layout) + Section 5 (Canvas View)

### Phase 3: Cursor/Selection/Input System Design

**Tasks**:
- Cursor model design: line-level processing, paragraph control detection, cursor context switching
- Cursor movement: arrows, Home/End, PageUp/Down, Ctrl+arrows (word-level)
- Hit testing: mouse click coordinates -> document position conversion
- Selection model: Shift+movement, mouse drag, cell block selection
- Input handling: regular characters, IME Korean composition, special keys

**Deliverable**: Design document Section 6 (Cursor Model) + Section 7 (Selection/Input)

### Phase 4: Undo/Redo + WASM Extension + Refactoring Plan + Final Document

**Tasks**:
- Command history design: Command pattern, inverse-operation-based Undo/Redo
- WASM core extension plan: list of APIs needed for editor but currently missing
- Existing code refactoring plan: batch-to-incremental transition strategy
- Final assembly and review of design document

**Deliverable**: Design document Section 8 (Undo/Redo) + Section 9 (WASM Extension) + Section 10 (Refactoring Plan)
