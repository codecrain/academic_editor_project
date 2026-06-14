# Task 84 Implementation Plan: Table/Cell Properties Dialog

## Implementation Steps (5 steps)

### Step 1: WASM API (Rust)

Add 4 APIs to `src/wasm_api.rs`:

1. **`getCellProperties(sec, ppi, ci, cellIdx)`** → JSON
   - Return: `{ width, height, paddingLeft, paddingRight, paddingTop, paddingBottom, verticalAlign, textDirection, isHeader }`
   - Unit: HWPUNIT as-is (frontend converts to mm)

2. **`setCellProperties(sec, ppi, ci, cellIdx, json)`** → Result
   - Input: JSON containing only changed fields
   - Directly modify Cell struct + trigger re-render

3. **`getTableProperties(sec, ppi, ci)`** → JSON
   - Return: `{ cellSpacing, paddingLeft, paddingRight, paddingTop, paddingBottom, pageBreak, repeatHeader }`

4. **`setTableProperties(sec, ppi, ci, json)`** → Result
   - Input: JSON containing only changed fields
   - Directly modify Table struct + trigger re-render

Reference existing `get_table_dimensions_native` pattern. Set functions use `&mut self` for `&mut self.document` access.

**Completion criteria**: `docker compose run --rm test` pass

---

### Step 2: TypeScript Types + WASM Bridge

1. Add interfaces to `rhwp-studio/src/core/types.ts`:
   ```ts
   interface CellProperties {
     width: number; height: number;
     paddingLeft: number; paddingRight: number;
     paddingTop: number; paddingBottom: number;
     verticalAlign: number; // 0=top, 1=center, 2=bottom
     textDirection: number; // 0=horizontal, 1=vertical
     isHeader: boolean;
   }
   interface TableProperties {
     cellSpacing: number;
     paddingLeft: number; paddingRight: number;
     paddingTop: number; paddingBottom: number;
     pageBreak: number; // 0=none, 1=cellBreak
     repeatHeader: boolean;
   }
   ```

2. Add 4 methods to `rhwp-studio/src/core/wasm-bridge.ts`:
   - `getCellProperties(sec, ppi, ci, cellIdx): CellProperties`
   - `setCellProperties(sec, ppi, ci, cellIdx, props): {ok:boolean}`
   - `getTableProperties(sec, ppi, ci): TableProperties`
   - `setTableProperties(sec, ppi, ci, props): {ok:boolean}`

**Completion criteria**: Vite build success

---

### Step 3: Tab Dialog UI + CSS Styles

1. Add tab UI styles to `rhwp-studio/src/style.css`:
   - `.dialog-tabs` (tab header bar)
   - `.dialog-tab` (individual tab button)
   - `.dialog-tab.active` (selected tab)
   - `.dialog-tab-panel` (tab content panel)
   - `.dialog-checkbox` (checkbox style)
   - `.dialog-btn-group` (button group — vertical alignment etc.)

2. Create `rhwp-studio/src/ui/table-cell-props-dialog.ts`:
   - Extend ModalDialog, support tab switching
   - **Table tab** (active): Page split radio, header row checkbox, all cell inner margins x4
   - **Cell tab** (active): Size (width/height), inner margins (4 directions), vertical alignment (3 buttons), vertical text (2 buttons), header cell checkbox, single line/cell protection/field name (disabled)

**Completion criteria**: Vite build success, tab switching works on dialog display

---

### Step 4: Basic/Margins-Caption/Borders/Background Tab UI (for future connection)

1. **Basic tab**: Size (width/height disabled), position (disabled), layout (disabled), object protection (disabled)
2. **Margins/Caption tab**: Outer margins (disabled), caption position/size/spacing (disabled)
3. **Borders tab**: Line type/thickness/color (disabled), preview (disabled), cell spacing (active — table.cell_spacing)
4. **Background tab**: No fill/color/pattern/gradation/image (all disabled)

All controls have DOM references saved as instance members for future activation.

**Completion criteria**: Vite build success, all 6 tabs displayed

---

### Step 5: Command Connection + Build/Verification

1. Add execution logic to `table.ts`'s `table:cell-props` stub:
   - Query current cursor's table/cell position
   - Create TableCellPropsDialog + show()
   - Dialog queries properties via WASM API → populate fields
   - OK button → setCellProperties/setTableProperties → document-changed event

2. WASM build (`docker compose run --rm wasm`)
3. Vite build confirmation
4. Web verification: right-click in table → "Table/Cell Properties" → dialog displayed → verify values → modify → confirm application

**Completion criteria**: Full build success, table/cell property query and modification works in dialog
