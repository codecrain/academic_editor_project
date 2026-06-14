# Task 44 Step 3 Completion Report

## Step: Cursor/Selection/Input System Design

## Work Performed

### 1. Cursor Model Design (Section 6)

#### 1.1 Position Representation System

Defined 3 coordinate systems for representing text position within HWP documents:

| Coordinate System | Unit | Purpose |
|-------------------|------|---------|
| **char index** | Rust char index | WASM API calls (insertText, etc.) |
| **UTF-16 code unit** | HWP internal | LineSeg, CharShapeRef, DocProperties |
| **pixel coordinate** | px | Caret rendering, hit testing |

- `DocumentPosition` (sectionIndex, paragraphIndex, charOffset) -- logical document position
- `CursorLocation` -- layout-based position (includes line index, page, pixel coordinates)

#### 1.2 CursorContext State Machine (5 Contexts)

| Context | Entry Condition | Key State |
|---------|----------------|-----------|
| **TextContext** | Body text position | position, location |
| **ControlContext** | Inline control selected | controlIndex, controlType, boundingBox |
| **TableContext** | Inside table cell editing | cellRow, cellCol, innerCursor |
| **FieldContext** | Inside field (click-here block) | fieldName, innerCursor |
| **HeaderFooterContext** | Inside header/footer | headerFooterType, innerCursor |

**Transition Rules Design**:
- TextContext <-> ControlContext: Arrow keys reach control position / Escape
- ControlContext -> TableContext: Enter/double-click to enter table
- TableContext -> ControlContext: Escape to return to table selection state
- TextContext <-> HeaderFooterContext: Area click / Escape

#### 1.3 Control Detection Mechanism

Confirmed limitation where current WASM's `identify_inline_controls()` places all controls at line_index=0, and designed WASM extension API for the editor:
- `get_paragraph_control_positions()` -- returns precise char offset of controls

### 2. 28+ Cursor Movement Types Design (Section 6.4)

Designed 28+ movement types classified into 4 categories:

| Category | Movement Types | Count |
|----------|---------------|-------|
| Character | CharLeft/Right, CharLeftWord/RightWord | 4 |
| Line | LineUp/Down, LineStart/End | 4 |
| Paragraph | ParaUp/Down, ParaStart/End | 4 |
| Page | PageUp/Down, PageStart/End | 4 |
| Document | DocumentStart/End | 2 |
| Table Cell | CellNext/Prev/Up/Down/Start/End | 6 |
| Special | FieldNext/Prev, MatchingBracket, BookmarkGoto | 4+ |

**Key Algorithm Designs**:
- **Word boundary search**: Based on CharClass classification (Korean/English/digit/CJK/space/punctuation/control)
- **Vertical movement (Up/Down)**: preferredX retention pattern -- reset on horizontal movement, preserved on vertical movement
- **Table cell movement**: Considers merged cells, Tab at last cell -> add new row (compatible with Hancom behavior)

### 3. Hit Testing Algorithm (Section 6.5)

Designed a 4-stage pipeline hit testing approach:

```
Viewport coords -> Document coords -> Page coords
  -> Stage 2: Page area determination (body/header/footer/margin)
  -> Stage 3: Block determination (floating shapes first -> paragraph/table sequential)
  -> Stage 4: Line + character determination (Y -> line, X -> charPositions binary search)
```

**Performance Strategy**: Initially based on JavaScript-side `charX[]` cache, switch to WASM `hit_test()` API if bottlenecked

### 4. Selection Model Design (Section 7.1)

Designed 3 selection modes:

| Selection Mode | Data Structure | Rendering |
|----------------|---------------|-----------|
| **RangeSelection** | anchor + focus (DocumentPosition) | Per-line rectangle inversion |
| **CellBlockSelection** | startCell + endCell + merged cell expansion | Per-cell inversion |
| **ObjectSelection** | Multiple object list | Resize handles |

**Cell block selection merged cell expansion algorithm**: Iteratively expands selection range to include overlapping merged cells to determine exact block boundaries

### 5. Input System Design (Section 7.2)

**Event Handling Architecture**:
- `keydown` -> special key/shortcut mapping -> CommandDispatcher
- `beforeinput` -> inputType-based general input handling
- `composition*` -> IMEHandler (dedicated to Korean composition)
- `mouse*` -> HitTester + SelectionManager

**Hidden textarea strategy**: Place a hidden textarea on top of Canvas for IME input reception, synchronized to caret position for IME candidate window positioning

### 6. IME Korean Composition Handling (Section 7.3)

**3-stage Composition Handling Design**:
1. `compositionstart`: Save anchor position, preserve original
2. `compositionupdate`: Delete previous composition -> insert new composition -> incremental reflow
3. `compositionend`: Insert final confirmed text via Command pattern (undoable)

**Performance Analysis**: Only TextFlow per compositionupdate (~3ms), BlockFlow/PageFlow only on line count change -> total ~6ms meets 60fps

### 7. Caret Rendering (Section 7.4)

- **DOM overlay approach**: Display caret as `<div>` element on top of Canvas
- **Blink**: 530ms interval, reset on edit action
- **Underline during composition**: 2px underline overlay on IME composition area
- **Selection area**: Semi-transparent blue rectangles (per-line or per-cell)

## Deliverables

| Document | Path | Content |
|----------|------|---------|
| Design Doc Section 6 | `mydocs/plans/task_44_architecture.md` S6 | Cursor model (position representation, CursorContext state machine, 28+ movement types, hit testing) |
| Design Doc Section 7 | `mydocs/plans/task_44_architecture.md` S7 | Selection/input system (selection model, input handling, IME Korean composition, caret rendering) |

## Key Design Decisions

1. **char index as base unit**: TypeScript editing engine uses the same char index as WASM API, UTF-16 conversion handled inside Rust
2. **JavaScript hit testing first**: Fast response via charX[] cache without WASM round-trip, switch to WASM if needed
3. **Hidden textarea IME strategy**: Standard pattern for Canvas-based editors, synchronizes IME candidate window position to caret
4. **DOM overlay caret**: Enables blinking without Canvas re-rendering, optimal performance

## Next Step

Step 4: Undo/Redo + WASM Extension + Refactoring Plan + Design Doc Completion
- Command pattern interface design
- Continuous typing merge strategy
- List of required WASM core extension APIs
- Existing code refactoring plan (batch -> incremental)
- Design Doc Sections 8 + 9 + 10
