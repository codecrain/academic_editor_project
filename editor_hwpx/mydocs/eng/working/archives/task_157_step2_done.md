# Task 157 — Step 2 Completion Report

## Step Goal

Shape (text box) selection/move/resize UI — extend existing Picture selection pattern to provide identical selection/move/resize UX for text boxes.

## Implementation Strategy

Extended existing picture selection system (`input-handler-picture.ts`) into a **unified object selection system**. Added `type: 'image' | 'shape'` field to `selectedPictureRef` so one set of code handles both pictures and text boxes.

## Changed Files (10)

| File | Changes |
|------|---------|
| `rhwp-studio/src/core/types.ts` | Added `'shape'` to `ControlLayoutItem.type`, new `ObjectRef` interface, new `ShapeProperties` interface |
| `rhwp-studio/src/core/wasm-bridge.ts` | 4 methods: `createShapeControl`, `getShapeProperties`, `setShapeProperties`, `deleteShapeControl` |
| `rhwp-studio/src/engine/cursor.ts` | Added `type` field to `selectedPictureRef`, type parameter to `enterPictureObjectSelectionDirect` |
| `rhwp-studio/src/engine/input-handler-picture.ts` | Type-aware `findPictureAtClick`/`findPictureBbox`, unified `getObjectProperties`/`setObjectProperties`/`deleteObjectControl` helpers (image/shape branching) |
| `rhwp-studio/src/engine/input-handler.ts` | `type` field in state type, 3 wrapper methods added |
| `rhwp-studio/src/engine/input-handler-mouse.ts` | Unified helpers for resize/move drag |
| `rhwp-studio/src/engine/input-handler-keyboard.ts` | `deleteObjectControl(ref)` for Delete/Backspace |
| `rhwp-studio/src/engine/input-handler-table.ts` | `getObjectProperties`/`setObjectProperties` in `moveSelectedPicture`, `MoveShapeCommand` branch |
| `rhwp-studio/src/engine/command.ts` | `MoveShapeCommand` class added (Undo/Redo) |
| `rhwp-studio/src/command/commands/insert.ts` | shape/image branch in `insert:picture-delete` |

## Supported Text Box Operations

| Operation | Behavior |
|-----------|----------|
| Click | Select with 8-direction handles |
| Handle drag | Resize (corners: maintain ratio) |
| Body drag | Move (when treatAsChar=false) |
| Arrow keys | Grid-unit movement |
| Delete/Backspace | Delete |
| Escape | Deselect |
| Undo/Redo | Move undo/redo |

## Verification

- **Rust tests**: 608 passed, 0 failed
- **WASM build**: Success
- **TypeScript type check**: No new errors
