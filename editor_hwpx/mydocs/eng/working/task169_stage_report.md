# Task 169 Stage Completion Report: CharShape Style Bar Enhancement

## Stage 1: Rust-side emboss/engrave + font_ids Improvements

### Changed Files

| File | Changes |
|------|---------|
| `src/model/style.rs` | Added `emboss`, `engrave`, `font_ids` fields to CharShapeMods + `apply_to()` logic |
| `src/document_core/helpers.rs` | Added emboss/engrave/fontIds parsing to `parse_char_shape_mods` + `json_u16_array()` helper |
| `src/document_core/commands/formatting.rs` | Added emboss/engrave keys to `build_char_properties_json` + `find_or_create_font_id_for_lang()` |
| `src/wasm_api.rs` | `findOrCreateFontIdForLang` WASM API |

### Key Implementation Details

- **emboss/engrave mutual exclusion**: Activating emboss auto-deactivates engrave, and vice versa
- **font_ids[7]**: Individual font IDs for 7 language categories (Korean/Latin/Hanja/Japanese/Other/Symbol/User)
- **find_or_create_font_id_for_lang**: Searches/registers fonts in font_faces for a specific language category

### Verification

- `cargo test`: 613 passed

---

## Stage 2: 5 Style Bar Buttons Added (HTML + CSS + JS)

### Changed Files

| File | Changes |
|------|---------|
| `rhwp-studio/index.html` | 5 button HTML for emboss/engrave/outline/superscript/subscript |
| `rhwp-studio/src/styles/style-bar.css` | 5 button icon CSS (.sb-emboss, .sb-engrave, .sb-outline, .sb-sup, .sb-sub) |
| `rhwp-studio/src/core/types.ts` | Added `emboss`, `engrave`, `fontIds` fields to CharProperties |
| `rhwp-studio/src/command/commands/format.ts` | Registered 5 commands (format:emboss/engrave/outline/superscript/subscript) |
| `rhwp-studio/src/engine/input-handler.ts` | Extended `toggleFormat` type + `applyToggleFormat` mutual exclusion logic |
| `rhwp-studio/src/ui/toolbar.ts` | 5 button references/events + `updateState` active toggle |

### Key Implementation Details

- **Mutual exclusion toggle**: emboss<->engrave, superscript<->subscript
- **outline toggle**: outlineType 0<->1 switching
- **Auto-reflect on cursor move**: All 5 properties toggle active class

### Verification

- Studio build: Succeeded

---

## Stage 3: Per-Language Font Selection

### Changed Files

| File | Changes |
|------|---------|
| `rhwp-studio/index.html` | Font language category combo (All/Korean/Latin) |
| `rhwp-studio/src/styles/style-bar.css` | `.sb-font-lang` style |
| `rhwp-studio/src/core/wasm-bridge.ts` | `findOrCreateFontIdForLang` wrapper |
| `rhwp-studio/src/ui/toolbar.ts` | Per-language font change logic + display selected language font name on cursor move |

### Key Implementation Details

- **"All" mode**: Applies `fontId` as single value to all languages as before
- **"Korean"(0) / "Latin"(1) mode**: Replaces only the corresponding index in `fontIds[7]` array
- **On cursor move**: Displays font name of selected language category in dropdown
- **On language combo change**: Immediately displays corresponding language font name from last fontFamilies array

### Verification

- WASM build: Succeeded
- Studio build: Succeeded
- `cargo test`: 613 passed

---

*Written: 2026-02-27*
