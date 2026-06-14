# Task 82 Implementation Plan: Context Menu Infrastructure + Table Right-Click Menu

## Step 1: ContextMenu Class Implementation

**File**: `rhwp-studio/src/ui/context-menu.ts` (new)

### Implementation

```typescript
// Menu item definition
interface ContextMenuItem {
  type: 'command' | 'separator';
  commandId?: string;   // CommandDef.id
  label?: string;       // Override label (uses CommandDef.label if absent)
}

class ContextMenu {
  constructor(dispatcher: CommandDispatcher, registry: CommandRegistry)

  // Show menu at clientX/Y
  show(x: number, y: number, items: ContextMenuItem[]): void

  // Close menu
  hide(): void

  // Release resources
  dispose(): void
}
```

### DOM Structure
```html
<div class="context-menu">
  <div class="md-item" data-cmd="edit:cut">Cut <span class="md-shortcut">Ctrl+X</span></div>
  <div class="md-sep"></div>
  <div class="md-item disabled" data-cmd="table:cell-merge">Merge Cells</div>
</div>
```

### Behavior
- show(): Create DOM → append to document.body → set position
- Correct for viewport boundary to prevent overflow
- ESC key → hide()
- Outside click → hide()
- Item click → dispatcher.dispatch(cmdId) + hide()
- Disabled items ignore clicks

---

## Step 2: Connect contextmenu Event to InputHandler

**File**: `rhwp-studio/src/engine/input-handler.ts` (modify)

### Implementation

1. Register `contextmenu` event listener in constructor
2. `onContextMenu(e: MouseEvent)` handler:
   - `e.preventDefault()` — suppress browser default menu
   - Perform hitTest with click coordinates (refer to existing onClick logic)
   - parentParaIndex exists in hitTest result → inside table cell
   - Inside table cell: table-specific menu item list
   - Outside table: general edit menu item list
   - Call ContextMenu.show(e.clientX, e.clientY, items)

3. ContextMenu instance held by InputHandler (or created in main.ts and injected)

### Table Cell Menu Items
```
Cut            Ctrl+X
Copy           Ctrl+C
Paste          Ctrl+V
------------------------
Cell Properties...
------------------------
Insert Row Above
Insert Row Below
Insert Column Left
Insert Column Right
------------------------
Delete Row
Delete Column
------------------------
Merge Cells     M
Split Cells     S
```

### General Menu Items
```
Cut            Ctrl+X
Copy           Ctrl+C
Paste          Ctrl+V
```

---

## Step 3: Activate table Command canExecute + CSS Styles + Integration

**Files**:
- `rhwp-studio/src/command/commands/table.ts` (modify)
- `rhwp-studio/src/style.css` (modify)
- `rhwp-studio/src/main.ts` (modify)

### table.ts Changes
- Change existing stub() function's `canExecute: () => false` to context-based
- Activate when inside table cell (`ctx.inTable === true`)
- execute not yet implemented, so only output console log

### style.css Addition
```css
/* Context menu */
.context-menu {
  position: fixed;
  min-width: 200px;
  background: #fff;
  border: 1px solid #c8c8c8;
  box-shadow: 2px 2px 8px rgba(0,0,0,0.15);
  z-index: 20000;
  padding: 4px 0;
  font-size: 12px;
}
```

### main.ts Changes
- Create ContextMenu instance
- Provide ContextMenu access to InputHandler (constructor parameter or setter)

---

## Completion Criteria

- [ ] Right-click inside table cell → table edit context menu displayed
- [ ] Right-click outside table → general edit context menu displayed
- [ ] Browser default menu suppressed
- [ ] Menu closes on ESC / outside click
- [ ] Disabled items (canExecute=false) shown in gray, click ignored
- [ ] All existing Rust tests pass
- [ ] WASM build successful
- [ ] Web verification complete on Vite dev server
