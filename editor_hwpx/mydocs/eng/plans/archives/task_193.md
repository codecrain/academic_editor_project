# Task 193 — Header/Footer Creation and Basic Editing

## Goal

Implement header/footer editing experience identical to Hancom's word processor in the web editor. Enable public sector users to create headers/footers, enter/edit text, and insert page number fields.

## Current Status Analysis

### Already Implemented
- **Model**: Header, Footer, HeaderFooterApply (both/odd/even), MasterPage structs complete
- **Parser/serializer**: HWP file header/footer read/write fully operational
- **Pagination**: HeaderFooterRef determines active header/footer per page
- **Renderer**: build_header/build_footer generate Header/Footer nodes in render tree
- **Margin settings**: PageSetupDialog can edit marginHeader/marginFooter

### Not Implemented (This Task Scope)
- **WASM API**: Header/footer create/query/modify APIs
- **Editing mode**: Header/footer area enter/exit UX
- **Cursor system**: Cursor movement/text input within header/footer areas
- **UI**: Menu commands, editing mode visual display (body dimming, area labels)

## Implementation Scope

### Included
1. Header/footer creation (both/odd/even selection)
2. Editing mode entry (menu or double-click) / exit (Shift+Esc or close button)
3. Visual editing mode display: body dimming, `<<Header(Both)>>` label
4. Text input/delete (reuse existing text editing engine)
5. Page number field insertion
6. Character/paragraph formatting application

### Excluded (Task 194)
- Header/footer deletion
- Hide on specific pages
- Header/footer templates
- Previous/next header/footer navigation

## Technical Design

### Editing Mode State Management
- Add `headerFooterMode: 'none' | 'header' | 'footer'` to CursorState
- Add `headerFooterParaIndex`, `headerFooterApplyTo` fields to DocumentPosition
- On mode entry, move cursor to first paragraph of that area
- Apply existing text input/delete logic to header/footer paragraphs

### WASM API Additions
- getHeaderFooter, createHeaderFooter, insertTextInHeaderFooter, deleteTextInHeaderFooter, getCursorRectInHeaderFooter

### Context Toolbar Switch (Hancom Style)
- Reuse existing `.tb-rotate-group` show/hide pattern
- On header/footer editing mode entry: hide default toolbar groups, show `.tb-headerfooter-group`
- Buttons: [Header/Footer] [Previous] [Next] [Insert Code] [Close]

### Rendering Changes
- Semi-transparent overlay on body area in editing mode (CSS overlay)
- Dashed border + `<<Header(Both)>>` label on header/footer area
- Only the editing area renders at normal brightness
