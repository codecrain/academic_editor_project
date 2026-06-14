# Task 242 Implementation Plan: Basic Shape Insertion (Line/Rectangle/Ellipse)

## Phase-by-Phase Implementation Plan

### Phase 1: Rust Shape Creation API Extension

- `src/document_core/commands/object_ops.rs` — Modify `create_shape_control_native()`
  - Add `shape_type` parameter: `"rectangle"`, `"ellipse"`, `"line"`
  - Rectangle: Keep existing code
  - Ellipse: Copy Rectangle structure + use `ShapeObject::Ellipse`
  - Line: `ShapeObject::Line` + calculate start_x/y, end_x/y coordinates (top-left to bottom-right diagonal)
  - Line is created without TextBox (no internal text needed)
- `src/wasm_api.rs` — Add `shapeType` field to `createShapeControl` JSON parameter
- Verify `cargo test` passes

### Phase 2: TypeScript Shape Selection Dropdown UI

- New `rhwp-studio/src/ui/shape-picker.ts`
  - Show dropdown panel when toolbar "Shape" button is clicked
  - 3 icon buttons: Line (─), Rectangle (□), Ellipse (○)
  - Click enters placement mode for corresponding shape type
- New `rhwp-studio/src/styles/shape-picker.css`
- `rhwp-studio/index.html` — Connect dropdown to shape button

### Phase 3: Placement Mode Extension and Command Connection

- `input-handler.ts` — Add `enterShapePlacementMode(shapeType)`
  - Reuse existing `enterTextboxPlacementMode` pattern
  - In `finishShapePlacement`, call `createShapeControl({ shapeType, ... })`
  - Line type: Display overlay as straight line (dashed line)
- `insert.ts` — Activate `insert:shape` command
  - `canExecute: (ctx) => ctx.hasDocument`
  - `execute`: show shape-picker
- WASM rebuild + operation testing
