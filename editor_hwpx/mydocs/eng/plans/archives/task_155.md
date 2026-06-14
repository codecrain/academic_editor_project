# Task 155: Table/Cell Properties Dialog Basic Tab Overhaul

> **Created**: 2026-02-23
> **Priority**: P1
> **Status**: Complete

---

## 1. Problem Definition

### 1-1. Symptoms

The "Basic" tab of the table/cell properties dialog is significantly different from Hancom's word processor.

- "Treat as character" checkbox is always disabled + checked (hardcoded)
- Text wrap buttons (Square/TopAndBottom/BehindText/InFrontOfText) are inactive only
- Horizontal/vertical position settings (reference/alignment/offset) UI is absent entirely
- Options for "restrict to page area", "allow overlap", "sync with layout code" are missing
- Object rotation, skew, and other sections are missing
- Backend API does not expose position-related attributes, making read/write impossible

### 1-2. Cause

- `get_table_properties_native()`/`set_table_properties_native()` do not include position-related values from `table.attr` bit field and `raw_ctrl_data` offsets
- Frontend `TableProperties` type has no position-related field definitions
- `buildBasicTab()` implements position/layout UI as read-only stubs only

### 1-3. Goal

Implement UI identical to Hancom's table/cell properties dialog basic tab to maintain user experience consistency.

---

## 2. Data Model

### 2-1. table.attr Bit Field (Same layout as CommonObjAttr)

| Bit | Field | Value |
|-----|-------|----|
| 0 | treat_as_char | 0=page layout, 1=treat as character |
| 3-4 | vert_rel_to | 0=Paper, 1=Page, 2=Para |
| 5-7 | vert_align | 0=Top, 1=Center, 2=Bottom, 3=Inside, 4=Outside |
| 8-9 | horz_rel_to | 0=Paper, 1=Page, 2=Column, 3=Para |
| 10-12 | horz_align | 0=Left, 1=Center, 2=Right, 3=Inside, 4=Outside |
| 13 | restrict_in_page | Restrict to page area |
| 14 | allow_overlap | Allow overlap |
| 21-23 | text_wrap | 0=Square, 1=TopAndBottom, 2=BehindText, 3=InFrontOfText |

### 2-2. table.raw_ctrl_data Layout (after ctrl_data[4..])

| Offset | Size | Field |
|--------|------|-------|
| 0-3 | i32 | vertical_offset |
| 4-7 | i32 | horizontal_offset |
| 8-11 | u32 | width |
| 12-15 | u32 | height |
| 20-21 | i16 | outer_left |
| 22-23 | i16 | outer_right |
| 24-25 | i16 | outer_top |
| 26-27 | i16 | outer_bottom |
| 32-35 | i32 | prevent_page_break (keep object and layout code on same page) |

---

## 3. Implementation Plan

### Step 3-1: Backend — Expose All Position Attributes

**File: `src/document_core/commands/table_ops.rs`**

- `get_table_properties_native()`: Extract 11 position attributes from attr bits and include in JSON
  - treatAsChar, textWrap, vertRelTo, vertAlign, horzRelTo, horzAlign (attr bits)
  - vertOffset, horzOffset (raw_ctrl_data[0..8])
  - restrictInPage, allowOverlap (attr bit 13, 14)
  - keepWithAnchor (raw_ctrl_data[32..36])

- `set_table_properties_native()`: Handle writing 11 fields
  - String → bit value conversion then attr bit masking
  - i32 offset → raw_ctrl_data byte direct write

### Step 3-2: Frontend — Extend TableProperties Type

**File: `rhwp-studio/src/core/types.ts`**

Add 11 fields to TableProperties interface:
- treatAsChar, textWrap, vertRelTo, vertAlign, horzRelTo, horzAlign
- vertOffset, horzOffset
- restrictInPage, allowOverlap, keepWithAnchor

### Step 3-3: Frontend — Complete Basic Tab UI Overhaul

**File: `rhwp-studio/src/ui/table-cell-props-dialog.ts`**

Implement referencing picture-props-dialog.ts basic tab pattern.

UI structure (identical to Hancom):
```
┌─ Size ────────────────────────────────────┐
│ Width: [____] mm   Height: [____] mm       │ (read only)
└────────────────────────────────────────────┘
┌─ Position ────────────────────────────────┐
│ ☑ Treat as character                       │
│ ┌─ Text wrap group (posGroup) ────────────┐│
│ │ [Square] [TopBottom] [Behind] [InFront]  ││
│ │ Horz: [Paper▼] [Left▼] offset [__] mm   ││
│ │ Vert: [Paper▼] [Top▼]  offset [__] mm   ││
│ │ ☑ Restrict to page area                  ││
│ │ ☐ Allow overlap                           ││
│ │ ☐ Keep object and code on same page       ││
│ └──────────────────────────────────────────┘│
└────────────────────────────────────────────┘
┌─ Object Rotation ─────────────────────────┐
│ Angle: [____] degrees (disabled)            │
└────────────────────────────────────────────┘
┌─ Skew ────────────────────────────────────┐
│ Horz: [____] degrees Vert: [____] degrees (disabled) │
└────────────────────────────────────────────┘
┌─ Other ───────────────────────────────────┐
│ Number type: [Table▼] (disabled)            │
└────────────────────────────────────────────┘
```

Key behavior:
- "Treat as character" checked → toggle `.disabled` CSS class on posGroup → disabled
- "Treat as character" unchecked → posGroup activated

CSS: `.dialog-pos-group.disabled { opacity: 0.5; pointer-events: none; }`

---

## 4. Modified Files List

| File | Change |
|------|--------|
| `src/document_core/commands/table_ops.rs` | Add 11 position attributes to get/set |
| `rhwp-studio/src/core/types.ts` | Add 11 fields to TableProperties |
| `rhwp-studio/src/ui/table-cell-props-dialog.ts` | Complete rewrite of buildBasicTab() + helper methods + populateFields/onConfirm extension |
| `rhwp-studio/src/styles/dialogs.css` | Add `.dialog-pos-group.disabled` rule |

## 5. References

| File | Reference Content |
|------|------------------|
| `rhwp-studio/src/ui/picture-props-dialog.ts` | Basic tab position UI pattern (wrapBtns, posDetailEls, updatePositionVisibility) |
| `src/parser/control/shape.rs` | CommonObjAttr bit parsing logic |
| `src/model/shape.rs` | VertRelTo, HorzRelTo, VertAlign, HorzAlign, TextWrap enum definitions |

## 6. Verification

1. `docker compose --env-file .env.docker run --rm test` — 608 tests pass
2. `docker compose --env-file .env.docker run --rm wasm` — WASM build succeeds
3. UI verification:
   - Basic tab shows identical layout to Hancom
   - "Treat as character" checked → text wrap group disabled (opacity 0.5)
   - "Treat as character" unchecked → text wrap group activated
   - Text wrap buttons show active state when selected
   - Horizontal/vertical position setting values save/load correctly
   - UI → WASM → Rust IR full data flow verified

## 7. Results

- **Commits**: `9378be0` basic tab overhaul + `eef7cc4` status update
- **Change volume**: 4 files, +296 / -23 lines
- **Tests**: 608 pass, WASM build succeeds
