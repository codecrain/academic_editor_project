# Task 44 Step 2 Completion Report

## Step: Layout Engine Design (TextFlow / BlockFlow / PageFlow)

## Work Performed

### 1. 3-Layer Flow Engine Design (Section 3)

Designed the 3-stage flow structure for word processor layout:

| Layer | Role | Input -> Output |
|-------|------|-----------------|
| **TextFlow** | Line breaking within paragraph | Paragraph -> FlowLine[] |
| **BlockFlow** | Vertical block arrangement | FlowResult[] -> BlockLayout[] |
| **PageFlow** | Page splitting | BlockLayout[] -> PageContent[] |

**Key Design Decisions**:
- TextFlow reuses existing `reflow_line_segs()` + `compose_paragraph()` via WASM calls
- BlockFlow triggers only when line count changes (skipped if unchanged)
- PageFlow uses incremental pagination, with **Stable Page detection** to cut off propagation

**Defined handling for 7 HWP special cases**:
- Control characters, tabs, forced line breaks, Korean composition, indentation/outdentation, floating shapes

### 2. Incremental Layout Engine Design (Section 4)

**Performance Target**: Edit response within 16ms (60fps)

**4-stage Dirty Propagation Strategy**:
```
Paragraph Dirty -> Block Dirty -> Page Dirty -> Render Dirty
```

**Impact Range Optimization**:
- TextFlow: Always O(1) -- only the edited paragraph
- BlockFlow: Triggers only on line count change, stops at height delta = 0
- PageFlow: Stable page detection converges in 1-3 pages on average

**4-layer Layout Cache Structure Design**:
- paragraphFlows -> blockLayouts -> pageLayouts -> renderTrees

**Performance Budget Analysis**: Full pipeline ~12ms (within 16ms budget)

### 3. Continuous Scroll Canvas View Design (Section 5)

**Virtual Scroll Architecture**:
- Reuses existing RenderScheduler's `page_offsets` mechanism
- Canvas pooling for memory efficiency (maintains only 3-5 Canvases within viewport)

**3-stage Coordinate System**:
- Document coordinates -- scroll position, continuous cross-page coordinates
- Page coordinates -- render tree, WASM API
- Viewport coordinates -- mouse events, caret

**Additional Design**: Zoom handling, caret auto-scroll, page shadow/border rendering

## Deliverables

| Document | Path | Content |
|----------|------|---------|
| Design Doc Section 3 | `mydocs/plans/task_44_architecture.md` S3 | Flow engine (TextFlow/BlockFlow/PageFlow) |
| Design Doc Section 4 | `mydocs/plans/task_44_architecture.md` S4 | Incremental layout engine (dirty flag, impact range, cache) |
| Design Doc Section 5 | `mydocs/plans/task_44_architecture.md` S5 | Continuous scroll canvas view (virtual scroll, coordinate system) |

## Next Step

Step 3: Cursor/Selection/Input System Design
- CursorContext state machine (5 contexts)
- 28+ cursor movement types design
- Hit testing algorithm
- Selection model (range/cell block)
- IME Korean composition handling
