# Task 195 Implementation Plan — Header/Footer Field Insertion and Template Features

## Step 1: Field Marker Insertion + Rendering Substitution (Rust)

### Marker Character Definitions
- `\u{0015}` (NAK) → Current page number
- `\u{0016}` (SYN) → Total pages
- `\u{0017}` (ETB) → File name

### Rust Implementation
- `header_footer_ops.rs`: Add `insert_field_in_hf_native(section_idx, is_header, apply_to, hf_para_idx, char_offset, field_type: u8)` (field_type: 1=page num, 2=total pages, 3=filename)
- `layout.rs`: Activate `_page_index` → `page_index` in `layout_header_footer_paragraphs`, substitute markers in ComposedParagraph text runs, maintain char_style_id during substitution
- `wasm_api.rs`: `insertFieldInHf` binding

## Step 2: TS Bridge + Toolbar UI

- `wasm-bridge.ts`: `insertFieldInHf` method
- `page.ts`: Field insertion commands
- Toolbar: [Page Number] button in header/footer toolbar
- `pkg/rhwp.d.ts`: Type declarations

## Step 3: Template Integration + Menu

- Template dropdown menu in Menu Bar > Page > Header/Footer
- Tabs: Both / Odd pages / Even pages
- 11 templates (5 layouts x 2 styles + empty)
- Template application: create header/footer → clear text → insert field markers + text → set paragraph alignment → apply bold+line style if needed
