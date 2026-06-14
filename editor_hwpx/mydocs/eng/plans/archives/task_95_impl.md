# Task 95 Implementation Plan

## Step 1: Model Definition + Parser Modification

### Model
- `src/model/header_footer.rs`: Add MasterPage struct (apply_to, paragraphs, text_width, text_height, text_ref, num_ref, raw_list_header)
- `src/model/document.rs`: Add `master_pages: Vec<MasterPage>` field to SectionDef

### Parser
- `src/parser/body_text.rs`: Modify `parse_section_def()`
  - Write new `parse_master_pages_from_raw()` function
  - Search extra_child_records for LIST_HEADER (tag 66) in order
  - Parse master page info from LIST_HEADER data (Table 139, 10 bytes)
  - Reuse parse_paragraph_list() for records following LIST_HEADER
  - Assign apply_to by order: Both → Odd → Even
  - Do not modify extra_child_records (preserve serialization)

## Step 2: Pagination

- `src/renderer/pagination.rs`:
  - Add MasterPageRef struct
  - Add active_master_page field to PageContent
  - Collect master_pages per section → odd/even page selection logic
  - Reflect hide_master_page flag

## Step 3: Layout + Renderer

- `src/renderer/render_tree.rs`: Add RenderNodeType::MasterPage
- `src/renderer/layout.rs`: Add sections parameter to build_render_tree(), insert MasterPage node
- `src/renderer/svg.rs`: MasterPage node rendering branch
- `src/renderer/web_canvas.rs`: MasterPage node rendering branch
- `src/wasm_api.rs`: Pass sections when calling build_page_tree

## Step 4: Build and Verification

- docker compose run --rm test → Rust tests pass
- docker compose run --rm wasm → WASM build
- npm run build → Vite build
- Confirm SVG/Canvas rendering of HWP file containing master page
