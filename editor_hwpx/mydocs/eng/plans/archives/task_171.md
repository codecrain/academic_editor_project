# Task 171: Paragraph Shape Advanced — Execution Plan

## Goal

Enhance paragraph shape advanced features:
1. Add Distribute/Split alignment buttons to formatting bar
2. Complete line break mode (Korean word/character, English word/hyphen/character) editing pipeline

## Current Status

| Feature | Model | Parser | JSON | Format Bar | Dialog | Rendering | Status |
|---------|:-----:|:------:|:----:|:----------:|:------:|:---------:|--------|
| Distribute/Split alignment | O | O | O | X (only 4) | O (6) | O | Format bar incomplete |
| Line break mode | attr1 raw | attr1 raw | X | — | X | O | JSON/UI incomplete |
| Line spacing dropdown | O | O | O | O | O | O | Complete |

## Implementation Scope

1. **Format bar**: Distribute/Split button HTML + CSS + events + commands
2. **Rust model**: Add english_break_unit, korean_break_unit fields to ParaShapeMods
3. **JSON integration**: build_para_properties_json output + parse_para_shape_mods parsing
4. **Frontend**: ParaProperties type + extended tab line break UI in dialog

## Modified Target Files

| File | Change Description |
|------|-------------------|
| `rhwp-studio/index.html` | Distribute/Split button HTML |
| `rhwp-studio/src/styles/style-bar.css` | Distribute/Split icon CSS |
| `rhwp-studio/src/ui/toolbar.ts` | Distribute/Split button events |
| `rhwp-studio/src/command/commands/format.ts` | Distribute/Split commands |
| `src/model/style.rs` | break_unit fields for ParaShapeMods |
| `src/document_core/commands/formatting.rs` | break_unit output in JSON |
| `src/document_core/helpers.rs` | break_unit parsing from JSON |
| `rhwp-studio/src/core/types.ts` | break_unit in ParaProperties |
| `rhwp-studio/src/ui/para-shape-dialog.ts` | Extended tab line break UI |

## Verification Methods

```bash
cargo test                                           # 615 pass
docker compose --env-file .env.docker run --rm wasm   # WASM build
cd rhwp-studio && npm run build                       # Frontend build
```
