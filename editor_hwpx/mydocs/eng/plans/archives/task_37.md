# Task 37: Clipboard Copy and Paste Feature - Execution Plan

## Goals
1. HWP → our editor: paste control objects via HTML format
2. Our editor → HWP: copy as HTML format
3. Internal clipboard: HWP binary-based perfect copy/paste

## Strategy
- Copy: extract selection → HWP binary + HTML + plain text
- Paste: internal HWP binary > HTML > plain text priority
- Internal: WASM memory buffer for HWP binary round-trip

## Scope
Included: text/table/image copy-paste with formatting, HWP↔editor HTML exchange, internal clipboard
Excluded: equations/charts, other office programs, drag-and-drop
