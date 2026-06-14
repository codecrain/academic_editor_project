# Task 226: Page > Section Settings Dialog Implementation

## Goal

Add "Section Settings(E)..." menu item to the Page menu, and implement a dialog to view/modify section settings at the current caret position.

## Execution Plan

### Step 1: WASM API Addition (Rust)
- `get_section_def(section_idx)` → return SectionDef as JSON
- `set_section_def(section_idx, json)` → modify SectionDef and re-paginate

### Step 2: Menu Item + Command Registration (HTML/TypeScript)
- Add "Section Settings(E)..." to Page menu in `index.html`
- Register `page:section-settings` command in `page.ts`

### Step 3: Section Settings Dialog Implementation (TypeScript)
- Create `section-settings-dialog.ts`
- Layout identical to Hancom UI
- Apply changes via WASM API + re-render on confirm
