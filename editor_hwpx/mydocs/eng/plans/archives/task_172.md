# Task 172: Paragraph Numbering/Bullets — Execution Plan

## Goal

Implement paragraph numbering and bullet editing features. Currently model/parser/rendering are complete, but editing UI and WASM API are missing so users cannot add/change numbering or bullets.

## Current Status

| Feature | Model | Parser | Rendering | JSON | WASM API | UI |
|---------|:-----:|:------:|:---------:|:----:|:--------:|:--:|
| Numbering (7 levels) | O | O | O | headType/paraLevel only | X | headType radio only |
| Bullet | O | O | O | headType only | X | headType radio only |
| Level increase/decrease | O | — | O | — | — | Command only (no button) |
| numbering_id | O | O | O | X (not in JSON) | X | X |

## Implementation Scope

1. **WASM API**: numberingId JSON integration + list query + default definition creation API
2. **Toolbar UI**: Numbering/bullet toggle buttons + level increase/decrease buttons
3. **Bullet popup**: 18-type bullet character selection grid
4. **Numbering dialog**: Hancom-compatible number format presets + start number + preview

## Modified Target Files

| File | Change Description |
|------|-------------------|
| `src/document_core/commands/formatting.rs` | Add numberingId to JSON output |
| `src/document_core/helpers.rs` | Parse numberingId from JSON |
| `src/wasm_api.rs` | getNumberingList, getBulletList, ensureDefault* API |
| `rhwp-studio/src/core/wasm-bridge.ts` | WASM API wrappers |
| `rhwp-studio/src/core/types.ts` | numberingId in ParaProperties |
| `rhwp-studio/index.html` | Toolbar button HTML |
| `rhwp-studio/src/styles/icon-toolbar.css` | Numbering/bullet/level icons |
| `rhwp-studio/src/engine/input-handler.ts` | toggleNumbering, toggleBullet |
| `rhwp-studio/src/command/commands/format.ts` | Command activation/registration |
| `rhwp-studio/src/ui/toolbar.ts` | Button event binding |
| `rhwp-studio/src/ui/bullet-popup.ts` | Bullet selection popup (new) |
| `rhwp-studio/src/ui/numbering-dialog.ts` | Numbering format dialog (new) |
