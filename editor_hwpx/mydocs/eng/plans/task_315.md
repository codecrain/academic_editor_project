# Task 315 Plan: Multi-Column Configuration Feature (v2)

## 1. Architecture Understanding

### Typesetting Flow
```
SectionDef (paper/margins) → ColumnDef (column division) → PageLayoutInfo (per-column areas) → Pagination (layout)
```

### ColumnDef Location and Role
- Stored as **paragraph control** (`Control::ColumnDef`)
- Initial ColumnDef (column definition) exists in the first paragraph of a section — alongside SectionDef
- Multiple ColumnDefs possible within a section (column split breaks)
- `find_initial_column_def()`: Extracts initial ColumnDef for a section
- `find_column_def_for_paragraph()`: Finds ColumnDef applicable to a specific paragraph

### Relationship with SectionDef
- SectionDef: Paper size, margins → determines **body_area**
- ColumnDef: Divides body_area into **per-column areas**
- Two controls are independent — modifying only ColumnDef changes columns
- SectionDef modification API (setSectionDef) is already implemented

## 2. Implementation Plan

### 2.1 Step 1: Rust API — setColumnDef
- **Find and modify the existing ColumnDef** in the current section (using find_initial_column_def)
- Insert in first paragraph if none exists
- After modification: recompose_section + paginate + invalidate_page_tree_cache
- Parameters: section_idx, column_count, column_type, same_width, spacing

### 2.2 Step 2: WASM Binding + Frontend
- Expose setColumnDef in wasm_api.rs
- Add method to wasm-bridge.ts
- Replace stubs (col-1/2/3/left/right) in page.ts with actual implementation
- Remove disabled state from index.html menu

### 2.3 Step 3: Testing
- Switch between 1-column → 2-column → 3-column → 1-column
- Ctrl+Shift+Enter (column break) in multi-column state
- cargo test 716 tests passing

## 3. Impact Scope
- `src/document_core/commands/text_editing.rs` — setColumnDef API
- `src/wasm_api.rs` — WASM binding
- `rhwp-studio/src/command/commands/page.ts` — Preset commands
- `rhwp-studio/src/core/wasm-bridge.ts` — WASM bridge
- `rhwp-studio/index.html` — Menu activation
