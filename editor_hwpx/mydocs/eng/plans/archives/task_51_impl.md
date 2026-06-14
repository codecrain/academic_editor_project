# Task 51 Implementation Plan: Copy/Paste (Clipboard)

## Context

Cursor navigation was completed in Task 50. To implement clipboard functionality, **text selection (Selection)** must be implemented first.

**Key finding**: The Rust WASM side already has rich clipboard APIs:
- `copySelection`, `copySelectionInCell` — copy selection to internal clipboard
- `pasteInternal`, `pasteInternalInCell` — paste from internal clipboard
- `pasteHtml`, `pasteHtmlInCell` — paste HTML
- `exportSelectionHtml`, `exportSelectionInCellHtml` — export as HTML
- `hasInternalClipboard`, `getClipboardText`, `clearClipboard`

**Not yet implemented**: TypeScript-side Selection model, Selection rendering, Shift+Arrow handling, clipboard event binding, selection range deletion (deleteRange), WASM API for selection highlight rectangles (`getSelectionRects`)

---

## Step-by-Step Implementation Plan

### Step 1: Selection Model + Shift+Arrow Key Handling

**Goal**: Add anchor/focus selection model to CursorState and extend/shrink selection with Shift+Arrow.

**`cursor.ts` modifications**:
- Add `private anchor: DocumentPosition | null = null` field
- `hasSelection(): boolean` — check if anchor is non-null
- `getSelection(): { anchor: DocumentPosition; focus: DocumentPosition } | null`
- `getSelectionOrdered(): { start: DocumentPosition; end: DocumentPosition } | null` — always start < end
- `setAnchor(): void` — set current position as anchor
- `clearSelection(): void` — set anchor to null
- `static comparePositions(a, b): number` — compare two positions (-1, 0, 1)

Position comparison logic:
```
Body: (sectionIndex, paragraphIndex, charOffset) lexicographic order
Cell: same cell → compare (cellParaIndex, charOffset)
Cell↔Body: first pass allows selection only within same context (cross-boundary restricted)
```

**`input-handler.ts` modifications**:
- Shift+Arrow: `setAnchor()` → move → auto-extend selection
- Shift+Home/End: select to line start/end
- Ctrl+Shift+Home/End: select to document start/end
- Non-Shift movement keys: `clearSelection()` then move
- Mouse click: `clearSelection()` then move position
- Ctrl+A: anchor=document start, focus=document end

**`types.ts` modifications**:
- Add `SelectionRect` interface: `{ pageIndex, x, y, width, height }`

### Step 2: Selection Rendering (WASM getSelectionRects + DOM Overlay)

**Goal**: Visualize the selection area as blue semi-transparent rectangles.

**`src/wasm_api.rs` addition** — `getSelectionRects` WASM API:
```rust
#[wasm_bindgen(js_name = getSelectionRects)]
pub fn get_selection_rects(
    &self, section_idx: u32,
    start_para_idx: u32, start_char_offset: u32,
    end_para_idx: u32, end_char_offset: u32,
) -> Result<String, JsValue>

#[wasm_bindgen(js_name = getSelectionRectsInCell)]
pub fn get_selection_rects_in_cell(
    &self, section_idx: u32, parent_para_idx: u32, control_idx: u32, cell_idx: u32,
    start_cell_para_idx: u32, start_char_offset: u32,
    end_cell_para_idx: u32, end_char_offset: u32,
) -> Result<String, JsValue>
```

Return: `[{"pageIndex":N,"x":F,"y":F,"width":F,"height":F}, ...]`

Algorithm: Iterate through each paragraph's lines (LineSeg), and for each line overlapping the selection range, use getCursorRect to obtain left/right boundary X coordinates and generate a rectangle.

**`selection-renderer.ts` new file** — borrowing `caret-renderer.ts` pattern:
- Add `div.selection-layer` (z-index:5, pointer-events:none) to `#scroll-content`
- `render(rects, zoom)`: create a div for each rect with `rgba(51,122,183,0.3)` background
- `clear()`: remove all highlight divs
- Page offset + zoom correction: reuse position calculation logic from `caret-renderer.ts`

**`wasm-bridge.ts` additions**: `getSelectionRects()`, `getSelectionRectsInCell()` wrappers

**`input-handler.ts` integration**: After Shift+move, call `updateSelection()` → get rects from WASM → render via SelectionRenderer

### Step 3: Clipboard Integration + Selection Editing

**Goal**: Implement Ctrl+C/X/V, selection range deletion/replacement.

**Selection range deletion (WASM addition)**:

