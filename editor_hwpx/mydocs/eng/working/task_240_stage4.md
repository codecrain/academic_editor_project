# Task 240 - Stage 4 Completion Report: Command/Menu/Shortcut Integration and Testing

## Completed Items

### insert.ts
- Added `insert:bookmark` command (BookmarkDialog singleton pattern)
- `canExecute: (ctx) => ctx.hasDocument`

### index.html
- Added Menu > Insert > Bookmark item (`data-cmd="insert:bookmark"`, shortcut `Ctrl+K,B` displayed)

### input-handler-keyboard.ts
- **Chord shortcut (Ctrl+K,B) support added**
  - `chordMapK` mapping table: `b` → `insert:bookmark` (including Korean ㅠ)
  - `onKeyDown()` start: `_pendingChordK` state check logic
  - `handleCtrlKey()`: Sets `_pendingChordK = true` when Ctrl+K detected
- **F11 bookmark type handling**
  - Added `result.type === 'bookmark'` branch in `handleF11()`
  - Moves cursor to bookmark position then dispatches `insert:bookmark` command → opens dialog

### goto-dialog.ts
- **Added bookmark tab to Go To dialog**
  - Tab bar: Page | Bookmark
  - Page tab: Existing page number input functionality maintained
  - Bookmark tab: Shows document bookmark list, sorted by name
  - Click to select, double-click or OK button to navigate to position
  - `constructor(services, tab?)` — Supports opening directly to 'bookmark' tab

### dialogs.css
- Added Go To dialog tab bar/bookmark list styles (`goto-tab-*`, `goto-bookmark-*`)

### body_text.rs (bug fix)
- **Fixed missing bookmark name extraction from CTRL_DATA**
  - HWP spec: Bookmark names are stored in CTRL_DATA's ParameterSet
  - Existing code only processed CTRL_DATA for Field controls
  - Added `parse_ctrl_data_field_name()` call for `Control::Bookmark` as well
  - Discovered via hwplib (Java) cross-check: `ForControlBookmark` → `ForCtrlData` → `ForParameterSet`
  - synam-001.hwp verification: `""` → `"[Appendix 8] Power of Attorney"` correctly extracted

### bookmark-dialog.ts / goto-dialog.ts
- Display `(unnamed)` for bookmarks with empty names

## Verification
- No TypeScript compilation errors
- WASM build successful
- Rust tests 716 passed
- synam-001.hwp bookmark list display and navigation confirmed working
