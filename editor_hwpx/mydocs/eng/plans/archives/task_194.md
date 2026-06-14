# Task 194 Execution Plan — Header/Footer Management Features

## Goal

Extend basic header/footer creation/editing from Task 193 to provide management features identical to Hancom's word processor.

## Current Status (Task 193 Complete)

| Feature | Status |
|---------|--------|
| Header/footer creation (Both/Even/Odd) | Complete |
| Editing mode entry/exit | Complete |
| Text input/delete/IME | Complete |
| Paragraph split/merge | Complete |
| Context toolbar switch | Complete |

## Implementation Scope

### 1. Header/Footer Deletion
- **Content deletion**: Backspace/Delete for content only (area preserved) — already works
- **Complete deletion**: Toolbar [Delete] button → remove control entirely
- Rust: `delete_header_footer_native` + WASM: `deleteHeaderFooter`
- Frontend: `page:headerfooter-delete` command + toolbar button

### 2. Previous/Next Header/Footer Navigation
- [Previous]/[Next] buttons to navigate between different headers/footers in editing mode
- Switch within same section: header→footer, footer→header
- Navigate to next section's headers/footers
- Commands: `page:headerfooter-prev`, `page:headerfooter-next`

### 3. Header/Footer Hiding (Current Page Only)
- Hide header/footer from printing on specific pages
- Model: Add `hide_header_pages: Vec<usize>` flag to Section
- Renderer: Skip Header/Footer nodes on pages with hide flag
- UI: [Page-Hide] dialog or simplified command

### 4. Toolbar Enhancement
Expand current [Header | Close] toolbar:
```
[Header(Both)] | [Previous] [Next] | [Close] [Delete]
```

## Priority
- 1st: Deletion + toolbar enhancement (core editing)
- 2nd: Previous/next navigation (convenience)
- 3rd: Hiding (supplementary)
