# Task 62: Page Setup Dialog UI — Implementation Plan

## Step 1: WASM API — getPageDef / setPageDef (~60 lines)

### src/wasm_api.rs

1. Add `get_page_def(section_idx: u32)` — `#[wasm_bindgen(js_name = getPageDef)]`
   - Return HWPUNIT raw values from `self.document.sections[sec_idx].section_def.page_def` as JSON
   - Return fields: width, height, marginLeft, marginRight, marginTop, marginBottom, marginHeader, marginFooter, marginGutter, landscape(bool), binding(0/1/2)

2. Add `set_page_def(section_idx: u32, json: &str)` — `#[wasm_bindgen(js_name = setPageDef)]`
   - Parse JSON → overwrite PageDef fields
   - Call `self.convert_to_editable()` for full re-pagination
   - Return `"ok"` on success

### Build Verification
- `docker compose --env-file /dev/null run --rm dev` — native build
- `docker compose --env-file /dev/null run --rm test` — existing test pass confirmation

---

## Step 2: Modal Dialog Base + CSS (~120 lines)

### src/style.css — Dialog CSS Addition

WebGian pattern based:
- `.modal-overlay` — semi-transparent background (rgba(0,0,0,0.2)), z-index: 10000, fullscreen
- `.dialog-wrap` — centered, white background, blue border (#748bc9)
- `.dialog-wrap .dialog-title` — header (#e7eaf4 background, bold, drag cursor)
- `.dialog-wrap .dialog-close` — X close button
- `.dialog-wrap .dialog-body` — body area (padding)
- `.dialog-wrap .dialog-section` — group box (border, title)
- `.dialog-wrap .dialog-footer` — OK/Cancel button area
- `.dialog-wrap .field-row` — label + input single line
- `.dialog-wrap input[type="number"]` — number input style
- `.dialog-wrap select` — dropdown style
- `.dialog-wrap .radio-group` — radio button group

### src/ui/dialog.ts — Modal Base Class (~60 lines)

```typescript
export class ModalDialog {
  protected overlay: HTMLDivElement;
  protected dialog: HTMLDivElement;

  constructor(title: string, width: number);
  show(): void;       // overlay + dialog append to body
  hide(): void;       // remove
  protected createBody(): HTMLElement;  // subclass override
  protected onConfirm(): void;         // subclass override
}
```
- show(): append overlay + dialog to `document.body`, Escape key to close
- hide(): DOM removal
- Drag movement not implemented (future)

---

## Step 3: Page Setup Dialog UI (~200 lines)

### src/core/types.ts — PageDef Interface Addition

```typescript
export interface PageDef {
  width: number;        // HWPUNIT
  height: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  marginHeader: number;
  marginFooter: number;
  marginGutter: number;
  landscape: boolean;
  binding: number;      // 0=Single, 1=Both, 2=Top
}
```

### src/core/wasm-bridge.ts — Add getPageDef/setPageDef

```typescript
getPageDef(sectionIdx: number): PageDef;
setPageDef(sectionIdx: number, pageDef: PageDef): string;
```

### src/ui/page-setup-dialog.ts — Page Setup Dialog (~180 lines)

Implemented by inheriting ModalDialog:

1. **Paper Type** section
   - `<select>` dropdown: A4, A3, B4, B5, Letter, Legal, Custom
   - Width/Height `<input type="number">` (mm unit, step=0.1)
   - Auto-fill width/height on paper selection, editable when "Custom"

2. **Paper Orientation** section
   - Radio: Portrait / Landscape
   - Swap width/height when landscape selected

3. **Binding** section
   - Radio: Single / Both / Top

4. **Page Margins** section
   - 7 fields: Top/Bottom/Left/Right/Header/Footer/Gutter (mm, step=0.1)

5. **Apply To**
   - `<select>`: Entire document (currently single option)

6. **OK/Cancel**
   - OK: Convert mm→HWPUNIT then call `wasm.setPageDef()`, re-render canvas
   - Cancel: close dialog

### Unit Conversion Utility

```typescript
const HWPUNIT_PER_MM = 7200 / 25.4;  // ~283.46
function hwpunitToMm(hu: number): number { return hu * 25.4 / 7200; }
function mmToHwpunit(mm: number): number { return Math.round(mm * 7200 / 25.4); }
```

---

## Step 4: Command Connection + F7 Shortcut (~40 lines)

### src/command/commands/file.ts

Activate `file:page-setup` command:
- `canExecute: (ctx) => ctx.hasDocument`
- `execute`: Create PageSetupDialog instance → show()

### src/command/commands/page.ts

Activate `page:setup` command:
- Same behavior as `file:page-setup` (delegate via dispatcher or identical implementation)

### src/command/shortcut-map.ts

Add F7 shortcut:
```typescript
[{ key: 'f7' }, 'file:page-setup'],
```

### src/engine/input-handler.ts

Verify that F7 key events are dispatched as commands through shortcutMap. Ensure function keys (F1~F12) match in existing matchShortcut logic without requiring ctrl.

---

## Step 5: Build + WASM Build + Integration Test

1. `docker compose --env-file /dev/null run --rm dev` — native build
2. `docker compose --env-file /dev/null run --rm test` — all Rust tests pass
3. `docker compose --env-file /dev/null run --rm wasm` — WASM build
4. Browser testing:
   - Click File > Page Setup menu → dialog displayed
   - F7 key → dialog displayed
   - Verify current document's paper settings are correctly displayed
   - Change margin values then OK → canvas re-render confirmed
   - Cancel → no changes confirmed
   - Escape key → dialog closes

---

## Modified/New Files List

| File | Action | Scale |
|------|--------|-------|
| `src/wasm_api.rs` | Modify — add getPageDef/setPageDef | ~60 lines |
| `rhwp-studio/src/style.css` | Modify — add dialog CSS | ~80 lines |
| `rhwp-studio/src/ui/dialog.ts` | New — modal base class | ~60 lines |
| `rhwp-studio/src/ui/page-setup-dialog.ts` | New — page setup dialog | ~180 lines |
| `rhwp-studio/src/core/types.ts` | Modify — PageDef interface | ~15 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | Modify — getPageDef/setPageDef | ~15 lines |
| `rhwp-studio/src/command/commands/file.ts` | Modify — activate page-setup | ~15 lines |
| `rhwp-studio/src/command/commands/page.ts` | Modify — activate setup | ~10 lines |
| `rhwp-studio/src/command/shortcut-map.ts` | Modify — F7 binding | ~2 lines |
| **Total** | | **~437 lines** |
