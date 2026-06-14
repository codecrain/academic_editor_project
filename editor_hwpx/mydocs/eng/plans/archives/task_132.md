# Task 132 Execution Plan — Table Creation Dialog

## Background

### Current Problem

In rhwp-studio, the Menu > Table > "Create Table" item exists but is in stub state (`execute() { /* TODO */ }`).
There is no way for users to insert a new table, and there is no `createTable` API on the WASM side either.

### Hancom WebHwp Reference

webhwp creates tables by specifying row/column counts and sizes via `TableCreateDialog`.
rhwp needs to provide the same functionality.

### Existing Infrastructure Status

| Item | Status |
|------|--------|
| Table model (`src/model/table.rs`) | Complete (Cell::new_empty, rebuild_grid, etc.) |
| Table Paragraph creation pattern | Complete example exists in `inject_html_tables_to_section()` (wasm_api.rs:8560-8720) |
| WasmBridge pattern | JSON return pattern established with `insertTableRow()` etc. |
| Dialog pattern | CharShapeDialog (standalone class, onApply callback) pattern available |
| Command pattern | `table:create` stub already registered in `table.ts:18-19` |
| Menu connection | `data-cmd="table:create"` already exists in `index.html` |

## Implementation Steps (4 Steps)

---

### Step 1: WASM API — `createTable`

**Purpose**: Add a Rust function to create a new table at the cursor position

**File**: `src/wasm_api.rs`

**Public API** (wasm_bindgen):
```rust
#[wasm_bindgen(js_name = createTable)]
pub fn create_table(
    &mut self,
    section_idx: u32,
    para_idx: u32,
    char_offset: u32,
    row_count: u32,
    col_count: u32,
) -> Result<String, JsValue>
```

**Internal implementation** (`create_table_native`):
1. Calculate editing area width from PageDef: `page_width - margin_left - margin_right`
2. Distribute columns equally: `col_width = total_width / col_count`
3. Default row height: 1000 HWPUNIT
4. Create `row_count x col_count` `Cell::new_empty()` instances
5. Create Table struct (reuse existing `inject_html_tables_to_section` pattern):
   - `attr`: `0x082A2311` (treat_as_char standard value)
   - `raw_ctrl_data`: CommonObjAttr 38 bytes (width, height, instance_id)
   - `raw_table_record_attr`: `0x04000006`
   - `padding`: default L:510 R:510 T:141 B:141
   - `border_fill_id`: Acquire solid border BorderFill from DocInfo
6. Create Paragraph containing Table (char_count=9, control_mask=0x800)
7. Insert at cursor position:
   - If `char_offset == 0` and empty paragraph → replace that paragraph with table paragraph
   - Otherwise → split paragraph with `split_paragraph_native()` then insert table paragraph
8. Add empty paragraph below table (HWP standard behavior)
9. Call `rebuild_grid()`
10. Return JSON: `{"ok":true,"paraIdx":<N>,"controlIdx":0}`

**Existing code to reuse**:
- `Cell::new_empty()` (`src/model/table.rs:115`)
- `Table::rebuild_grid()` (`src/model/table.rs:184`)
- raw_ctrl_data/table_attr/tbl_rec_attr creation pattern from `inject_html_tables_to_section` (wasm_api.rs:8560-8720)
- `split_paragraph_native()` (wasm_api.rs:4454)

---

### Step 2: Add WasmBridge Method

**Purpose**: Type-safe wrapper for calling WASM `createTable` from JS

**File**: `rhwp-studio/src/core/wasm-bridge.ts`

```typescript
createTable(sec: number, para: number, charOffset: number,
            rows: number, cols: number): { ok: boolean; paraIdx: number; controlIdx: number } {
  this.ensureDoc();
  return JSON.parse(this.doc.createTable(sec, para, charOffset, rows, cols));
}
```

---

### Step 3: Table Creation Dialog UI

**Purpose**: Simple dialog to input row/column counts

**File**: `rhwp-studio/src/ui/table-create-dialog.ts` (new)

**UI Layout** (Hancom style):
```
┌───────────────────────────┐
│ Create Table           [×]│
├───────────────────────────┤
│                           │
│  Rows:        [ 2 ]       │
│  Columns:     [ 3 ]       │
│                           │
├───────────────────────────┤
│           [Create] [Cancel]│
└───────────────────────────┘
```

**Implementation**:
- Follow CharShapeDialog pattern (standalone class, build() → show() → hide())
- CSS: Reuse existing `.dialog-*` classes, prefix `tc-` (table-create)
- Rows: 1~256, default 2
- Columns: 1~256, default 3
- `onApply` callback: `(rows: number, cols: number) => void`
- Enter key to confirm, Esc to cancel

---

### Step 4: Command Connection + Testing

**Purpose**: Call dialog from `table:create` command → call WASM API → refresh rendering

**File 1**: `rhwp-studio/src/command/commands/table.ts` (line 18-19)

```typescript
{ id: 'table:create', label: 'Create Table', icon: 'icon-table',
  canExecute: (ctx) => ctx.hasDocument && !ctx.inTable,
  execute(services) {
    const ih = services.getInputHandler();
    if (!ih) return;
    const pos = ih.getCursorPosition();
    const dialog = new TableCreateDialog();
    dialog.onApply = (rows, cols) => {
      try {
        const result = services.wasm.createTable(
          pos.sectionIndex, pos.paragraphIndex, pos.charOffset,
          rows, cols
        );
        if (result.ok) {
          services.eventBus.emit('document-changed');
        }
      } catch (e) {
        console.error('Table creation failed:', e);
      }
    };
    dialog.show();
  },
},
```

**File 2**: Regression testing and WASM build verification
- `docker compose run --rm test` — 571 regression tests pass
- `docker compose run --rm wasm` — WASM build succeeds
- Open blank document in browser → Create table → Verify 2x3 table creation
- Save and reopen to verify table is preserved

---

## Changed Files Summary

| File | Change Description | Scale |
|------|-------------------|-------|
| `src/wasm_api.rs` | Add `create_table` + `create_table_native` | ~120 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | Add `createTable()` method | ~5 lines |
| `rhwp-studio/src/ui/table-create-dialog.ts` | Table creation dialog (new) | ~120 lines |
| `rhwp-studio/src/command/commands/table.ts` | Implement `table:create` | ~15 lines |
| **Total** | | **~260 lines** |

## Verification Methods

1. `docker compose run --rm test` — Confirm 571 regression tests pass
2. `docker compose run --rm wasm` — Confirm WASM build succeeds
3. In browser: blank document → Table > Create Table → Insert 2x3 table → Verify text input in cells
4. Save document containing table (.hwp) and reload to verify table preservation
5. Insert table in the middle of text in an existing document → Verify paragraph split + table insertion works correctly
