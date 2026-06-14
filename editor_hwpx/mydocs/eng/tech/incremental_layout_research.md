# Incremental Layout Architecture Research in Production Document Editors

> Date: 2026-03-27
> Purpose: Comparative analysis of incremental layout patterns for a WASM-based HWP editor

---

## 1. LibreOffice Writer

### 1.1 Frame Hierarchy (SwFrame Hierarchy)

Writer's layout is built on a tree structure composed of **SwFrame** subclasses.

```
SwRootFrame
 └─ SwPageFrame (page)
     ├─ SwHeaderFrame / SwFooterFrame
     ├─ SwBodyFrame (body area)
     │   └─ SwSectionFrame (section)
     │       └─ SwColumnFrame (column)
     │           ├─ SwTextFrame (text paragraph) ← subclass of SwContentFrame
     │           ├─ SwTabFrame (table)
     │           │   └─ SwRowFrame → SwCellFrame → SwTextFrame...
     │           └─ SwNoTextFrame (images, etc.)
     └─ SwFlyFrame (floating object)
         └─ SwFlyInContentFrame (inline object)
```

- Each frame is linked via **upper/lower/next/prev** pointers
- **SwFlowFrame**: Handles splitting (flowing) of frames across page boundaries
- The tree can be traversed by following frame relationships

### 1.2 Invalidation Mechanism

Each SwFrame has three independent validity flags:

| Flag | Method | Meaning |
|------|--------|---------|
| `mbFrameAreaSizeValid` | `InvalidateSize_()` | Frame size needs recalculation |
| `mbFrameAreaPositionValid` | `InvalidatePos_()` | Frame position needs recalculation |
| `mbPrtAreaValid` | `InvalidatePrt_()` | Print area (excluding internal margins) needs recalculation |

- **InvalidatePage()**: Invalidates the entire page that contains the current frame
- **InvalidateContent()**: Sets the page's `m_bInvalidContent` flag, marking that page's content for re-layout
- On paragraph edit: Calls `InvalidateSize()` on the corresponding SwTextFrame, which propagates to parent frames

### 1.3 Two-Phase Layout (SwLayAction + SwLayIdle)

Writer performs layout in **two phases** after an edit:

**Phase 1: SwLayAction (Synchronous Layout)**
- `SwLayAction::InternalAction()` is the core
- **Only re-layouts pages currently visible on screen**
- Checks each page's `m_bInvalidContent` flag and processes only invalidated pages
- Provides immediate visual response to the user

**Phase 2: SwLayIdle (Asynchronous/Idle Layout)**
- Progressively layouts off-screen pages during **idle time**
- Immediately interrupted when user input arrives
- Scrollbar positions become accurate only after idle layout completes

**Key Design Principles:**
- Does not re-layout the entire document on every keystroke
- Off-screen content is computed "when needed later"
- Collabora Online adds APIs to coordinate tile rendering with asynchronous layout

### 1.4 Table Re-layout

- SwTabFrame → SwRowFrame → SwCellFrame → SwTextFrame hierarchy
- When text changes in a cell: SwTextFrame.InvalidateSize() → SwCellFrame → SwRowFrame → SwTabFrame propagation
- If overall table size changes, subsequent content positions are also invalidated
- If table size remains unchanged, content after the table is unaffected

### 1.5 Strengths and Limitations

| Strengths | Limitations |
|-----------|-------------|
| Mature architecture (20+ years) | Very high code complexity |
| Fine-grained per-frame invalidation | Synchronous layout is slow on full document invalidation |
| Idle layout maintains UI responsiveness | Complex interactions between floating objects and text flow |
| Incremental processing per page | Layout bug debugging is difficult |

---

## 2. Typst (Rust-based Typesetting System)

### 2.1 Overall Architecture

Typst's compilation pipeline:

```
Source text → [Parsing] → AST → [Evaluation] → Content → [Layout] → Pages
```

- Each stage can be independently cached
- **Layout is the most expensive stage** → primary target for caching optimization

### 2.2 Comemo: Constraint-based Memoization

Typst implements incremental computation using its self-developed **comemo** library.

**Core Concepts:**

```rust
#[memoize]     // Cache function results
#[track]       // Track method calls on impl blocks
```

**How it works:**

1. When a `#[memoize]` function is called, search for compatible entries in the cache
2. Cache entries consist of result values + **constraints**
3. Method calls on `#[track]`ed arguments automatically generate constraints
4. If the new call's arguments **satisfy** existing constraints → cache hit → reuse

