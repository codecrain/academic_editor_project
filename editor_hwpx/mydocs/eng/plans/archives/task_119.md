# Task 119 Execution Plan

## Subject
Character Shape Properties Dialog Implementation and Attribute Application

## Background

The current web editor supports only basic formatting from the format toolbar (bold, italic, underline, strikethrough, text color, shade color, font, size). There is no comprehensive attribute setting UI equivalent to HWP's "Character Shape" dialog (Alt+L), making it impossible to adjust detailed character attributes such as character width ratio, letter spacing, relative size, character offset, outline, shadow, and subscript/superscript.

## Current Status

- **CharShape Model** (`src/model/style.rs`): All attribute fields already exist (except shadow_offset_x/y)
- **CharShapeMods** (`src/model/style.rs:472-507`): Only 8 attributes supported (bold, italic, underline, strikethrough, font_id, base_size, text_color, shade_color)
- **WASM API** (`src/wasm_api.rs`): `getCharPropertiesAt` returns only 8 fields, `parse_char_shape_mods` also parses only 8
- **Web UI** (`web/`): No modal dialog component, only format toolbar exists

## Implementation Plan (4 Phases)

### Phase 1: Rust Backend Extension — CharShapeMods + WASM API

**Goal**: Enable reading and writing all CharShape attributes across the JS↔WASM boundary

#### 1-1. Add shadow offset to CharShape model
**File**: `src/model/style.rs` (after line 48)
```rust
pub shadow_offset_x: i8,  // Shadow X direction (-100~100%)
pub shadow_offset_y: i8,  // Shadow Y direction (-100~100%)
```

#### 1-2. Extend CharShapeMods
**File**: `src/model/style.rs` (lines 472-507)

Existing 8 + 14 new fields added including underline_type, underline_color, outline_type, shadow_type, shadow_color, shadow_offset_x/y, strike_color, subscript, superscript, ratios, spacings, relative_sizes, char_offsets.

#### 1-3~1-6. Parser, serializer, JSON build/parse extensions

### Phase 2: Dialog UI Component — HTML/CSS/JS

**Goal**: Create character shape dialog component with 2 tabs (Basic/Extended)

**Tab 1 — Basic**: Base size, per-language settings (font, relative size, letter spacing, character width ratio, character offset), attribute toggles (B, I, U, S, outline, superscript, subscript), text color, shade color.

**Tab 2 — Extended**: Shadow (type, color, X/Y), underline (position, color), strikethrough (checkbox, color), outline (type select).

### Phase 3: Editor Integration — Keyboard, Selection, Application

Alt+L shortcut, openCharShapeDialog() function, format toolbar "Aa" button.

### Phase 4: Testing + WASM Build + Completion

## Key Files to Modify

| File | Change Type | Changes |
|------|-----------|---------|
| `src/model/style.rs` | Modify | Add shadow_offset to CharShape, extend CharShapeMods with 14 fields |
| `src/parser/doc_info.rs` | Modify | Preserve shadow_offset |
| `src/serializer/doc_info.rs` | Modify | Serialize shadow_offset |
| `src/wasm_api.rs` | Modify | Extend build_char_properties_json + parse_char_shape_mods |
| `web/char_shape_dialog.js` | New | Dialog component (~400-500 lines) |
| `web/editor.css` | Modify | Add dialog styles (~150 lines) |
| `web/editor.html` | Modify | Add Aa button to format toolbar |
| `web/editor.js` | Modify | Alt+L handler, openCharShapeDialog(), import |
| `web/format_toolbar.js` | Modify | Aa button event + callback |

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| CharShapeMods extension breaks existing formatting | All new fields `Option<T>`, default None → existing JSON unchanged |
| Extended JSON breaks existing consumers | Only new field additions, no existing field changes |
| Dialog CSS conflicts with existing UI | `.dialog-` prefix namespace for isolation |
| Per-language individual font change complexity | First version implements "representative" mode (apply all) only, individual changes as follow-up |
