# Task 2 - Implementation Plan: Viewer Rendering Engine Design

## Phase Structure (5 Phases)

### Phase 1: Rendering Backend Selection and Architecture Design Document

- Compare and verify 3 approaches (ThorVG, Pure Rust, Canvas API)
- Final backend selection and rationale documentation
- Overall rendering pipeline architecture design
- Write design document: `mydocs/tech/rendering_engine_design.md`

### Phase 2: Intermediate Representation (IR) Data Model Design and Implementation

- Design Rust structs for intermediate representation of HWP documents
- Create `src/model/` module
  - `document.rs` - Overall document structure (Document, Section, SectionDef)
  - `paragraph.rs` - Paragraphs (Paragraph, CharShape, ParaShape, CharRun)
  - `table.rs` - Tables (Table, Cell, Row)
  - `shape.rs` - Drawing objects (Shape, Line, Rect, Ellipse, Arc, Polygon, Curve, Group, TextBox)
  - `image.rs` - Image objects (Picture, ImageData, CropInfo)
  - `style.rs` - Style information (Font, Color, Border, Fill, Gradient)
  - `page.rs` - Page layout (PageDef, Margin, PageBorderFill, Column)
  - `header_footer.rs` - Headers/Footers (Header, Footer)
  - `footnote.rs` - Footnotes/Endnotes (Footnote, Endnote)
  - `control.rs` - Inline controls (Ruby, Caption, Hyperlink, Field, Bookmark)
  - `bin_data.rs` - Binary data (BinData, image/OLE references)

### Phase 3: Render Tree Design and Implementation

- Design IR → render tree transformation structure
- Create `src/renderer/` module
  - `render_tree.rs` - Render tree nodes (RenderNode, Box Model)
  - `layout.rs` - Layout calculation (page splitting, text placement, table layout)
  - `mod.rs` - Renderer trait definitions

### Phase 4: WASM <-> JavaScript Interface Design

- Define WASM public API in `src/lib.rs`
  - `load_document(bytes)` - Load HWP file
  - `get_page_count()` - Query page count
  - `render_page(page_num)` - Render page
- Define rendering output format (render commands or pixel data)
- TypeScript type definition design

### Phase 5: Build Verification and Design Document Finalization

- Verify entire module structure compilation (Docker environment)
- Write and run unit tests
- Final review and enhancement of design documents

## Status

- Date written: 2026-02-05
- Status: Approved
