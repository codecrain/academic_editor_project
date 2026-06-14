# rhwp Core Engine CQRS Analysis and Refactoring Proposal

> **Target**: rhwp core engine (`wasm_api.rs`) + MCP Server Tool API design  
> **Perspective**: CQRS (Command Query Responsibility Segregation)  
> **Date**: 2026-02-22  
> **Prior review**: [2nd Code Review Report](r-code-review-2nd.md) (overall 5.4/10)  

---

## 1. What Is CQRS, and Why Does rhwp Need It?

CQRS is an architectural pattern that separates the responsibility of **state-changing operations (Commands)** from **state-querying operations (Queries)**.

The reason rhwp needs CQRS is the **MCP Server's Tool-based API**:

```
Actual scenario where an AI Agent calls MCP Tools:

1. read_hwp("template.hwp")                    <- Query
2. get_table_data(section=0, table=0)           <- Query  (parallelizable with 1)
3. get_table_data(section=0, table=1)           <- Query  (parallelizable with 1, 2)
4. modify_cell(table=0, row=1, col=2, "5M")     <- Command (sequential required)
5. modify_cell(table=0, row=2, col=2, "3M")     <- Command (sequential required)
6. modify_cell(table=1, row=0, col=3, "Total")  <- Command (sequential required)
7. export_hwp("output.hwp")                     <- Query
```

- **Steps 2~3**: Independent Queries -> should be parallelizable
- **Steps 4~6**: Sequential Commands -> no need to paginate each time (only once before Step 7)
- The current structure makes **neither possible**

---

## 2. Command/Query Distribution in the Current Codebase

### Quantitative Analysis

| Type | Method Count | `self` Signature | Naming Pattern |
|---|---|---|---|
| **Command** | **75** | `&mut self` | `insert_*`, `delete_*`, `set_*`, `merge_*`, `split_*`, `paste_*`, `apply_*` |
| **Query** | **83** | `&self` | `get_*`, `render_*`, `export_*`, `has_*`, `is_*`, `page_count` |
| **Total** | **158** | -- | -- |

> **Positive finding**: Thanks to Rust's `&self` vs `&mut self`, Commands/Queries are **already distinguished at the compiler level**. The barrier to CQRS adoption is low.

### Core Problem: Synchronous Coupling of Command Post-processing

All Command methods repeat the following pattern:

```rust
pub fn insert_text_native(&mut self, ...) -> Result<String, HwpError> {
    // (1) Business logic (Command core)
    paragraph.insert_text(offset, text);

    // (2) Cache invalidation — repeated 55 times
    self.sections[section_idx].raw_stream = None;

    // (3) Full re-pagination — repeated 45 times
    self.paginate();

    // (4) JSON result return
    Ok(format!("{{\"ok\":true,\"para_idx\":{},\"offset\":{}}}", para_idx, new_offset))
}
```

| Repeated Pattern | Occurrences | Problem |
|---|---|---|
| `self.sections[idx].raw_stream = None` | **55 times** | Manual cache invalidation, silent bugs when missed |
| `self.paginate()` | **45 times** | Full document re-layout, unnecessary repetition during sequential edits |
| `Ok(format!("{{\"ok\":true...}}")` | **39 times** | Manual JSON generation, no structural guarantees |

**Impact**: In the MCP scenario above, the 3 sequential Commands in Steps 4~6 call `paginate()` **3 times**. Only **1 call** right before Step 7 is actually needed.

---

## 3. CQRS Application Strategy: 3 Stages

### Stage 1: Lazy Pagination (Immediately Applicable) -- Recommended

> Difficulty: Low | Duration: 1~2 days | API changes: None

**Core idea**: Don't call paginate in Commands; rebuild only when needed at Query time.

