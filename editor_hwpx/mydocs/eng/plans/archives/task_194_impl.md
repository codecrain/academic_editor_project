# Task 194 Implementation Plan — Header/Footer Management Features

## Step 1: Header/Footer Deletion + Toolbar Enhancement

### Rust
- Add `delete_header_footer_native` to `header_footer_ops.rs`
- Add `deleteHeaderFooter` WASM binding

### TypeScript
- `wasm-bridge.ts`: Add deleteHeaderFooter method
- `page.ts`: Add `page:headerfooter-delete` command (exit editing mode → delete control → refresh canvas)

### HTML/CSS
- Expand `.tb-headerfooter-group` toolbar: `[Header(Both)] | [Previous] [Next] | [Close] [Delete]`
- [Delete] button: `data-cmd="page:headerfooter-delete"`
- [Previous]/[Next]: UI placement in Step 1, functionality connected in Step 2

## Step 2: Previous/Next Header/Footer Navigation

### Rust
- Add `get_header_footer_list_native` to `header_footer_ops.rs` — returns list of all headers/footers across sections

### TypeScript
- `wasm-bridge.ts`: Add getHeaderFooterList method
- `cursor.ts`: Add `switchHeaderFooter(sectionIdx, isHeader, applyTo)`
- `page.ts`: Add prev/next commands — navigate list, update toolbar label

## Step 3: Hide Feature + Test Verification

### Rust
- Add hide flags to Section/PageContent model
- Add `toggle_hide_header_footer_native` to header_footer_ops.rs
- `build_header`/`build_footer` in renderer: check hide flag, generate empty node if flagged

### TypeScript
- `wasm-bridge.ts`: Add toggleHideHeaderFooter
- `page.ts`: Add `page:hide-headerfooter` command

### Final Verification
- Rust tests (deletion, list query, hiding)
- TypeScript compilation
- WASM build
