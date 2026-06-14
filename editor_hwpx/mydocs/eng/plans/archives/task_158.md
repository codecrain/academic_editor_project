# Task 158 Execution Plan: Text Box Border/Fill/Vertical Writing

## Task Overview

Complete text box (Shape) object border/fill/vertical writing/symbol substitution/rotation/shape conversion features.

## Current Status Analysis

| Feature | Rendering | UI | Notes |
|---------|-----------|-----|-------|
| Border line type/thickness/color | Complete | Complete | 11 line types, SVG/Canvas both supported |
| Border arrows | SVG complete, Canvas partial | Complete | Canvas lacks marker support |
| Solid fill | Complete | Complete | |
| Gradient fill | Complete | Complete | Linear+radial, types 3-4 approximated |
| Picture fill | Complete | Complete | Tile/stretch/center etc. |
| Pattern fill | Unverified | Complete | Hatching pattern rendering needs verification |
| Vertical writing - table cells | Complete | N/A | Full vertical column layout |
| Vertical writing - text boxes | **Not implemented** | UI ready | Key work target |
| Symbol substitution | **Not implemented** | None | Punctuation rotation/substitution for vertical writing |
| Rotation (90-degree) | Affine transform supported | Input only | UI save/reflect needs verification |
| Shape→text box conversion | **Not implemented** | None | Low priority |
| Object properties dialog | N/A | 85~90% complete | Some controls disabled |

## Core Work Scope

### Must Implement
1. **Text box vertical writing**: Integrate table cell vertical writing logic into text boxes
2. **Symbol substitution**: Punctuation direction rotation/substitution for vertical writing (period→ring dot, etc.)
3. **Object properties dialog integration**: Ensure vertical writing/text direction settings actually affect rendering

### Should Improve
4. **Rotation property UI integration**: Dialog rotation angle setting → save → rendering reflection
5. **Pattern fill rendering verification**: Verify hatching/grid patterns actually render
6. **Activate disabled UI controls**: Line transparency, shadow direction, etc.

### Could Implement (Lower Priority)
7. **Shape→text box conversion**: Add/remove text in shapes
8. **New drawing attribute registration**: BorderFill new registration WASM API

## Implementation Plan (4 Steps)

### Step 1: Text Box Vertical Writing Rendering
- Add vertical writing branch to `layout_textbox_content()`
- Adapt table cell's `layout_vertical_cell_text()` logic for text boxes
- Parse text_direction bit from TextBox's `list_attr`
- Support both horizontal English (text_direction=1) / upright English (text_direction=2)

### Step 2: Symbol Substitution + Vertical Writing Enhancement
- Define punctuation direction substitution table (per Hancom help)
- Map period→ring dot, comma→reading point, etc.
- Apply to both `layout_vertical_cell_text` and text box vertical writing
- Enhance CJK character detection/rotation detection logic

### Step 3: Rotation/Pattern Fill/Dialog Integration
- Text box rotation angle UI setting → WASM API → save/render
- Implement/verify pattern fill (hatching, etc.) SVG/Canvas rendering
- Activate implementable items among disabled dialog controls

### Step 4: Testing + Regression Verification
- Verify vertical writing sample HWP file SVG export
- All 608+ tests pass
- 122-page p222.hwp regression test
- Update task status

## Expected Modified Files

| File | Content |
|------|---------|
| `src/renderer/layout/shape_layout.rs` | Text box vertical writing branch, rotation handling |
| `src/renderer/layout/table_cell_content.rs` | Extract common symbol substitution logic |
| `src/renderer/layout/text_measurement.rs` | Symbol substitution mapping, vertical writing character detection |
| `src/renderer/svg.rs` | Pattern fill rendering |
| `src/renderer/web_canvas.rs` | Pattern fill rendering |
| `rhwp-studio/src/ui/picture-props-dialog.ts` | Dialog integration |
| `src/wasm_api.rs` | Rotation property API |
