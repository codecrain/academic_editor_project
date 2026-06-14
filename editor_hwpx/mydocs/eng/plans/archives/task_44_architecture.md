# rhwp-studio Editing Engine Architecture Design Document

> Task 44 deliverable | Created: 2026-02-12

---

## 1. Current Architecture Analysis

### 1.1 Rendering Pipeline Overview

Current rhwp uses a **batch unidirectional pipeline**:

```
HWP binary
  → Parser (parse_hwp)
  → Document Model (IR)
  → compose_section()     [Composer]
  → measure_section()     [HeightMeasurer]
  → paginate()            [Paginator]
  → build_render_tree()   [LayoutEngine]
  → Renderer backend (SVG / HTML / Canvas)
```

Editing workflow:

```
Text insert/delete
  → reflow_line_segs()            [Single paragraph reflow]
  → compose_section() (full)      [Full section recomposition]
  → paginate()       (full)       [Full repagination]
  → build_render_tree() (1 page)  [Only requested page rendered]
```

### 1.2 Module-by-Module Deep Analysis

#### 1.2.1 Composer (`src/renderer/composer.rs`, 1,067 lines)

**Role**: Splits paragraph text into lines (LineSeg) and further into TextRuns based on CharShapeRef boundaries and language boundaries.

**Core structures**:
- `ComposedTextRun` — Text fragment of same style + same language
- `ComposedLine` — LineSeg-based line info (runs, line_height, baseline, etc.)
- `ComposedParagraph` — Line list + inline control positions

**Reuse potential**: 4/5 stars
- `compose_paragraph()`: Directly reusable in editor. Needs incremental call interface.
- `reflow_line_segs()`: Already supports single paragraph reflow. Core of editor's TextFlow engine.
- `split_runs_by_lang()`: Essential for multilingual font mapping. Directly reusable.

#### 1.2.2 HeightMeasurer (`src/renderer/height_measurer.rs`, 486 lines)

**Role**: Pre-measures rendering heights of all content before pagination.

**Reuse potential**: 3/5 stars — Table height measurement logic directly reusable, but lacks incremental measurement interface.

#### 1.2.3 Paginator (`src/renderer/pagination.rs`, 935 lines)

**Role**: 2-pass pagination. (1) Height measurement → (2) Page splitting.

**Reuse potential**: 2/5 stars — Current approach is **full repagination** (clear → full rebuild each time). Editor needs **incremental pagination**.

#### 1.2.4 LayoutEngine (`src/renderer/layout.rs`, 5,017 lines)

**Role**: Receives page split results and calculates absolute coordinates/sizes for each element, generating PageRenderTree.

**Reuse potential**: 3/5 stars — Complex layout logic for tables/shapes has high reuse value. `estimate_text_width()`, `compute_char_positions()` are core for cursor calculation.

#### 1.2.5 RenderTree (`src/renderer/render_tree.rs`, 405 lines)

**Reuse potential**: 5/5 stars — RenderNode, dirty flag mechanism, TextRunNode metadata all fully reusable.

#### 1.2.6 WASM API (`src/wasm_api.rs`, 16,395 lines)

**60+ editing methods** covering text editing, table operations, formatting, clipboard, and more.

**Editing workflow (common to all methods)**:
```
1. Range validation
2. Invalidate raw_stream (trigger re-serialization)
3. Text/structure edit
4. reflow_paragraph() — single paragraph line break recalculation
5. compose_section() — full section recomposition ★ bottleneck
6. paginate()        — full repagination ★ bottleneck
7. Caret position update
8. Return result (JSON)
```

### 1.3 Rendering Scheduler and Existing Incremental Mechanisms

Already implemented in the core:

| Mechanism | Location | Status | Editor Use |
|-----------|----------|--------|-----------|
| Dirty flag (RenderNode) | render_tree.rs | Implemented | Only re-render changed nodes |
| RenderScheduler | scheduler.rs | Implemented | Viewport-based priority rendering |
| RenderObserver trait | scheduler.rs | Implemented | Event-based rendering trigger |
| Viewport struct | scheduler.rs | Implemented | Continuous scroll viewport management |
| Page Y offset | scheduler.rs | Implemented | Continuous scroll coordinate calculation |
| Prefetch strategy | scheduler.rs | Implemented | Pre-render adjacent pages |
| Single paragraph reflow | composer.rs | Implemented | Foundation for incremental TextFlow |

