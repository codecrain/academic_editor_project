# Task 79 Implementation Plan: Show Transparent Table Borders

## Implementation Overview

Implement transparent border toggle using the same pattern as paragraph mark toggle (`show_paragraph_marks`). However, while paragraph marks are handled in the renderer (Canvas/SVG), transparent borders require **Line node generation at the layout engine** level, so the flag is added to `LayoutEngine`.

---

## Step 1: Add WASM API Flag and Method

**File**: `src/wasm_api.rs`

### 1-1. Add Flag to HwpDocument

```rust
// Existing (line 101)
show_paragraph_marks: bool,
// Added
show_transparent_borders: bool,
```

Initial value `false` (around line 125, same pattern as existing)

### 1-2. Add WASM Method

```rust
#[wasm_bindgen(js_name = setShowTransparentBorders)]
pub fn set_show_transparent_borders(&mut self, enabled: bool) {
    self.show_transparent_borders = enabled;
}
```

### 1-3. Pass Flag to LayoutEngine Before build_page_tree() Call

In `render_page_to_canvas()` (around line 177) and other rendering paths:

```rust
self.layout_engine.show_transparent_borders = self.show_transparent_borders;
let tree = self.build_page_tree(page_num)?;
```

**Scale**: ~10 lines

---

## Step 2: Layout Engine - Transparent Border Rendering

**File**: `src/renderer/layout.rs`

### 2-1. Add Flag to LayoutEngine

```rust
// Existing (lines 141-148)
pub struct LayoutEngine {
    dpi: f64,
    auto_counter: std::cell::RefCell<AutoNumberCounter>,
}

// Added
pub struct LayoutEngine {
    dpi: f64,
    auto_counter: std::cell::RefCell<AutoNumberCounter>,
    pub show_transparent_borders: bool,
}
```

Initial value `false` (add to new() method)

### 2-2. Call Transparent Border Rendering in layout_table()

After `render_edge_borders()` call (around line 1654):

```rust
// Existing
table_node.children.extend(render_edge_borders(
    tree, &h_edges, &v_edges, &col_x, &row_y, table_x, table_y,
));

// Added
if self.show_transparent_borders {
    table_node.children.extend(render_transparent_borders(
        tree, &h_edges, &v_edges, &col_x, &row_y, table_x, table_y,
    ));
}
```

### 2-3. Add render_transparent_borders() Function

Generate red dotted Line nodes for `None` slots (transparent borders) in the edge grid.

```rust
fn render_transparent_borders(
    tree: &mut PageRenderTree,
    h_edges: &[Vec<Option<BorderLine>>],
    v_edges: &[Vec<Option<BorderLine>>],
    col_x: &[f64],
    row_y: &[f64],
    table_x: f64,
    table_y: f64,
) -> Vec<RenderNode> {
    let mut nodes = Vec::new();

    // Horizontal transparent edges (merge consecutive None slots into single line segment)
    for row_bound in 0..h_edges.len() {
        let y = table_y + row_y[row_bound];
        let mut seg_start: Option<usize> = None;

        for col in 0..h_edges[row_bound].len() {
            if h_edges[row_bound][col].is_none() {
                if seg_start.is_none() { seg_start = Some(col); }
            } else {
                if let Some(start) = seg_start {
                    let x1 = table_x + col_x[start];
                    let x2 = table_x + col_x[col];
                    nodes.push(create_transparent_line_node(tree, x1, y, x2, y));
                    seg_start = None;
                }
            }
        }
        if let Some(start) = seg_start {
            let x1 = table_x + col_x[start];
            let x2 = table_x + *col_x.last().unwrap_or(&0.0);
            nodes.push(create_transparent_line_node(tree, x1, y, x2, y));
        }
    }

    // Vertical transparent edges (same pattern)
    for col_bound in 0..v_edges.len() {
        let x = table_x + col_x[col_bound];
        let mut seg_start: Option<usize> = None;

        for row in 0..v_edges[col_bound].len() {
            if v_edges[col_bound][row].is_none() {
                if seg_start.is_none() { seg_start = Some(row); }
            } else {
                if let Some(start) = seg_start {
                    let y1 = table_y + row_y[start];
                    let y2 = table_y + row_y[row];
                    nodes.push(create_transparent_line_node(tree, x, y1, x, y2));
                    seg_start = None;
                }
            }
        }
        if let Some(start) = seg_start {
            let y1 = table_y + row_y[start];
            let y2 = table_y + *row_y.last().unwrap_or(&0.0);
            nodes.push(create_transparent_line_node(tree, x, y1, x, y2));
        }
    }

    nodes
}
```