```rust
// ---- Before ----------------------------------------
pub fn insert_text_native(&mut self, ...) {
    paragraph.insert_text(offset, text);
    self.sections[idx].raw_stream = None;   // repeated 55 times
    self.paginate();                         // repeated 45 times
    Ok(...)
}

// ---- After -----------------------------------------
pub fn insert_text_native(&mut self, ...) {
    paragraph.insert_text(offset, text);
    self.mark_dirty(section_idx);   // unified invalidation (1 line)
    Ok(...)                          // no paginate call
}

// mark_dirty: reset raw_stream + set dirty flag
fn mark_dirty(&mut self, section_idx: usize) {
    self.sections[section_idx].raw_stream = None;
    self.needs_paginate = true;
}

// Lazy execution at Query time
fn ensure_paginated(&mut self) {
    if self.needs_paginate {
        self.paginate();
        self.needs_paginate = false;
    }
}

// Called at the entry point of all Query methods
pub fn render_page_svg(&mut self, page_num: u32) -> ... {
    self.ensure_paginated();
    // proceed with rendering...
}
```

**Effect**:

| Scenario | Before | After |
|---|---|---|
| Insert text 1x + render | paginate 1x | paginate 1x (same) |
| Insert text 10x consecutively + render | paginate **10x** | paginate **1x** |
| Batch modify 50 table cells + save | paginate **50x** | paginate **1x** |
| AI Agent batch editing (MCP) | paginate **Nx** | paginate **1x** |

> Note: Current `&self` Query method signatures would need to change to `&mut self`, or internal mutability via `Cell<bool>` / `RefCell` would need to be introduced. In the WASM environment (single-threaded), `Cell<bool>` is appropriate.

### Stage 2: Structural Command/Query Separation (In Parallel with P1 Refactoring)

> Difficulty: Medium | Duration: 3~5 days | API changes: Internal only

```rust
// Current: Commands and Queries mixed in one impl block
impl HwpDocument {
    // 75 Command methods
    // 83 Query methods
    // All accessing the same struct
}

// After: Role-based separation
// commands/text_editing.rs
impl HwpDocument {
    pub fn insert_text_native(&mut self, ...) { ... }
    pub fn delete_text_native(&mut self, ...) { ... }
}

// queries/rendering.rs
impl HwpDocument {
    pub fn render_page_svg(&self, ...) { ... }
    pub fn get_page_info(&self, ...) { ... }
}

// queries/document_info.rs
impl HwpDocument {
    pub fn get_paragraph_count(&self, ...) { ... }
    pub fn get_text_range(&self, ...) { ... }
}
```

**This aligns exactly with the "role-based module split of wasm_api.rs" (P1-4) proposed in the 2nd code review.** Using Command/Query as the split criterion for CQRS naturally achieves both SRP improvement and CQRS adoption simultaneously.

| Module | CQRS Role | Current Method Count |
|---|---|---|
| `commands/text_editing.rs` | Command | ~15 |
| `commands/table_editing.rs` | Command | ~20 |
| `commands/formatting.rs` | Command | ~15 |
| `commands/clipboard.rs` | Command | ~10 |
| `commands/document_setup.rs` | Command | ~15 |
| `queries/rendering.rs` | Query | ~10 |
| `queries/document_info.rs` | Query | ~30 |
| `queries/cursor.rs` | Query | ~15 |
| `queries/export.rs` | Query | ~8 |

### Stage 3: Event Sourcing + Read Model (Long-term, MCP Server Optimization)

> Difficulty: High | Duration: 2~3 weeks | API changes: Reflected in MCP Tool design

```
                    MCP Server
                       |
         +-------------+-------------+
         v             v             v
   Command Tool   Command Tool   Query Tool
   (modify_cell)  (insert_text)  (render_page)
         |             |             |
         v             v             |
   +-------------------------+      |
   |   Command Handler       |      |
   |   -> Document Model mod |      |
   |   -> Emit Event         |      |
   +-----------+-------------+      |
               | DocumentChanged     |
               v                     |
   +-------------------------+      |
   |  Projection Builder      |      |
   |  (paginate + layout)     |------+
   |  -> Build PagedDocument  |  Queries read from here
   +--------------------------+
```

**What this stage provides**:
- **Rollback** on Command failure (Event-based restoration)
- Incremental pagination (recalculate only changed sections)
- Natural implementation of edit history (Undo/Redo)
- **Full parallel execution** of MCP Query Tools

---

