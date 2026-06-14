# Task 233 Stage 3 Completion Report: ComboBox Dropdown and Edit Input Overlay

## Completed Items

### ComboBox Dropdown Overlay
- `showComboBoxOverlay()`: Overlays HTML `<select>` element at form object bbox position
- Extracts item list from properties via `getFormObjectInfo` (`ItemCount`, `Item0`, `Item1`, ...)
- On item selection → `setFormValue` → re-render
- Auto-removed on focus loss
- Auto-opens dropdown (`requestAnimationFrame` → `focus` → `click`)

### Edit Input Overlay
- `showEditOverlay()`: Overlays HTML `<input>` element at bbox position
- Enter key → confirms value + re-render
- Escape key → cancels (value unchanged)
- blur event → confirms value + re-render
- Blue border focus indicator

### Common Infrastructure
- `formOverlay` state variable: Tracks currently active overlay
- `removeFormOverlay()`: Cleans up existing overlay
- `formBboxToOverlayRect()`: Converts page coordinates → absolute coordinates within scroll-content (zoom-aware)
  - Uses `virtualScroll.getPageOffset()` + `getPageLeft()` (same pattern as caret position calculation)

### Changed Files
- `rhwp-studio/src/engine/input-handler.ts`: Added formOverlay state variable + 4 methods (`formBboxToOverlayRect`, `removeFormOverlay`, `showComboBoxOverlay`, `showEditOverlay`)

## Verification Results
- TypeScript compilation: No new errors
