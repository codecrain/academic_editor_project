# Task 87 — Stage 2 Completion Report

## Table Object Selection Mode + Esc Key Handling + Auto Transparent Borders

### Completed Items

#### 1. CursorState Table Object Selection State (`cursor.ts`)
- Added `_tableObjectSelected` / `selectedTableRef` state fields
- `enterTableObjectSelection()` — Selects the table at current cell position as object
- `exitTableObjectSelection()` — Deselects object
- `isInTableObjectSelection()` — State query
- `getSelectedTableRef()` — Returns selected table reference
- `moveOutOfSelectedTable()` — Moves cursor outside table + deselects

#### 2. Esc Key State Machine (`input-handler.ts`)
- **Cell editing mode** -> Esc -> **Table object selection mode** (hides caret)
- **Cell selection mode (F5)** -> Esc -> **Table object selection mode** (removes cell highlight)
- **Table object selection** -> Esc -> **Move cursor outside table** (next paragraph start)
- **Table object selection** -> Enter -> **Return to cell editing** (shows caret)
- **Table object selection** -> Delete/Backspace -> **Delete table** + document-changed

#### 3. Table Object Selection Deselect on Outside Click (`input-handler.ts`)
- Checks table object selection state in onClick -> deselects + emits event

#### 4. Auto Transparent Border Activation (`input-handler.ts` + `view.ts`)
- Detects cell entry/exit changes using `wasInCell` state
- Outside cell -> Cell entry: `setShowTransparentBorders(true)` + button active
- Inside cell -> Cell exit: OFF only if auto-activated
- `manualTransparentBorders` flag coexists with manual toggle
- `view:border-transparent` command emits `transparent-borders-changed` event

#### 5. EditorContext Extension (`types.ts` + `main.ts`)
- Added `inTableObjectSelection: boolean` field
- Reflected InputHandler state in `getContext()`

#### 6. `table:delete` Command Registration (`table.ts`)
- Executable in table object selection mode or inside cell
- Added "Delete Table" item to context menu

### Modified Files
| File | Changes |
|------|---------|
| `rhwp-studio/src/engine/cursor.ts` | Table object selection state + 5 methods |
| `rhwp-studio/src/engine/input-handler.ts` | Esc state machine + auto transparent borders + onClick deselect + public accessors |
| `rhwp-studio/src/command/types.ts` | Added `inTableObjectSelection` to EditorContext |
| `rhwp-studio/src/command/commands/view.ts` | Emits `transparent-borders-changed` event |
| `rhwp-studio/src/command/commands/table.ts` | Registered `table:delete` command |
| `rhwp-studio/src/main.ts` | Added `inTableObjectSelection` to getContext() |

### Verification
- Vite build succeeded
