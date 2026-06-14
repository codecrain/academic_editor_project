# Task 195 Final Report — Header/Footer Field Insertion and Template Features

## Implemented Features

### Step 1: Field Marker Insertion + Rendering Substitution (Rust)
- Marker characters: `\u{0015}`=page number, `\u{0016}`=total pages, `\u{0017}`=file name
- `insert_field_in_hf_native`, `substitute_hf_field_markers` in layout.rs
- LayoutEngine fields: `total_pages`, `file_name`, `page_number` parameter

### Step 2: TS Bridge + Toolbar UI
- Toolbar buttons: [Page Number] [Total Pages] [File Name]
- Header/footer paragraph properties query/apply support

### Step 3: Templates + Menu Integration
- `apply_hf_template_native`: 11 templates (5 layouts x 2 styles + empty)
- 3-level nested submenu: Page menu > Header/Footer > Both/Odd/Even > 11 templates

## Bug Fix: char_count Not Updated (Critical)
- HWP controls occupy 8 UTF-16 code units; char_count was not updated when adding/removing header/footer controls, causing rendering omissions in `compose_lines`
- Fix: `char_count += 8` on create, `char_count -= 8` on delete

## Verification
| Item | Result |
|------|--------|
| Rust tests (668) | All passed (including regression test) |
| TypeScript | No errors |