## 4. CQRS Guidelines for MCP Tool API Design

When designing MCP Server Tools, apply the following rules:

### Rule 1: Explicitly Classify Tools as Command or Query

```yaml
# rhwp MCP Server Tool definitions
tools:
  # -- Query Tools (no state changes, parallelizable) --
  - name: read_hwp
    type: query
    description: "Parse HWP file and return structure information"

  - name: get_table_data
    type: query
    description: "Return specific table data as JSON"

  - name: render_page
    type: query
    description: "Render a specific page as SVG/PNG"

  - name: export_hwp
    type: query
    description: "Export current document as HWP binary"

  # -- Command Tools (state changes, sequential execution) --
  - name: modify_cell
    type: command
    description: "Change text in a table cell"

  - name: insert_paragraph
    type: command
    description: "Insert a paragraph"

  - name: apply_template
    type: command
    description: "Fill a template with data"

  # -- Batch Command (execute multiple Commands atomically) --
  - name: batch_modify
    type: command
    description: "Execute multiple modifications as a single transaction"
```

### Rule 2: Support Batch Commands

The typical usage pattern of AI Agents is **"fill multiple cells at once"**. If only individual Commands are provided, N Tool calls are needed, and in the current structure, N paginate calls occur.

```
// AS-IS: AI Agent calls N times
modify_cell(table=0, row=0, col=1, "5M")  -> paginate
modify_cell(table=0, row=1, col=1, "3M")  -> paginate
modify_cell(table=0, row=2, col=1, "2M")  -> paginate

// TO-BE: 1 Batch call
batch_modify([
  {action: "modify_cell", table: 0, row: 0, col: 1, value: "5M"},
  {action: "modify_cell", table: 0, row: 1, col: 1, value: "3M"},
  {action: "modify_cell", table: 0, row: 2, col: 1, value: "2M"},
])  -> paginate 1x
```

### Rule 3: Commands Return Events, Side Effects Are Separated

```rust
// Command Tool return value
{
  "status": "ok",
  "events": [
    {"type": "cell_modified", "table": 0, "row": 0, "col": 1},
    {"type": "cell_modified", "table": 0, "row": 1, "col": 1}
  ],
  "needs_repaginate": true  // Client can decide
}
```

---

## 5. Refactoring Priority and Timeline

| Stage | Task | Timeline | Prerequisites |
|---|---|---|---|
| **Stage 1** | Lazy Pagination (`mark_dirty` + `ensure_paginated`) | **1~2 days** | None (can start immediately) |
| **Stage 2** | Command/Query file separation (integrate with wasm_api.rs split) | **3~5 days** | P0 Quick Win |
| **Stage 3** | Event Sourcing + Batch Command (co-designed with MCP server) | **2~3 weeks** | Stage 2, MCP protocol finalized |

### Stage 1 Estimated Code Changes

| Change | Lines |
|---|---|
| Add `needs_paginate: bool` field to `HwpDocument` | +1 |
| Add `mark_dirty()` helper function | +5 |
| Add `ensure_paginated()` helper function | +6 |
| Remove 45 `self.paginate()` calls | -45 |
| Replace 55 `raw_stream = None` with `self.mark_dirty()` | +/-0 |
| Add `ensure_paginated()` at Query method entry points | +20 |
| **Net change** | **Approx. -13 lines** (code reduction) |

---

## 6. Conclusion

| Perspective | Current State | Proposal |
|---|---|---|
| **Structure** | Command/Query mixed (God Object) | File separation in Stage 2 |
| **Performance** | Full paginate on every Command | **Apply Stage 1 immediately** |
| **MCP Design** | Undetermined | Explicitly classify Tools as C/Q + Batch support |
| **Extensibility** | Adding new Tool requires direct wasm_api.rs modification | Adapter separation via Hexagonal + CQRS |

**Key recommendation**: Stage 1 (Lazy Pagination) has the **smallest code change (-13 lines) with the greatest performance improvement**. We recommend starting immediately alongside P0 Quick Wins.

> *"An AI Agent doesn't edit documents one character at a time. It fills 50 cells at once. At that point, paginate only needs to run once."*
