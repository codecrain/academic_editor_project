# Task 17 Execution Plan: Text Selection (B-301) — First Step of WYSIWYG

## Overview

Implement text selection functionality in the Canvas-based HWP viewer. Calculate per-character positions in Rust and export as JSON, then implement hit-test, drag selection, and clipboard copy in JavaScript.

## Implementation Steps

| Step | Content | Changed Files |
|------|---------|--------------|
| Step 1 | Rust — Per-character position calculation API | `src/renderer/layout.rs`, `src/wasm_api.rs` |
| Step 2 | JavaScript — Text layout management and hit-test | `web/text_selection.js` (new) |
| Step 3 | Overlay canvas and selection highlight rendering | `web/index.html`, `web/style.css`, `web/text_selection.js` |
| Step 4 | Mouse event integration and clipboard copy | `web/text_selection.js`, `web/app.js` |

## Verification Methods

- `docker compose run --rm test` — Pass existing 233 tests
- `docker compose run --rm wasm` — WASM build succeeds
- Confirm text drag selection and Ctrl+C copy in browser