**Constraint Examples:**
- "Is there at least 4cm remaining on this page?" (= sufficient condition, not exact size)
- Arguments don't need to be exactly the same; reuse is possible if they are "used equivalently"

### 2.3 Layout Caching Strategy

**Spatial Constraint-based Caching:**

- Layout functions receive a **region** (available space) as an argument
- Instead of comparing the entire region, only the actually observed parts are recorded as constraints
- Example: "Is width 500pt?" + "Is height at least 200pt?" → cache reuse for other regions satisfying these conditions

**Element-level Caching:**
- The caching unit for layout is an **individual element**
- Layout results for each paragraph, table, image, etc. are independently cached
- Reused when an element's inputs (content + style + available space) satisfy constraints

### 2.4 Incremental Parsing

- Only re-parses affected AST nodes when the source changes
- Incremental parser that accommodates context sensitivity in markup languages (off-side rule, etc.)
- Well-suited design for recursive descent parsers

### 2.5 Multithreading

- Parallel layout is possible at explicit page break boundaries
- 2-3x speed improvement on typical hardware

### 2.6 Why Comemo Instead of Salsa

- Salsa: Query-based incremental computation (used by rustc, rust-analyzer)
- Comemo: Constraint-based memoization (more fine-grained access tracking)
- Initially used manual layout constraints, but frequent bugs led to automation via comemo
- For layout, **"are the inputs used equivalently?"** is more appropriate than "are the inputs exactly the same?"

### 2.7 Strengths and Limitations

| Strengths | Limitations |
|-----------|-------------|
| Rust-native, WASM-compatible | Batch compiler model (not a real-time editor) |
| Fine-grained constraint-based cache reuse | Cache misses possible on page overflow |
| Automated constraint tracking (comemo) | Latency optimization for interactive editing requires separate work |
| Independent per-element caching | Cache efficiency degrades for interdependent layouts like tables |
| Built-in incremental parsing | Not currently a WYSIWYG editor |

---

## 3. Web-based Editors (Google Docs / ProseMirror / Slate)

### 3.1 Google Docs (Canvas Rendering)

**Reasons for the 2021 DOM → Canvas transition:**
- Word processors have extremely precise layout requirements
- DOM was not designed for such requirements
- The "cheat" technique of updating only the line at the cursor position was difficult to implement with DOM
- Transitioned to Canvas-based rendering with a custom layout engine

**Incremental rendering approach:**
- On keystroke, **only the line containing the insertion point** is immediately redrawn
- Other areas are updated when needed (scrolling, etc.)
- Custom layout engine manages caches at the paragraph level (estimated)
- Ensures platform-independent rendering

### 3.2 ProseMirror

**Transaction-based Updates:**

```
User input → Transaction created → New State computed → View.updateState()
```

**DOM Update Optimization:**
- Compares old and new documents to **preserve DOM for unchanged nodes**
- `changedRanges`: Tracks the ranges affected by a transaction
- DOM changes already applied by the browser (typing) are not re-applied by ProseMirror
- **Decoration**: Persistent data structures that are efficiently compared/updated

**Key Design:**
- Immutable document model → easy before/after comparison
- Node-level comparison: only changed nodes trigger DOM updates
- Synchronous updates: DOM reflects transaction application immediately

### 3.3 Slate

- Editor framework built on React
- Uses an immutable data model
- Relies on React's reconciliation mechanism to re-render only changed nodes
- Built on top of contenteditable

### 3.4 Common Patterns in Web Editors

| Pattern | Description |
|---------|-------------|
| Immutable document model | Determine change scope via before/after snapshot comparison |
| Node-level comparison | Skip re-rendering for unchanged nodes |
| Transaction/operation-based | Express changes as explicit objects |
| Layout delegation | Most rely on the browser layout engine (except Google Docs) |

---

## 4. xi-editor (Rust-based Text Editor)

### 4.1 Rope-based Architecture

xi-editor is a Rust-based editor developed by Raph Levien at Google, which systematically formalized the principles of incremental processing.

**Core Philosophy:** "Make everything incremental where possible"
- Express changes as **explicit deltas**
- Deltas pass through the rendering pipeline, affecting only a tiny portion of the document

### 4.2 Incremental Word Wrapping

**Paragraph Independence Principle:**
- Every paragraph (delimited by hard breaks) can independently compute word wrapping
- Only changed paragraphs are recomputed; the rest reuse cache

