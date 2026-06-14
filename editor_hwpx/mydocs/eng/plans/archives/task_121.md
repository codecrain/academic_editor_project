# Task 121 Execution Plan

## Subject
Paragraph Shape Settings Dialog UI Implementation

## Background

The current web editor supports only alignment changes (justify/left/right/center) from the format toolbar. There is no comprehensive attribute setting UI equivalent to HWP's "Paragraph Shape" dialog (Alt+T), making it impossible to adjust detailed paragraph attributes such as margins, indentation, line spacing, tab settings, and borders/backgrounds.

## Current Status

- **ParaShape Model** (`src/model/style.rs:128-167`): All attribute fields exist (alignment, margin, indent, spacing, line_spacing, tab_def_id, border_fill_id, border_spacing, etc.)
- **ParaShapeMods** (`src/model/style.rs:579-604`): Only 8 attributes supported (alignment, line_spacing, line_spacing_type, indent, margin_left/right, spacing_before/after)
- **WASM API** (`src/wasm_api.rs`): `getParaPropertiesAt` returns only 9 fields, `parse_para_shape_mods` parses only 8
- **Web UI** (`rhwp-studio/`): No paragraph shape dialog component, only format toolbar alignment buttons

## Implementation Plan (6 Phases)

### Phase 1: Basic Tab — Dialog Frame + Basic Attributes UI

**Goal**: Implement dialog component frame (4-tab structure) and basic tab (alignment/margins/first line/spacing/preview)

- ParaShapeDialog class creation
- 4-tab system: Basic / Extended / Tab Settings / Border/Background
- Basic tab UI: 6 alignment buttons, left/right margins, first line (normal/indent/outdent), spacing (type + value, paragraph before/after), preview area

### Phase 2: Extended Tab — Paragraph Type/Other Options/Vertical Alignment

ParaShapeMods extension with 11 additional fields, WASM API extension, extended tab UI.

### Phase 3: Tab Settings Tab — TabDef Creation/Reuse

TabDef PartialEq + find_or_create_tab_def(), WASM API extension, tab settings UI.

### Phase 4: Border/Background Tab — BorderFill Reuse

ParaShapeMods border_fill_id + border_spacing addition, WASM API extension, border/background UI.

### Phase 5: Section Definition Parser Bug Fix

Fix default_tab_spacing value error due to missing `horizontal_align` HWPUNIT16 field (2 bytes) in HWP spec table 131.

### Phase 6: Final Build + Completion

## Key Files to Modify

| File | Change Type | Changes |
|------|-----------|---------|
| `src/model/style.rs` | Modify | ParaShapeMods 22-field extension, TabItem/TabDef PartialEq |
| `src/model/document.rs` | Modify | Add find_or_create_tab_def() |
| `src/wasm_api.rs` | Modify | Getter 36+ fields, TabDef/BorderFill creation in apply, helper functions |
| `src/parser/body_text.rs` | Modify | Add horizontal_align field to section definition parser |
| `src/serializer/control.rs` | Modify | Add horizontal_align field to section definition serialization |
| `rhwp-studio/src/core/types.ts` | Modify | ParaProperties 34-field extension |
| `rhwp-studio/src/ui/para-shape-dialog.ts` | New | 4-tab dialog component (~1500 lines) |
| `rhwp-studio/src/ui/format-toolbar.ts` | Modify | Alt+T handler, add paragraph shape button |
| `rhwp-studio/src/style.css` | Modify | Add dialog styles (~100 lines) |

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| ParaShapeMods extension breaks existing formatting | All new fields `Option<T>`, default None → existing JSON unchanged |
| Section definition parser fix breaks existing documents | Verify with round-trip test + actual HWP files |
| Border CSS preview vs actual rendering differences | Approximate CSS border styles to HWP line types |
| TabDef/BorderFill duplicate creation | Use find_or_create pattern for reusing identical items |
