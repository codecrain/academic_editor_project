# Task 189 Implementation Plan: Image Control Properties UI Enhancement

## Step 1: Rust API Extension (get/set_picture_properties)

Extend with +19 fields (total 32): rotation/flip, crop, padding, outer margins, border properties.

## Step 2: "Picture" Tab UI Implementation (buildPicturePanel)

Sections: Filename (read-only), Scale (percentage + preset buttons), Crop (4-direction mm), Picture margins (4-direction mm), Picture effects (4 radio buttons: none/grayscale/black-white/from-original + brightness/contrast sliders + watermark checkbox), Transparency (disabled stub).

## Step 3: Basic Tab Activation + Margin/Caption Tab Binding + Line Tab Binding

- Basic tab: Activate rotation angle, horizontal/vertical flip
- Margin/Caption: Bind outer margin 4-direction values
- Line: Bind border color/width

## Step 4: handleOk/populateFromProps Extension + Additional Tabs + Build

- Collect all changed properties from Picture tab, basic tab, margin tab
- Add stub tabs: Reflection, Glow, Soft Edge (matching Hancom screenshots)
- Extend PictureProperties type (+19 fields)
- Build and verification: cargo build + test, Docker WASM, visual UI verification

## Key Files

| File | Change Description |
|------|-------------------|
| `src/document_core/commands/object_ops.rs` | Extend get/set_picture_properties (+19 fields) |
| `rhwp-studio/src/ui/picture-props-dialog.ts` | buildPicturePanel, reflection/glow/soft-edge stubs, handleOk/populateFromProps extension |
| `rhwp-studio/src/core/types.ts` | PictureProperties interface extension |
| `rhwp-studio/src/styles/picture-props.css` | Picture tab style additions |

## Unit Conversions

| Conversion | Formula |
|------------|---------|
| HWPUNIT → mm | hwp / 283.46 |
| mm → HWPUNIT | mm x 283.46 |
| rotation raw → degree | raw / 100 |
| degree → rotation raw | degree x 100 |