### 2-4. create_transparent_line_node() Helper Function

```rust
fn create_transparent_line_node(
    tree: &mut PageRenderTree,
    x1: f64, y1: f64, x2: f64, y2: f64,
) -> RenderNode {
    // Red (#FF0000) dotted line, 0.4px width
    tree.create_node(
        RenderNodeType::Line(LineNode {
            x1, y1, x2, y2,
            style: LineStyle {
                color: ColorRef(0x0000FF), // BGR format: Red
                width: 0.4,
                dash: StrokeDash::Dot,
            },
        }),
        BoundingBox { x: x1.min(x2), y: y1.min(y2),
                       width: (x2-x1).abs().max(0.4), height: (y2-y1).abs().max(0.4) },
    )
}
```

**Scale**: ~60 lines

---

## Step 3: Frontend - Menu and Button Connection

### 3-1. rhwp-studio: Implement view:border-transparent Command

**File**: `rhwp-studio/src/command/commands/view.ts` (lines 96-101)

Same pattern as paragraph mark command (lines 79-95):

```typescript
// Before
{
    id: 'view:border-transparent',
    label: 'Transparent Borders',
    canExecute: () => false,
    execute() { /* TODO */ },
},

// After
(() => {
    let showBorders = false;
    return {
        id: 'view:border-transparent',
        label: 'Transparent Borders',
        canExecute: (ctx) => ctx.hasDocument,
        execute(services) {
            showBorders = !showBorders;
            services.wasm.setShowTransparentBorders(showBorders);
            document.querySelectorAll('[data-cmd="view:border-transparent"]').forEach(el => {
                el.classList.toggle('active', showBorders);
            });
            services.eventBus.emit('document-changed');
        },
    } satisfies CommandDef;
})(),
```

**File**: `rhwp-studio/index.html` (line 71)

```html
<!-- Before -->
<div class="md-item disabled" data-cmd="view:border-transparent">...

<!-- After: remove disabled class -->
<div class="md-item" data-cmd="view:border-transparent">...
```

### 3-2. web/editor.js: Add Transparent Border Toggle Button

**File**: `web/editor.html` (around lines 202-204)

```html
<!-- Add next to paragraph mark button -->
<div class="toolbar-group" id="toolbar-transparent-border">
    <button id="transparent-border-btn" class="toolbar-btn"
            title="Show/hide transparent borders">---</button>
</div>
```

**File**: `web/editor.js`

Add global state (around line 44):
```javascript
let showTransparentBorders = false;
```

Add event listener (setupEventListeners, around line 123):
```javascript
const tbBtn = document.getElementById('transparent-border-btn');
if (tbBtn) tbBtn.addEventListener('click', toggleTransparentBorders);
```

Add toggle function (below toggleParagraphMarks):
```javascript
function toggleTransparentBorders() {
    if (!doc) return;
    showTransparentBorders = !showTransparentBorders;
    doc.setShowTransparentBorders(showTransparentBorders);

    const btn = document.getElementById('transparent-border-btn');
    if (btn) {
        btn.style.background = showTransparentBorders ? '#4A90D9' : '';
        btn.style.color = showTransparentBorders ? '#fff' : '';
    }

    renderCurrentPage();
}
```

**Scale**: ~30 lines

---

## Step 4: Regression Tests + Build Verification

**File**: `src/wasm_api.rs`

### Test: Transparent Border Line Node Generation Verification

```rust
#[test]
fn test_task79_transparent_border_lines() {
    // Verify that with a sample HWP file containing tables with transparent borders,
    // Line nodes are additionally generated when show_transparent_borders=true
    // and existing behavior (not generated) when show_transparent_borders=false
}
```

### Build Verification

1. `docker compose --env-file /dev/null run --rm test` — all tests pass
2. SVG export: confirm file with transparent border table
3. WASM build + Vite build + web browser verification

**Scale**: Test ~30 lines

---

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/wasm_api.rs` | Flag + method + passing + test | ~40 lines |
| `src/renderer/layout.rs` | LayoutEngine flag + render_transparent_borders() + helper | ~65 lines |
| `rhwp-studio/src/command/commands/view.ts` | Command implementation | ~15 lines |
| `rhwp-studio/index.html` | Remove disabled | 1 line |
| `web/editor.html` | Add transparent border button | ~4 lines |
| `web/editor.js` | Toggle state + listener + function | ~15 lines |
