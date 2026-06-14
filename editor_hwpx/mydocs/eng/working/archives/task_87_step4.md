# Task 87 — Stage 4 Completion Report

## Build Verification + Resize Cursor

### Completed Items

#### 1. Resize Cursor (`input-handler.ts`)
- Added `onMouseMove` event handler: Changes cursor when hovering over handles during table object selection
- Per-handle cursor: NW/SE -> `nwse-resize`, NE/SW -> `nesw-resize`, N/S -> `ns-resize`, E/W -> `ew-resize`
- Outside handles -> `default` cursor restored
- Auto cursor restoration on table object deselection (click, Esc, etc.)

#### 2. Full Build Verification
- Rust tests: **514 passed**, 0 failed
- WASM build: Succeeded
- Vite build: Succeeded (40 modules)

### Modified Files
| File | Changes |
|------|---------|
| `rhwp-studio/src/engine/input-handler.ts` | onMouseMove handler + mousemove listener register/unregister |

### Web Test Scenarios
| Scenario | Expected Behavior |
|----------|-------------------|
| Esc from table cell | Table object selection (blue border + 8 handles) |
| Esc from table object selection | Move cursor outside table |
| Enter from table object selection | Return to cell editing |
| Delete from table object selection | Delete table |
| Esc from F5 cell selection | Switch to table object selection |
| Click outside table during table object selection | Deselect table object |
| Mouse over handle | Direction-specific resize cursor |
| Outside cell -> click cell | Auto transparent borders ON |
| Inside cell -> click outside cell | Auto transparent borders OFF (if not manually ON) |

### Verification
- Rust tests 514 passed
- WASM build succeeded
- Vite build succeeded