**Storing Word Wrap Results:**
- Word wrap positions (breaks) are stored in a B-tree rope structure
- On paragraph change: only the wrap range for that paragraph is replaced
- The entire document's wrap list is not regenerated

**Character Width Measurement Cache:**
- Character width measurement is expensive, so a separate cache is maintained
- Cache hit rate has a decisive impact on performance

### 4.3 Minimal Invalidation

- Maintains a **frontier** set in the cache
- If a valid cache entry is not in the frontier, the next entry is also valid (invariant)
- On change, only the frontier is updated to minimize the invalidation scope

### 4.4 Strengths and Limitations

| Strengths | Limitations |
|-----------|-------------|
| Instant response even for very large files | No pagination support (code editor) |
| Independent per-paragraph caching | No support for complex layouts like tables and floating objects |
| Minimal impact via delta-based propagation | Project discontinued (2020) |
| Rust-native | Not a WYSIWYG document editor |

---

## 5. Comprehensive Pattern Comparison

### 5.1 Invalidation Granularity Comparison

| System | Invalidation Unit | Cache Unit | Pagination |
|--------|-------------------|------------|------------|
| LibreOffice | Frame (paragraph/table/cell) | None (recompute) | Idle layout per page |
| Typst | Element | Constraint-based per element | Parallelization at page boundaries |
| ProseMirror | Node | DOM node reuse | N/A |
| Google Docs | Line/paragraph | Canvas tiles (estimated) | Custom engine |
| xi-editor | Paragraph | B-tree rope | N/A |

### 5.2 Incremental Layout Strategy Comparison

| Strategy | Used By | Principle | Applicability to rhwp |
|----------|---------|-----------|----------------------|
| **Per-frame dirty flags** | LibreOffice | size/pos/prt validity flags per frame. Only invalidated frames are recomputed | **High** - Similar to rhwp's current paragraph/table structure |
| **Idle layout** | LibreOffice | Off-screen pages processed during idle time | **High** - requestIdleCallback can be used in WASM |
| **Constraint-based memoization** | Typst | Track only actually used input conditions to maximize cache reuse | **Medium** - High implementation complexity but excellent cache efficiency |
| **Immutable document + diff** | ProseMirror | Determine change scope via before/after state comparison | **Medium** - Useful for the editing model but separate from layout cache |
| **Independent per-paragraph caching** | xi-editor | Compute word wrapping independently without inter-paragraph dependencies | **High** - HWP paragraphs are generally independent |
| **Delta propagation** | xi-editor | Express changes as explicit deltas that propagate through the pipeline | **High** - Naturally applicable when editing operations are expressed as deltas |

### 5.3 Interaction Between Pagination and Incremental Layout

This is the most challenging problem. Unlike code editors, an HWP editor requires **page-based placement**.

**Problem Scenario:**
1. Text is added to a paragraph on page 3 → paragraph height increases
2. Page 3 content overflows → some content moves to page 4
3. Page 4 also overflows → moves to page 5... (cascade)
4. In the worst case, propagates to the end of the document

**How each system addresses this:**

| System | Approach |
|--------|----------|
| LibreOffice | Process only visible pages immediately + idle layout for the rest |
| Typst | Constraint-based cache reuses height-invariant elements. Re-layout from the affected page when page boundaries change |
| Google Docs | Custom engine processes at the line level (details not publicly available) |

**Strategies applicable to rhwp:**
- Re-paginate from the changed paragraph **until page boundaries stabilize**
- If the last item on page N is at the same position as before → pages after N+1 can be reused
- Detecting the "stabilization point" is the key

### 5.4 Minimum Re-layout on Table Editing

**Propagation Path:**
```
Text change in cell
 → Re-layout paragraph within cell
 → Cell height changed?
    ├─ No → Done (only re-render cell contents)
    └─ Yes → Recalculate row height
        → Table overall height changed?
           ├─ No → Only recalculate positions of cells after this row
           └─ Yes → Recalculate positions of content after table
               → Check for page overflow
```

**Optimization Points:**
- Cell height unchanged: Only re-layout cell contents (most common case)
- Row height unchanged: No impact on content after the table
- Table height changed: Invalidate frames from after the table, like LibreOffice

---

## 6. Recommended Architecture for the rhwp WASM Editor

### 6.1 Core Design Principles

1. **Paragraph-level layout cache** (xi-editor + Typst approach)
   - Cache each paragraph's layout result (line list, height)
   - Only recompute a paragraph when its content or style changes
   - Natural fit for caching rhwp's current `paragraph_layout` results

