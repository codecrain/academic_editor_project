# Task 291 Design Document: Master Page Rendering

## 1. Goal

Correctly render the master page of `samples/hwpctl_Action_Table__v1.1.hwp`.
Master pages are rendered at the **lowest layer** beneath the body text,
displayed identically on all pages within a section.

## 2. Master Page Concept

- Set per Section
- Scope: Both / Odd / Even / Custom
- Content: Shapes, Pictures, Tables, Text — freely positioned
- Rendered behind body text (lowest layer)
- Can be hidden via `hide_master_page` flag or PageHide control

## 3. Binary Structure Analysis

### extra_child_records of Target File (Under SectionDef)

```
[0]  tag=72(CTRL_HEADER) level=2 size=34   ← Master page control header
[1]  tag=66(LIST_HEADER) level=2 size=24   ← Master page paragraph list (Both)
[2]  tag=67(PARA_HEADER) level=3 size=50   ↓ Master page paragraph
[3]  tag=68(PARA_TEXT)   level=3 size=8
[4]  tag=69(PARA_CHAR_SHAPE) level=3
[5]  tag=71(CTRL_HEADER) level=3 size=60   ← Shape ctrl[0] (Hancom logo)
[6]  tag=76(SHAPE_COMP)  level=4
[7-13] ...                                 ← Shape children + Picture ctrl[1]
[14] tag=71(CTRL_HEADER) level=3 size=196  ← Picture ctrl[2] or Shape
[15-19] ...                                ← Remaining Shape/Picture children
```

### Parsing Status

| Item | Current Status | Notes |
|------|----------|------|
| LIST_HEADER(tag=66) level=2 | Parsed | 1 Both master page |
| CTRL_HEADER(tag=72) level=2 | Ignored | Master page control header |
| "Custom:N" master page | Not supported | Needs further investigation |

## 4. Rendering Layer Structure

```
┌──────────────────────────────────┐
│ Layer 5: In Front of Text (Shape) │ ← Topmost
│ Layer 4: Body Text + Tables       │
│ Layer 3: Header/Footer            │
│ Layer 2: Page Border/Background   │
│ Layer 1: Master Page              │ ← Bottommost (behind body)
└──────────────────────────────────┘
```

Current `build_page_tree` call order:
1. `build_page_background` (background color) → Layer 2
2. `build_page_borders` (border lines) → Layer 2
3. `build_master_page` (master page) → **Layer 1** Correct position
4. `build_header/footer` (header/footer) → Layer 3
5. `build_single_column` (body) → Layer 4
6. Shape pass (`render_shapes_on_page`) → Layer 5

## 5. Implementation Steps

### Step 5-1: Fix Discovered Rendering Bugs

**Problem 1**: `build_master_page` passes `Control::Picture` to `layout_shape`,
but `layout_shape` only handles `Control::Shape` and ignores Picture (returns immediately)

**Fix**: Render Picture separately via `compute_object_position` + `layout_picture`

**File**: `src/renderer/layout.rs` (build_master_page)

### Step 5-2: Master Page Render Node Cache

**Design Principle**: Master pages are identical across all pages in a section, so **build once → cache → reference**

#### 5-2-1. Creation Timing

```
DocumentCore::paginate()
  ↓
  After pagination completes
  ↓
  build_master_page_cache()  ← Pre-build master page render nodes for each section
  ↓
  Store in master_page_cache
```

#### 5-2-2. Cache Data Structure

```rust
// Added to DocumentCore
struct MasterPageCacheEntry {
    render_node: RenderNode,     // Master page render node (MasterPage type, with children)
    page_width: f64,             // Page size at creation time (for validation)
    page_height: f64,
}

master_page_cache: HashMap<(usize, usize), MasterPageCacheEntry>
// Key: (section_index, master_page_index)
```

#### 5-2-3. Cache Build (After paginate)

```rust
fn build_master_page_cache(&mut self) {
    self.master_page_cache.clear();
    for (sec_idx, section) in self.document.sections.iter().enumerate() {
        if section.section_def.hide_master_page { continue; }
        for (mp_idx, mp) in section.section_def.master_pages.iter().enumerate() {
            let layout = PageLayoutInfo::from_page_def(&section.section_def.page_def, ...);
            let composed = compose_master_page_paragraphs(mp);
            let render_node = self.layout_engine.build_master_page_node(
                mp, &layout, &composed, &self.styles, &self.bin_data_content, sec_idx,
            );
            self.master_page_cache.insert(
                (sec_idx, mp_idx),
                MasterPageCacheEntry { render_node, page_width: layout.page_width, page_height: layout.page_height }
            );
        }
    }
}
```

#### 5-2-4. Reference During Page Rendering

```rust
// Inside build_page_tree
fn insert_cached_master_page(tree: &mut PageRenderTree, cache: &HashMap<...>, key: (usize, usize)) {
    if let Some(entry) = cache.get(&key) {
        // Clone RenderNode and insert (need to reassign node IDs)
        let cloned = clone_render_node_with_new_ids(tree, &entry.render_node);
        tree.root.children.push(cloned);
    }
}
```

#### 5-2-5. Node ID Collision Prevention

When cloning cached RenderNodes, a deep clone function is needed that
assigns new IDs via `tree.next_id()` to avoid collisions with existing page node IDs:

```rust
fn clone_render_node_with_new_ids(tree: &mut PageRenderTree, node: &RenderNode) -> RenderNode {
    let new_id = tree.next_id();
    let mut cloned = RenderNode::new(new_id, node.node_type.clone(), node.bbox.clone());
    for child in &node.children {
        cloned.children.push(clone_render_node_with_new_ids(tree, child));
    }
    cloned
}
```

#### 5-2-6. Cache Invalidation

| Event | Action |
|--------|------|
| `paginate()` called | `master_page_cache.clear()` |
| Document load | paginate() → auto rebuild |
| Section settings change | paginate() → auto rebuild |

### Step 5-3: Canvas Renderer Verification

- Verify recursive rendering of RenderNodes in `rhwp-studio/src/view/canvas-renderer.ts`
- Confirm that MasterPage node type is included in children traversal
- Add type matching if needed

### Step 5-4: "Custom:N" Master Page Parsing (After Further Investigation)

- Interpret the role of CTRL_HEADER(tag=72) level=2
- Binary analysis of how "Custom:1" is actually stored in Hancom
- Consider adding `HeaderFooterApply::Custom(u16)` type
- **Proceed with this step after completing "Both" master page rendering for the current file**

## 6. Files to Modify

| File | Changes |
|------|----------|
| `src/renderer/layout.rs` | Separate Picture rendering in build_master_page |
| `src/document_core/mod.rs` | Add master_page_cache field |
| `src/document_core/queries/rendering.rs` | Cache build after paginate(), cache reference in build_page_tree |
| `src/renderer/render_tree.rs` | clone_render_node_with_new_ids function |
| `rhwp-studio/src/view/canvas-renderer.ts` | Verify MasterPage node type handling |

## 7. Verification

- `samples/hwpctl_Action_Table__v1.1.hwp` 16 pages
  - All pages: Master page elements (Hancom logo, blue line, HANCOM logo) rendered
  - SVG: Master page elements output on layer below body
  - WASM: Same rendering on Canvas
- Existing HWP file regression: `cargo test` 716+ passing
- Documents without master pages: Confirm no impact
