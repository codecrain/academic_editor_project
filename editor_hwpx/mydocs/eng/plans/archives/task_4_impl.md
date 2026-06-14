# Task 4 — Implementation Plan: Renderer Implementation (Text/Tables/Fonts)

## Design Principles (Reconfirmed)

```
DocInfo → Style list construction → Document structure composition → Layout composition → SVG output
```

## Phase Structure (4 Phases)

### Phase 1: Style List Construction (Style Resolution)

Convert the DocInfo reference table into a resolved style list directly usable for rendering.

- Create `src/renderer/style_resolver.rs` — Style resolution module
  - `ResolvedCharStyle` struct:
    ```
    CharShape[id] + FontFace[lang][font_id] → {
        font_family: String,     // Font name looked up from FontFace
        font_size: f64,          // CharShape.base_size → px conversion
        bold: bool,              // CharShape.bold
        italic: bool,            // CharShape.italic
        text_color: ColorRef,    // CharShape.text_color
        underline: UnderlineType,
        strike_color: ColorRef,
        letter_spacing: f64,     // CharShape.spacings[lang] → px
        ratio: f64,              // CharShape.ratios[lang] → width ratio
    }
    ```
  - `ResolvedParaStyle` struct:
    ```
    ParaShape[id] → {
        alignment: Alignment,
        line_spacing: f64,       // Line spacing (px or ratio)
        line_spacing_type: LineSpacingType,
        margin_left: f64,        // Left margin (px)
        margin_right: f64,       // Right margin (px)
        indent: f64,             // Indent (px)
        spacing_before: f64,     // Paragraph spacing above (px)
        spacing_after: f64,      // Paragraph spacing below (px)
    }
    ```
  - `ResolvedBorderStyle` struct:
    ```
    BorderFill[id] → {
        borders: [BorderLine; 4],  // Left/right/top/bottom borders
        fill_color: Option<ColorRef>,
    }
    ```
  - `ResolvedStyleSet` struct:
    ```
    ResolvedStyleSet {
        char_styles: Vec<ResolvedCharStyle>,     // Corresponds to char_shapes[id]
        para_styles: Vec<ResolvedParaStyle>,      // Corresponds to para_shapes[id]
        border_styles: Vec<ResolvedBorderStyle>,  // Corresponds to border_fills[id]
    }
    ```
  - `resolve_styles(doc_info: &DocInfo, dpi: f64) -> ResolvedStyleSet` function
    - CharShape.font_ids[0] (Korean) → DocInfo.font_faces[0][font_id].name lookup
    - CharShape.base_size → HWPUNIT → px conversion
    - ParaShape margins/spacing → HWPUNIT → px conversion
    - BorderFill → border/background info extraction

**Verification**: DocInfo style resolution unit tests (font name, size, bold, color mapping verification)

### Phase 2: Document Structure Composition (Document Composition)

Split paragraph text into lines, and within each line split into multiple TextRuns based on CharShapeRef boundaries. Identify inline control (table/shape) insertion positions.

- Create `src/renderer/composer.rs` — Document composition module
  - `ComposedTextRun` struct:
    ```
    ComposedTextRun {
        text: String,           // Text fragment within a line
        char_style_id: u32,     // ResolvedStyleSet.char_styles index
    }
    ```
  - `ComposedLine` struct:
    ```
    ComposedLine {
        runs: Vec<ComposedTextRun>,  // Text fragments by style
        line_seg: LineSeg,           // Original LineSeg (height, baseline, etc.)
    }
    ```
  - `ComposedParagraph` struct:
    ```
    ComposedParagraph {
        lines: Vec<ComposedLine>,           // Text by line
        para_style_id: u16,                 // Paragraph style ID
        inline_controls: Vec<InlineControl>, // Inline control positions
    }
    ```
  - `InlineControl` struct:
    ```
    InlineControl {
        line_index: usize,       // Line index where inserted
        control_index: usize,    // Index within Paragraph.controls
        control_type: InlineControlType,  // Table, Shape, etc.
    }
    ```
  - `compose_paragraph(para: &Paragraph, styles: &ResolvedStyleSet) -> ComposedParagraph` function
    - Line range calculation based on LineSeg.text_start:
      - line[i] text range: `text_start[i]..text_start[i+1]` (last line to end)
    - CharShapeRef intersection segment splitting within each line:
      - Create separate TextRun for each segment where CharShapeRef overlaps with line range
    - Inline control position identification:
      - Control character positions in text (0x000B, etc.) → map to line index
  - `compose_section(section: &Section, styles: &ResolvedStyleSet) -> Vec<ComposedParagraph>` function

**Verification**: Paragraph splitting unit tests (line-by-line text extraction, CharShapeRef segment splitting, control position identification)

### Phase 3: Layout Pipeline + Text Rendering

Pass ResolvedStyleSet and ComposedDocument to the layout pipeline so text is rendered with correct styles.