Add `deleteRange` API to `src/wasm_api.rs`:
```rust
#[wasm_bindgen(js_name = deleteRange)]
pub fn delete_range(
    &mut self, section_idx: u32,
    start_para_idx: u32, start_char_offset: u32,
    end_para_idx: u32, end_char_offset: u32,
) -> Result<String, JsValue>
// Return: {"ok":true,"paraIdx":N,"charOffset":N}

#[wasm_bindgen(js_name = deleteRangeInCell)]
pub fn delete_range_in_cell(
    &mut self, section_idx: u32, parent_para_idx: u32, control_idx: u32, cell_idx: u32,
    start_cell_para_idx: u32, start_char_offset: u32,
    end_cell_para_idx: u32, end_char_offset: u32,
) -> Result<String, JsValue>
```

Multi-paragraph deletion logic handled in Rust (reflecting moveVertical experience — complex paragraph manipulation is more stable as a single WASM call):
1. Delete front part of last paragraph (0..endOffset)
2. Delete middle paragraphs in reverse order (repeated mergeParagraph)
3. Delete back part of first paragraph (startOffset..paraLen)
4. Merge first and last paragraphs

**`command.ts` addition** — `DeleteSelectionCommand`:
```typescript
class DeleteSelectionCommand implements EditCommand {
  type = 'deleteSelection';
  // execute: call wasm.deleteRange(), preserve text via copySelection before deletion
  // undo: call pasteInternal with preserved text
}
```

**`wasm-bridge.ts` additions**: ~10 wrappers for existing WASM clipboard APIs:
- `copySelection`, `copySelectionInCell`
- `pasteInternal`, `pasteInternalInCell`
- `exportSelectionHtml`, `exportSelectionInCellHtml`
- `hasInternalClipboard`, `getClipboardText`, `clearClipboard`
- `deleteRange`, `deleteRangeInCell`

**`input-handler.ts` modifications**:

Copy (Ctrl+C):
```
handleCopy(): if selection exists → wasm.copySelection() → navigator.clipboard.write(plainText + html)
  On failure fallback: textarea.value = text; textarea.select(); document.execCommand('copy')
```

Cut (Ctrl+X):
```
handleCut(): handleCopy() → deleteSelection()
```

Paste (Ctrl+V):
```
handlePaste(): if selection exists, delete first → try wasm.pasteInternal() →
  if external text, execute InsertText/SplitParagraph sequentially
```

Selection editing:
- Backspace/Delete + selection: call `deleteSelection()`
- Character input + selection: delete selection → input
- IME start + selection: delete selection → start composition
- Enter + selection: delete selection → splitParagraph

Add paste event listener (to textarea):
```typescript
textarea.addEventListener('paste', (e) => { e.preventDefault(); handlePaste(e.clipboardData); })
textarea.addEventListener('copy', (e) => { e.preventDefault(); handleCopy(); })
textarea.addEventListener('cut', (e) => { e.preventDefault(); handleCut(); })
```

---

## Modified Files List

| File | Changes | Scale |
|------|---------|-------|
| `src/wasm_api.rs` | `getSelectionRects` + `deleteRange` WASM API 2 pairs + native implementation | +200 lines |
| `rhwp-studio/src/core/types.ts` | `SelectionRect` interface | +7 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | 12 clipboard/selection API wrappers | +80 lines |
| `rhwp-studio/src/engine/cursor.ts` | anchor/focus selection model, comparePositions | +80 lines |
| `rhwp-studio/src/engine/selection-renderer.ts` | Selection area highlight (new) | +80 lines |
| `rhwp-studio/src/engine/command.ts` | DeleteSelectionCommand | +60 lines |
| `rhwp-studio/src/engine/input-handler.ts` | Shift+Arrow, Ctrl+C/X/V/A, selection editing | +150 lines |

## Verification

1. Docker WASM build: `docker compose --env-file /dev/null run --rm wasm`
2. Vite build: `npm run build`
3. Runtime testing:
   - Select text with Shift+Arrow → blue highlight displayed
   - Shift+Home/End, Ctrl+Shift+Home/End
   - Ctrl+C → paste in external editor to confirm
   - Ctrl+V → paste external text (single/multi line)
   - Ctrl+X → cut selected text
   - Selection + Backspace/Delete → selection deleted
   - Selection + character input → selection replaced
   - Selection + Enter → selection deleted then paragraph split
   - Ctrl+A → select all
   - Undo/Redo correctly restores selection deletion/paste
   - Verify same behavior inside table cells