### 1.4 Editor Perspective Gap Identification

| Gap | Current Status | Editor Requirement | Severity |
|-----|---------------|-------------------|----------|
| **Incremental Compose** | Full section recomposition | Only recompose changed paragraphs | High |
| **Incremental Paginate** | Full repagination | Only re-split affected pages | High |
| **Cursor System** | None (only coordinate-based API) | CursorContext state machine | Critical |
| **Hit Testing** | None | Coordinate → document position conversion | Critical |
| **Command Pattern** | Direct model modification | Undo/Redo capable commands | High |
| **Continuous Scroll Coords** | Page-local coordinates only | Document-global coordinates | High |
| **Inline Control Position** | All at line_index=0 | Accurate in-line position | Medium |
| **Selection Model** | None | Range/cell block selection | High |
| **IME Composition** | None (immediate insert) | Korean composition intermediate state | High |

---

## 2. rhwp-studio Project Structure

### 2.1 Project Location and Independence

```
rhwp/
├── src/                  ← Rust core (parser, model, renderer, WASM API) [shared]
├── web/                  ← Existing viewer (maintained, independently usable)
├── pkg/                  ← WASM build artifacts (core → .wasm + .js glue)
├── rhwp-studio/          ← WebHwp replacement editor [new]
│   ├── src/
│   │   ├── engine/       ← Editing engine (TypeScript)
│   │   ├── view/         ← Continuous scroll canvas view
│   │   ├── compat/       ← HwpCtrl compatibility layer
│   │   └── ui/           ← Editor UI
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── docker-compose.yml    ← wasm build service addition
```

### 2.2 Module Dependency Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     rhwp-studio (TypeScript)                 │
│                                                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
│  │ UI Layer │→ │  Command   │→ │  Engine  │→ │   View    │  │
│  │ (Toolbar,│  │  Dispatch  │  │ (Cursor, │  │ (Canvas,  │  │
│  │  Menu,   │  │ (Undo/    │  │  Select, │  │  Scroll,  │  │
│  │  Status) │  │  Redo)    │  │  Flow)   │  │  Viewport)│  │
│  └──────────┘  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│                      │             │               │         │
│            ┌─────────┴─────────────┴───────────────┘         │
│            │   WASM Bridge (pkg/ → JS glue)                  │
│            ▼                                                 │
│  ┌───────────────────────────────────────────┐               │
│  │            rhwp WASM Core (Rust)          │               │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐  │               │
│  │  │ Document│ │ Renderer │ │  WASM API  │  │               │
│  │  │  Model  │ │(Composer,│ │(insert,    │  │               │
│  │  │ (IR)    │ │ Layout,  │ │ delete,    │  │               │
│  │  │         │ │ Paginate)│ │ format)    │  │               │
│  │  └─────────┘ └──────────┘ └───────────┘  │               │
│  └───────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 Internal Module Structure

```
rhwp-studio/src/
├── engine/
│   ├── index.ts              ← EditEngine entry point
│   ├── cursor/               ← CursorContext, cursor movement, hit-test, caret renderer
│   ├── selection/            ← Range selection, cell block selection, highlight
│   ├── input/                ← Keyboard/mouse events, IME, clipboard
│   ├── command/              ← EditCommand interface, Undo/Redo history, text/format/table commands
│   └── flow/                 ← TextFlow, BlockFlow, PageFlow
├── view/                     ← Canvas view, virtual scroll, page renderer, viewport manager
├── compat/                   ← HwpCtrl compatible API, action table, event bridge
├── ui/                       ← Toolbar, status bar, context menu, dialogs
└── core/                     ← WASM bridge, document state, event bus
```

### 2.4 Technology Stack

