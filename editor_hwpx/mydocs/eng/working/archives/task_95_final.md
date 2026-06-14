# Task 95 Final Report

## Task Name
Master Page Implementation

## Work Period
2026-02-16

## Changes

### 1. MasterPage Model Definition
- Added `MasterPage` struct to `header_footer.rs`
- Reused `HeaderFooterApply` enum (Both/Odd/Even)
- Fields: apply_to, paragraphs, text_width, text_height, text_ref, num_ref, raw_list_header
- Added `master_pages: Vec<MasterPage>` field to `SectionDef` (rendering-only)

### 2. Master Page Parser Implementation
- Wrote new `parse_master_pages_from_raw()` function
- Parsed only **top-level** LIST_HEADERs from `extra_child_records` as master pages
  - Sub-level LIST_HEADERs are shape internal textboxes (distinguished by level filtering)
- Parsed master page info (10 bytes) after LIST_HEADER standard prefix (8 bytes) (HWP spec Table 139)
- Reused `parse_paragraph_list()` for paragraph extraction
- apply_to by order: 1st=Both, 2nd=Odd, 3rd=Even
- `extra_child_records` kept as-is (serialization preservation)

### 3. Pagination Master Page Selection Logic
- Added `MasterPageRef` struct (section_index, master_page_index)
- Added `active_master_page: Option<MasterPageRef>` field to `PageContent`
- Selects appropriate master page for odd/even page from section's master_pages
- Reflects `hide_master_page` flag
- Same Both->Odd/Even priority pattern as header/footer

### 4. Render Tree + Layout
- Added `RenderNodeType::MasterPage`
- Added `active_master_page: Option<&MasterPage>` parameter to `build_render_tree()`
- Inserts MasterPage node after PageBackground, before Header
- Master page shapes (Shape/Picture/Table) rendered relative to full paper (page_area)
- Rendering hierarchy: PageBackground < **MasterPage** < Header < Body < FootnoteArea < Footer

### 5. Page-Based Shape Rendering Outside body-clip
- Shapes with `HorzRelTo::Page` / `VertRelTo::Page` also placed outside body-clip
- Extended condition from checking only `Paper` to `Paper | Page`
- Renders across full paper regardless of editing paper margins

### 6. Debug Output Improvement
- Added detailed master page info output in `main.rs` dump mode (count, apply_to, paragraph count, control list)

## Modified Files (9)

| File | Changes |
|------|---------|
| `src/model/header_footer.rs` | Added MasterPage struct |
| `src/model/document.rs` | Added SectionDef.master_pages field |
| `src/parser/body_text.rs` | parse_master_pages_from_raw() master page parser + level filtering |
| `src/renderer/pagination.rs` | MasterPageRef, PageContent.active_master_page |
| `src/renderer/render_tree.rs` | RenderNodeType::MasterPage |
| `src/renderer/layout.rs` | Master page shape rendering, Page-based body-clip outside placement |
| `src/wasm_api.rs` | Pagination master page selection + build_page_tree integration |
| `src/main.rs` | Master page dump detailed info output |
| `mydocs/orders/20260216.md` | Task status update |

## Verification Results

- Rust tests: 532 passed, 0 failed
- Native build: Succeeded
- WASM build: Succeeded
- Vite build: Succeeded
- SVG export: BookReview.hwp output confirmed normal
- Web Canvas: BookReview.hwp rendering confirmed normal
  - Page 2: Master page pink text box rendered
  - Page 1: Page-based text box rendered full width across paper

## Serialization Preservation

`extra_child_records` was not modified, and master page raw records are preserved as-is for serialization restoration. The `master_pages` field is rendering-only.

## Branch
- Work branch: `local/task95`
- main merge: Complete
