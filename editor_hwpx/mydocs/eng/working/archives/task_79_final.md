# Task 79 Final Report: Show Table Transparent Borders

## Summary

Implemented a toggle feature to display table `BorderLineType::None` (no line) borders as **red dotted lines**. Follows the same architecture pattern as the paragraph mark (`show_paragraph_marks`) toggle.

## Implementation Details

### Stage 1: WASM API Flag and Method Addition

| Item | Details |
|------|---------|
| File | `src/wasm_api.rs` |
| Change | Added `show_transparent_borders: bool` field to `HwpDocument` |
| Change | Added `setShowTransparentBorders(enabled)` WASM method |
| Change | Passed flag to LayoutEngine during `build_page_tree()` call |

### Stage 2: Layout Engine - Transparent Border Rendering

| Item | Details |
|------|---------|
| File | `src/renderer/layout.rs` |
| Change | Added `show_transparent_borders: Cell<bool>` field to `LayoutEngine` |
| Change | Added new `render_transparent_borders()` function (~60 lines) |
| Behavior | Finds `None` slots in Edge Grid and creates red (0x0000FF BGR) dotted (Dot) 0.4px Line nodes |
| Applied | Called conditionally after 4 `render_edge_borders()` calls |

### Stage 3: Frontend - Menu/Button Connection

| Item | Details |
|------|---------|
| rhwp-studio | Implemented `view:border-transparent` command (disabled -> active toggle) |
| rhwp-studio | Added `setShowTransparentBorders()` method to `wasm-bridge.ts` |
| rhwp-studio | Removed `disabled` class from `index.html` menu item |
| web/editor | Added transparent border toggle button + event handler |

### Stage 4: Regression Tests + Build Verification

| Item | Result |
|------|--------|
| Test | Added `test_task79_transparent_border_lines`, verified with 5 sample files |
| Full tests | All 494 passed |
| WASM build | Succeeded |
| Vite build | Succeeded |

## Test Results

```
samples/table-001.hwp:                  OFF=16 ON=32 (+16) has_none_border=true
samples/hwp_table_test.hwp:             OFF=31 ON=32 (+1)  has_none_border=true
samples/table-complex.hwp:              OFF=29 ON=56 (+27) has_none_border=true
samples/hwpers_test4_complex_table.hwp: OFF=0  ON=0  (+0)  has_none_border=true
samples/table-ipc.hwp:                  OFF=27 ON=32 (+5)  has_none_border=true
```

- `table-001.hwp`: Table with only transparent borders -> 16 transparent lines added (correct)
- `table-complex.hwp`: Complex table -> 27 transparent lines added (correct)
- `hwpers_test4_complex_table.hwp`: No table on first page -> 0 (correct)

## Modified File List

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | Flag, method, propagation logic, test additions |
| `src/renderer/layout.rs` | Cell<bool> flag, `render_transparent_borders()` function, 4 call sites |
| `rhwp-studio/src/command/commands/view.ts` | `view:border-transparent` command implementation |
| `rhwp-studio/src/core/wasm-bridge.ts` | `setShowTransparentBorders()` method |
| `rhwp-studio/index.html` | Menu item activation |
| `web/editor.html` | Transparent border toggle button UI |
| `web/editor.js` | Transparent border toggle logic |

## Workflow

```
[User] View -> Click Transparent Lines
    |
[rhwp-studio] Execute view:border-transparent command
    | services.wasm.setShowTransparentBorders(true)
[WASM API] HwpDocument.show_transparent_borders = true
    | services.eventBus.emit('document-changed')
[build_page_tree()] layout_engine.show_transparent_borders <- doc.show_transparent_borders
    |
[Layout Engine] Call render_transparent_borders()
    | None slots in Edge Grid -> Generate red dotted Line nodes
[Canvas Renderer] Render red dotted lines
```

## Completion Date

2026-02-15