| Item | Choice | Rationale |
|------|--------|-----------|
| **Language** | TypeScript | Type safety, editor ecosystem compatibility |
| **Build** | Vite | Fast HMR, WASM plugin support |
| **Canvas** | HTML Canvas 2D | Leverage existing rhwp web_canvas.rs renderer |
| **WASM** | wasm-bindgen (existing) | Directly use rhwp core build artifacts |
| **State mgmt** | Custom EventBus | Minimize external library dependencies |
| **Testing** | Vitest | Vite native test runner |

### 2.5 WASM Integration

rhwp-studio directly imports `pkg/` artifacts. WASM core APIs are incrementally extended:

- **Phase 1**: Use existing APIs (insert_text, render_page_to_canvas, etc.)
- **Phase 2**: Add incremental layout APIs (recompose_paragraph, repaginate_from)
- **Phase 3**: Add cursor/hit-testing APIs (hit_test, get_cursor_rect, get_line_info)
- **Phase 4**: Add advanced editing APIs (search, replace, field operations)

### 2.6 Layer Responsibility Separation

| Layer | Location | Responsibility | Language |
|-------|----------|---------------|----------|
| **Document Model** | `src/` (Rust) | HWP parsing, IR management, serialization | Rust → WASM |
| **Layout Engine** | `src/` (Rust) | Compose, Measure, Paginate, Layout | Rust → WASM |
| **Rendering Backend** | `src/` (Rust) | Canvas/SVG/HTML rendering | Rust → WASM |
| **Editing Engine** | `rhwp-studio/src/engine/` | Cursor, selection, input, commands, flow | TypeScript |
| **View** | `rhwp-studio/src/view/` | Canvas management, scrolling, viewport | TypeScript |
| **UI** | `rhwp-studio/src/ui/` | Toolbar, dialogs, menus | TypeScript |
| **Compatibility** | `rhwp-studio/src/compat/` | HwpCtrl API compatibility layer | TypeScript |

**Core principles**:
- Document model and layout are **handled in Rust core** (performance + accuracy)
- Interactive editing logic is **handled in TypeScript** (responsiveness + browser integration)
- Communication between the two uses **WASM Bridge** (JSON-based serialization)

---

## 3. Flow Engine (TextFlow / BlockFlow / PageFlow)

### 3.1 3-Layer Flow Architecture Overview

Word processor layout consists of 3-stage flows. Each layer operates independently, with upper layers depending on lower layer results:

```
Edit occurs (text insert in para[3])
  ↓
[TextFlow] Reflow only para[3] → determine line count change
  ↓ (if line count changed)
[BlockFlow] Recalculate vertical positions para[3]~para[N]
  ↓ (if height exceeded)
[PageFlow] Re-split from affected page → stop at stable page
  ↓
[View] Re-render only dirty pages
```

### 3.2 TextFlow — Paragraph Line Breaking Engine

Handles single paragraph text splitting into lines, based on `reflow_line_segs()` + `compose_paragraph()` from the Rust core.

**Input/Output**:
- Input: Paragraph data + available_width + ResolvedStyleSet
- Output: FlowResult (lines, line_count_changed, total_height)

**Core algorithm**: Calls WASM reflow_line_segs → compose_paragraph → builds FlowResult with per-character positions.

**HWP special cases**: Control characters (width 0), tab characters (next tab stop), forced line break, Korean composition, indent/hanging indent.

### 3.3 BlockFlow — Vertical Layout Engine

Places block-level elements (paragraphs, tables, shapes) vertically within a section. When TextFlow reports a line count change, recalculates all block positions after that paragraph.

Handles: paragraph spacing (before/after), table heights, inline controls, floating elements (TopAndBottom wrapping reflected in vertical layout; Square/Tight handled at TextFlow level via available width adjustment).

### 3.4 PageFlow — Page Split Engine

Splits BlockFlow results (vertically-arranged block list) into page units. Extends current Paginator functionality incrementally.

**Incremental page split algorithm**: Find affected page → keep pages before it → re-split from that page → detect stable page → reuse remaining old pages.

**Stable page detection**: If new page starts with same paragraph and same line as old page → subsequent pages are identical, no re-split needed.

**Effect**: In a 100-page document, editing paragraph on page 5 only re-splits pages 5~7, reusing the remaining 93 pages.