- Modify `src/renderer/layout.rs` — LayoutEngine extension
  - `build_render_tree()` signature change:
    ```rust
    pub fn build_render_tree(
        &self,
        page_content: &PageContent,
        paragraphs: &[Paragraph],
        composed: &[ComposedParagraph],  // added
        styles: &ResolvedStyleSet,        // added
    ) -> PageRenderTree
    ```
  - `layout_paragraph()` modification:
    - Iterate over ComposedParagraph.lines
    - Convert each ComposedLine's runs to TextRun nodes
    - Apply ResolvedCharStyle → TextStyle conversion to TextRunNode.style
    - Place multiple TextRuns' x coordinates sequentially (offset by previous TextRun's width)
  - `resolved_to_text_style(styles: &ResolvedStyleSet, char_style_id: u32) -> TextStyle` function

- Modify `src/renderer/pagination.rs` — Inline control detection
  - During paragraph iteration in `paginate()`, check for inline controls:
    - If `Paragraph.controls` contains `Control::Table`, create `PageItem::Table`
    - Paragraphs with tables split into separate items before/after the table

- Modify `src/wasm_api.rs` — Pipeline integration
  - Add `styles: ResolvedStyleSet` field to `HwpDocument`
  - Call `resolve_styles()` in `from_bytes()` / `paginate()`
  - Pass composed data and styles in `build_page_tree()`

- Modify `src/renderer/mod.rs` — Register new modules
  - `pub mod style_resolver;`
  - `pub mod composer;`

**Verification**: Verify text font name/size/bold reflected in SVG output from actual HWP file

### Phase 4: Table Rendering + Integration Verification

Convert tables to cell layouts and render them in SVG. Perform full pipeline integration tests and verification with actual HWP files.

- Modify `src/renderer/layout.rs` — Table layout implementation
  - Add `layout_table()` method:
    ```rust
    fn layout_table(
        &self,
        tree: &mut PageRenderTree,
        col_node: &mut RenderNode,
        table: &Table,
        col_area: &LayoutRect,
        y_start: f64,
        styles: &ResolvedStyleSet,
    ) -> f64
    ```
    - Iterate Table.cells → calculate cell positions/sizes
    - Cell x coordinate: sum of previous column widths
    - Cell y coordinate: y_start + sum of previous row heights
    - Cell width: Cell.width (HWPUNIT → px)
    - Cell height: Table.row_sizes[row] (HWPUNIT → px)
    - Recursive layout of paragraphs within cells (compose + layout)
    - Create TableNode, TableCellNode render nodes

- Modify `src/renderer/svg.rs` — Table SVG rendering
  - Add `RenderNodeType::Table` handling to `render_node()`:
    - Wrap entire table in `<g>` group
  - Add `RenderNodeType::TableCell` handling to `render_node()`:
    - Cell background: `<rect>` (if fill exists)
    - Cell border: `<rect>` (stroke)
    - Cell text: recursively render child nodes (TextLine/TextRun)

- Modify `src/renderer/svg.rs` — Text decoration
  - Add underline/strikethrough to `draw_text()`:
    - `text-decoration="underline"` or separate `<line>` element

- Integration verification:
  - Maintain existing 177 tests
  - Verify SVG output from actual HWP file:
    - Title text displayed
    - Table borders + cell text displayed
    - Body text font/size/bold reflected
  - `cargo build` + `cargo test` pass

**Verification**: Achieve SVG output at a level comparable to original screenshot

## Expected Files to Create/Modify

| File | Phase | Description |
|------|-------|-------------|
| `src/renderer/style_resolver.rs` | 1 | Style resolution module (new) |
| `src/renderer/composer.rs` | 2 | Document composition module (new) |
| `src/renderer/mod.rs` | 3 | Register new modules |
| `src/renderer/layout.rs` | 3, 4 | Layout engine extension |
| `src/renderer/pagination.rs` | 3 | Inline control detection |
| `src/renderer/svg.rs` | 4 | Table rendering + text decoration |
| `src/wasm_api.rs` | 3 | Pipeline integration |

## Data Flow Summary

```
DocInfo
  │
  ├─ resolve_styles() ──→ ResolvedStyleSet ─────────────────────┐
  ���                                                              │
Section.paragraphs                                               │
  │                                                              │
  ���─ compose_section() ──→ Vec<ComposedParagraph> ──┐            │
  │                                                  │            │
  │   paginate() ──→ PaginationResult ──┐            │            ��
  │                                      │            │            │
  └─ LayoutEngine.build_render_tree(     │            │            │
         page_content,                   ◄─┘          │            │
         paragraphs,                                  │            │
         composed,                       ◄────────────┘            │
         styles,                         ◄─────────────────────────┘
     ) ──→ PageRenderTree
                │
                └─ SvgRenderer.render_tree() ──→ SVG String
```

## Status

- Written: 2026-02-05
- Status: Approved