2. **Dirty flag propagation** (LibreOffice approach)
   - `layout_valid` flag on each paragraph/table/cell
   - On edit: invalidate the affected item → propagate to parent as needed
   - On re-layout: process only invalidated items

3. **Pagination stabilization point detection**
   - Re-paginate starting from the page containing the changed paragraph
   - Compare each page's last item position with the previous state
   - If identical, reuse cache for subsequent pages

4. **Idle layout** (LibreOffice approach)
   - Layout only pages visible on screen immediately
   - Process the rest asynchronously via `requestIdleCallback` or `setTimeout`
   - Prevents main thread blocking in the WASM environment

### 6.2 Suggested Implementation Phases

**Phase 1: Paragraph Layout Cache**
- Assign a hash key to `ParagraphLayout` results (text + style + available width)
- Skip word wrapping/height calculation on cache hit
- Expected to yield the largest performance improvement

**Phase 2: Dirty Flag-based Incremental Pagination**
- Mark edited paragraphs as dirty
- Rearrange from that paragraph to the end of the page
- Stop when page boundaries stabilize

**Phase 3: Table Cell Optimization**
- Skip table re-layout when cell height is unchanged
- Separate cell-internal layout from table layout

**Phase 4: Idle Layout**
- Deferred layout for off-screen pages
- Display estimated scrollbar/page count, then progressively correct

### 6.3 Data Structure Design Direction

```
PageLayoutCache {
    pages: Vec<CachedPage>,       // Per-page layout cache
    dirty_from: Option<PageIdx>,  // Re-layout needed from this page
}

CachedPage {
    items: Vec<PageItem>,         // Paragraph/table placement results
    valid: bool,                  // Validity flag
    last_item_end_y: f64,         // For stabilization comparison
}

ParagraphLayoutCache {
    // Key: (paragraph_content_hash, para_shape_id, available_width)
    // Value: ParagraphLayout (line list, total height)
    cache: HashMap<ParagraphCacheKey, ParagraphLayout>,
}
```

### 6.4 WASM Environment Considerations

| Consideration | Mitigation |
|---------------|------------|
| Single thread | Split idle layout into microtasks |
| Memory constraints | Limit memory usage with LRU cache |
| JS-WASM boundary cost | Process layout results within WASM as much as possible |
| Character width measurement | Cache Canvas measureText calls (xi-editor approach) |

---

## 7. References

- [LibreOffice SwFrame Class Reference](https://docs.libreoffice.org/sw/html/classSwFrame.html)
- [LibreOffice SwRootFrame Class Reference](https://docs.libreoffice.org/sw/html/classSwRootFrame.html)
- [LibreOffice SwPageFrame Class Reference](https://docs.libreoffice.org/sw/html/classSwPageFrame.html)
- [LibreOffice Writer sw module](https://docs.libreoffice.org/sw.html)
- [Collabora Online Issue #9735 - Layout Invalidation](https://github.com/CollaboraOnline/online/issues/9735)
- [Typst comemo - Incremental computation through constrained memoization](https://github.com/typst/comemo)
- [What If LaTeX Had Instant Preview? (Comemo blog post)](https://laurmaedje.github.io/posts/comemo/)
- [Fast Typesetting with Incremental Compilation (paper)](https://www.researchgate.net/publication/364622490_Fast_Typesetting_with_Incremental_Compilation)
- [Typst Architecture (docs/dev/architecture.md)](https://github.com/typst/typst/blob/main/docs/dev/architecture.md)
- [TeX and Typst: Layout Models](https://laurmaedje.github.io/posts/layout-models/)
- [Typst 0.12 Release (multithreading, caching improvements)](https://typst.app/blog/2024/typst-0.12/)
- [Why Typst uses comemo instead of salsa](https://forum.typst.app/t/why-does-typst-implements-its-own-incremental-computation-comemo-instead-of-using-salsa/4014)
- [ProseMirror Reference Manual](https://prosemirror.net/docs/ref/)
- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- [Why I rebuilt ProseMirror's renderer in React](https://smoores.dev/post/why_i_rebuilt_prosemirror_view/)
- [Google Docs Canvas Rendering Announcement](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html)
- [xi-editor Rope Science Part 5 - Incremental Word Wrapping](https://xi-editor.io/docs/rope_science_05.html)
- [xi-editor Rope Science Part 12 - Minimal Invalidation](https://abishov.com/xi-editor/docs/rope_science_12.html)
- [xi-editor Retrospective (Raph Levien)](https://raphlinus.github.io/xi/2020/06/27/xi-retrospective.html)