---

## 4. Incremental Layout Engine

### 4.1 Design Goals

| Goal | Benchmark |
|------|-----------|
| Edit response time | Under 16ms (60fps) |
| Reflow scope | Only changed paragraph + affected subsequent paragraphs |
| Repagination scope | Only affected page ~ stable page |
| Re-render scope | Only dirty pages within viewport |

### 4.2 Dirty Flag Propagation Strategy

4-stage dirty propagation:
1. **Paragraph Dirty**: Mark edited paragraph as dirty
2. **Block Dirty**: If line count changed, propagate to subsequent blocks
3. **Page Dirty**: If block height change shifts page boundaries, propagate to affected pages
4. **Render Dirty**: Call invalidate() on dirty page RenderNodes

### 4.3 Impact Range Calculation

- TextFlow: Always O(1) — 1 paragraph (2 for split/merge)
- BlockFlow: O(N) worst case, but optimizable by stopping when height delta reaches 0
- PageFlow: Affected page ~ stable page, typically converges in 1~3 pages

### 4.4 Layout Cache Structure

Hierarchical caching: paragraph flows, block layouts, page layouts, render trees. Each level has specific invalidation rules (character edit → paragraph cache only; page setting change → full cache invalidation).

### 4.5 Full Edit → Render Flow (Incremental)

```
[User input: 'A' key]
  ↓
① Input Handler: key event → InsertTextCommand
② Command Dispatch: execute → WASM insert_text + mark dirty
③ TextFlow: reflow + compose → line count change? → trigger BlockFlow
④ BlockFlow (only if line count changed): recalculate vertical positions → page boundary change? → trigger PageFlow
⑤ PageFlow (only if page boundary changed): incremental repaginate → determine dirty pages
⑥ Render: dirty pages in viewport → build_render_tree + render_to_canvas; outside viewport → prefetch queue
⑦ Caret Update: calculate new position + render (reset blink timer)
⑧ UI Update: refresh status bar (page number, line/column)
```

### 4.6 Performance Budget (16ms frame)

| Stage | Expected Time | Notes |
|-------|--------------|-------|
| Input → Command | < 1ms | JS event handling |
| WASM insert_text | < 1ms | String manipulation + metadata update |
| TextFlow (reflow) | 1~3ms | Single paragraph. Includes WASM measureText calls |
| BlockFlow | < 1ms | Array traversal, addition operations |
| PageFlow (incremental) | 1~2ms | 1~3 page re-split |
| RenderTree build | 2~4ms | 1 page render tree generation |
| Canvas rendering | 3~5ms | 1 page Canvas 2D rendering |
| Caret + UI | < 1ms | DOM updates |
| **Total** | **~12ms** | **Within 16ms budget** |

---

## 5. Continuous Scroll Canvas View

### 5.1 View Architecture Overview

The continuous scroll view arranges all pages vertically; when the user scrolls, only currently visible pages are rendered.

```
┌─── Viewport (browser window) ──────────────┐
│  ┌─────────────────────────────────────┐   │
│  │ Virtual scroll container            │   │ ← Total height = sum(page heights + gaps)
│  │  ┌─── Page 4 (Canvas) ───┐         │   │ ← Near viewport top
│  │  │  [rendered]            │         │   │
│  │  └────────────────────────┘         │   │
│  │  ── 10px gap ──                     │   │
│  │  ┌─── Page 5 (Canvas) ───┐         │   │ ← Current page
│  │  │  [rendered]  ← caret   │         │   │
│  │  └────────────────────────┘         │   │
│  │  ── 10px gap ──                     │   │
│  │  ┌─── Page 6 (Canvas) ───┐         │   │ ← Near viewport bottom
│  │  │  [rendered]            │         │   │
│  │  └────────────────────────┘         │   │
│  │  Page 7~N: [prefetch or unrendered] │   │
│  └─────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

The virtual scroll container maintains total height equal to the sum of all pages. Canvas elements are created/destroyed dynamically based on viewport position. The RenderScheduler manages rendering priority: current page > adjacent pages > prefetch pages.
