# Task 193 — Step 1 Completion Report: WASM API and Rust Editing Functions

## New File
- **`src/document_core/commands/header_footer_ops.rs`** — Header/footer CRUD and text editing functions

## Implemented Functions
- 9 native functions: get, create, insert text, delete text, split/merge paragraph, para info, cursor rect, hit test
- 9 WASM API bindings for JavaScript
- 5 internal helpers: find_header_footer_control, get_hf_paragraph_mut/ref, reflow_hf_paragraph, find_section_for_page, get_active_hf_apply_to

## Key Design Points
1. Header/Footer stored as paragraph controls: `Control::Header(Box<Header>)` in `section.paragraphs[0].controls`
2. applyTo mapping: 0=Both, 1=Even, 2=Odd
3. Cursor coordinates: Uses `para_index = usize::MAX - hf_para_idx` marker

## Tests
- **664 passed** (existing 657 + new 7)
