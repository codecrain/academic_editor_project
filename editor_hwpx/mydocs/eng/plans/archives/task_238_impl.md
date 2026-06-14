# Task 238 Implementation Plan: Implement Search Functionality

## Phase Structure (4 Phases)

### Phase 1: WASM Search Engine (Rust)

**Goal**: Implement native API for document text search/replacement

- Create new `src/document_core/queries/search_query.rs`
  - `search_text_native(query, from_sec, from_para, from_char, forward, case_sensitive)` — Traverse body paragraphs for search
    - Traverse section → paragraph → text
    - Search inside nested controls such as table cells, text boxes
    - Case-insensitive option (lowercase comparison)
    - Forward: from current position to end of document → from beginning to current position (wrap-around)
    - Backward: from current position to beginning → from end to current position
  - `replace_text_native(sec, para, char_offset, length, new_text, cell_context_json)` — Single replacement
    - Combination of existing `delete_text` + `insert_text`
    - Call recompose_section
  - `replace_all_native(query, new_text, case_sensitive)` — Replace all
    - Traverse entire document, replace all matches
    - Return replacement count
- `src/document_core/queries/mod.rs` — Module registration
- `src/wasm_api.rs` — Expose 4 APIs (searchText, replaceText, replaceAll, getPageOfPosition)
- Verify cargo test passes

### Phase 2: Frontend API Integration and Commands/Shortcuts

**Goal**: WASM API wrapper + command system integration

- `rhwp-studio/src/core/types.ts` — SearchResult, ReplaceResult interfaces
- `rhwp-studio/src/core/wasm-bridge.ts` — searchText, replaceText, replaceAll wrappers
- `rhwp-studio/src/command/shortcut-map.ts` — Add shortcuts
  - Ctrl+F → `edit:find` (existing)
  - Ctrl+F2 → `edit:find-replace` (add)
  - Ctrl+L → `edit:find-again` (add)
  - Alt+G → `edit:goto` (add)
- `rhwp-studio/src/command/commands/edit.ts` — Wire up execute for 4 commands
- `rhwp-studio/index.html` — Update menu items (remove disabled, add Find Again/Go To)

### Phase 3: Find/Find & Replace Dialog

**Goal**: Implement search UI

- New `rhwp-studio/src/ui/find-dialog.ts`
  - ModalDialog-based but with modeless behavior (edit area remains interactive)
  - Modes: Find / Find & Replace (tab or toggle)
  - Search input field, case sensitivity checkbox
  - Find Next / Find Previous buttons
  - Replace input field, Replace / Replace All buttons (replace mode only)
  - Move cursor to search result position + scroll
  - Search term highlighting (displayed as selection area)
  - Find Again (Ctrl+L): search for last term without dialog
- New `rhwp-studio/src/styles/find-dialog.css`
- `rhwp-studio/src/style.css` — Add import

### Phase 4: Go To Dialog and Final Verification

**Goal**: Go To + integration testing

- New `rhwp-studio/src/ui/goto-dialog.ts`
  - Enter page number → scroll to first position of that page
  - Range validation (1 ~ total pages)
- WASM build
- Browser integration testing
  - Find: enter search term → highlight → next/previous
  - Replace: single replace → replace all
  - Find Again: repeat with Ctrl+L
  - Go To: navigate to page number
- Write final report
