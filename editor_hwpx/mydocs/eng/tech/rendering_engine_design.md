# RHWP Rendering Engine Architecture Design

## 1. Final Rendering Backend Selection

### Comparative Evaluation

| Criterion | ThorVG (Option A) | Pure Rust (Option B) | Canvas API (Option C) |
|----------|----------------|-------------------|-------------------|
| Build complexity | High (C++ + Rust mixed) | **Low** (pure Cargo) | Low (pure Cargo) |
| WASM build | Requires emscripten | **Direct wasm-pack** | Direct wasm-pack |
| Vector primitives | Rich | Sufficient | Browser-dependent |
| Text rendering | Built-in support | Separate crate | **Browser native** |
| Native build | Possible | **Possible** | Not possible (web only) |
| Maintainability | Medium (FFI management) | **High** (pure Rust) | Medium (web-sys dependency) |
| WASM size | ~150KB + Rust | Rust only | **Minimal** |

### Final Decision: Multi-Backend Architecture

A **Renderer Trait (rendering abstraction layer)** is introduced so that users can select the rendering backend as an option.

#### Supported Backends (selectable)

| Backend | Output Format | Use Case | Implementation Priority |
|---------|----------|------|-------------|
| **Canvas** | Canvas 2D API direct drawing | Real-time viewer, interaction | 1st |
| **SVG** | SVG element generation | Vector output, zoom-friendly, printing | 2nd |
| **HTML** | DOM element generation | Text selection/copy, accessibility, SEO | 3rd |
| **Vector (tiny-skia)** | Pixel buffer rasterization | Native/server-side rendering | Future |
| **ThorVG** | Vector engine rendering | When advanced vector features are needed | Future |

#### Design Principles

1. A single **Renderer Trait** abstracts all backends
2. Parsing -> IR -> Layout is backend-agnostic
3. Backend branching occurs only at the final rendering stage
4. Users select the backend option at initialization

## 2. Overall Architecture

```
┌─────────────────────────────────────────────────┐
│                    HWP File                       │
└────────────────────┬────────────────────────────┘
                     │
            ┌────────▼────────┐
            │   CFB Parser     │  cfb crate
            │   (OLE Container)│
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │  Record Parser   │  src/parser/
            │  (TagID-based)   │
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │  Intermediate    │  src/model/
            │  Representation  │
            │  (IR) Document   │
            │  Model           │
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │  Paginator       │  src/renderer/pagination.rs
            │  (Page splitting)│
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │  LayoutEngine    │  src/renderer/layout.rs
            │  (Render tree    │
            │   generation)    │
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │ RenderScheduler  │  src/renderer/scheduler.rs
            │ (Observer+Worker)│
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │  Renderer Trait  │  src/renderer/mod.rs
            │  (Abstraction    │
            │   layer)         │
            └─┬────┬────┬──┬──┘
              │    │    │  │
      ┌───────▼┐ ┌▼───┐│ ┌▼────────┐
      │Canvas  │ │SVG ││ │HTML     │
      │Renderer│ │Rndr││ │Renderer │
      │(1st)   │ │(2nd)│ │(3rd)    │
      └────────┘ └────┘│ └─────────┘
                  ┌─────▼────┐
                  │ Vector   │  (Future)
                  │ tiny-skia│
                  │ ThorVG   │
                  └──────────┘
```

## 3. Module Structure

```
src/
├── lib.rs              # WASM entry point, module registration
├── main.rs             # Native CLI (export-svg, info)
├── wasm_api.rs         # WASM <-> JavaScript public API
│                         HwpDocument, HwpViewer, HwpError
├── parser/
│   ├── mod.rs          # Parser module
│   └── header.rs       # File header parsing, signature verification
├── model/              # Intermediate Representation (IR) - 12 files
│   ├── mod.rs          # HwpUnit, ColorRef, Point, Rect, Padding
│   ├── document.rs     # Document, Section, SectionDef, FileHeader, DocInfo
│   ├── paragraph.rs    # Paragraph, LineSeg, CharShapeRef, RangeTag
│   ├── table.rs        # Table, Cell, TableZone
│   ├── shape.rs        # ShapeObject (7 types), CommonObjAttr, TextBox, Caption
│   ├── image.rs        # Picture, CropInfo, ImageAttr, ImageData
│   ├── style.rs        # CharShape, ParaShape, Style, Font, BorderFill, Fill
│   ├── page.rs         # PageDef, PageBorderFill, ColumnDef, PageAreas
│   ├── header_footer.rs # Header, Footer
│   ├── footnote.rs     # Footnote, Endnote, FootnoteShape
│   ├── control.rs      # Control (18 types), Field, Bookmark, Hyperlink, Ruby
│   └── bin_data.rs     # BinData, BinDataContent
└── renderer/           # Rendering engine - 8 files
    ├── mod.rs          # Renderer Trait (8 methods), TextStyle, ShapeStyle,
    │                     LineStyle, PathCommand, RenderBackend, unit conversion
    ├── render_tree.rs  # RenderNode (dirty flag), RenderNodeType (18 types),
    │                     BoundingBox, PageRenderTree
    ├── page_layout.rs  # PageLayoutInfo, LayoutRect, multi-column area calculation
    ├── pagination.rs   # Paginator, PaginationResult, PageContent, PageItem
    ├── layout.rs       # LayoutEngine (IR -> render tree conversion)
    ├── scheduler.rs    # RenderScheduler, RenderObserver, RenderWorker,
    │                     RenderTask, Viewport, RenderPriority (3 levels)
    ├── canvas.rs       # CanvasRenderer (Canvas 2D, 1st)
    ├── svg.rs          # SvgRenderer (SVG string, 2nd)
    └── html.rs         # HtmlRenderer (HTML DOM, 3rd)
```

## 4. Core Interfaces

### Renderer Trait

```rust
pub trait Renderer {
    fn begin_page(&mut self, width: f64, height: f64);
    fn end_page(&mut self);
    fn draw_text(&mut self, text: &str, x: f64, y: f64, style: &TextStyle);
    fn draw_rect(&mut self, x: f64, y: f64, w: f64, h: f64, style: &ShapeStyle);
    fn draw_line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, style: &LineStyle);
    fn draw_ellipse(&mut self, cx: f64, cy: f64, rx: f64, ry: f64, style: &ShapeStyle);
    fn draw_image(&mut self, data: &[u8], x: f64, y: f64, w: f64, h: f64);
    fn draw_path(&mut self, commands: &[PathCommand], style: &ShapeStyle);
}
```

### WASM Public API

```rust
#[wasm_bindgen]
pub struct HwpDocument { ... }

#[wasm_bindgen]
impl HwpDocument {
    pub fn new(data: &[u8]) -> Result<HwpDocument, JsValue>;
    pub fn create_empty() -> HwpDocument;
    pub fn page_count(&self) -> u32;
    pub fn render_page_svg(&self, page_num: u32) -> Result<String, JsValue>;
    pub fn render_page_html(&self, page_num: u32) -> Result<String, JsValue>;
    pub fn render_page_canvas(&self, page_num: u32) -> Result<u32, JsValue>;
    pub fn get_page_info(&self, page_num: u32) -> Result<String, JsValue>;
    pub fn get_document_info(&self) -> String;
    pub fn set_dpi(&mut self, dpi: f64);
    pub fn set_fallback_font(&mut self, path: &str);
}

#[wasm_bindgen]
pub struct HwpViewer { ... }

#[wasm_bindgen]
impl HwpViewer {
    pub fn new(document: HwpDocument) -> Self;
    pub fn update_viewport(&mut self, scroll_x: f64, scroll_y: f64, width: f64, height: f64);
    pub fn set_zoom(&mut self, zoom: f64);
    pub fn visible_pages(&self) -> Vec<u32>;
    pub fn pending_task_count(&self) -> u32;
    pub fn render_page_svg(&self, page_num: u32) -> Result<String, JsValue>;
    pub fn render_page_html(&self, page_num: u32) -> Result<String, JsValue>;
}
```

### Error Handling Structure

```rust
pub enum HwpError {          // Native (non-WASM safe)
    InvalidFile(String),
    PageOutOfRange(u32),
    RenderError(String),
}
impl From<HwpError> for JsValue { ... }  // Conversion only at WASM boundary
```

## 5. Observer + Worker Pattern

### Observer Pattern (Change Detection)

Each render tree node has a built-in `dirty` flag, allowing selective re-rendering of only modified nodes.

```rust
pub struct RenderNode {
    pub dirty: bool,        // Whether changed
    pub visible: bool,      // Visibility
    // ...
}

pub trait RenderObserver {
    fn on_event(&mut self, event: &RenderEvent);
    fn visible_pages(&self) -> Vec<u32>;
    fn prefetch_pages(&self) -> Vec<u32>;
}

pub enum RenderEvent {
    ViewportChanged(Viewport),
    ZoomChanged(f64),
    ContentChanged(u32),
    InvalidateAll,
}
```

### Worker Pattern (Priority-Based Rendering)

```rust
pub enum RenderPriority {
    Immediate = 0,   // Pages within the current viewport
    Prefetch = 1,    // Adjacent pages +/-2 from viewport
    Background = 2,  // Remaining pages
}

pub trait RenderWorker {
    fn render_page(&mut self, tree: &PageRenderTree) -> Result<(), RenderError>;
    fn get_cached(&self, page_index: u32) -> Option<&PageRenderTree>;
    fn invalidate_cache(&mut self, page_index: u32);
}
```

### RenderScheduler (Observer + Worker Integration)

```
ViewportChanged -> RenderScheduler -> Task Queue (priority-sorted)
                       |                    |
               visible_pages()        Immediate: render immediately
               prefetch_pages()       Prefetch: pre-render adjacent pages
                                      Background: remaining
```

## 6. Page Rendering Model

### Page Physical Structure

```
┌──────────────────────────────────┐
│           Paper                   │
│  ┌──────────────────────────┐    │
│  │      Top Margin           │    │
│  │  ┌──────────────────┐    │    │
│  │  │  Header            │    │    │
│  │  ├──────────────────┤    │    │
│  │  │   Body Area        │    │    │
│  │  │                    │    │    │
│  │  │  ┌─Col1─┐ ┌─Col2─┐│    │    │
│  │  │  │      │ │      ││    │    │
│  │  │  └──────┘ └──────┘│    │    │
│  │  ├──────────────────┤    │    │
│  │  │ Footnote separator │    │    │
│  │  │ / area             │    │    │
│  │  ├──────────────────┤    │    │
│  │  │  Footer            │    │    │
│  │  └──────────────────┘    │    │
│  │      Bottom Margin        │    │
│  └──────────────────────────┘    │
└──────────────────────────────────┘
```

### Rendering Pipeline

```
IR (Document Model)
    -> Paginator       (Page splitting: accumulate paragraph heights -> determine page boundaries)
    -> LayoutEngine    (Render tree generation: calculate exact px position/size for each element)
    -> RenderScheduler (Priority scheduling: Immediate -> Prefetch -> Background)
    -> Renderer backend (Canvas/SVG/HTML output)
```

### Render Node Types (18 types)

| Node Type | Description |
|-----------|------|
| Page | Page root |
| PageBackground | Background/border |
| Header / Footer | Header/Footer |
| Body | Body area |
| Column | Column area |
| FootnoteArea | Footnote area |
| TextLine | Text line |
| TextRun | Text run (same character style) |
| Table / TableCell | Table/Cell |
| Line / Rectangle / Ellipse / Path | Drawing objects |
| Image | Image |
| Group | Group object |

## 7. Font Fallback Strategy

### Fallback Chain

```
1. Font specified in HWP document (CharShape.font_ids)
   | (if not found)
2. System font mapping (fontconfig, etc.)
   | (if not found)
3. Default fallback font: /usr/share/fonts/truetype/nanum/NanumGothic.ttf
```

### API

```rust
pub const DEFAULT_FALLBACK_FONT: &str = "/usr/share/fonts/truetype/nanum/NanumGothic.ttf";

// Can be changed at runtime
doc.set_fallback_font("/custom/path/font.ttf");
doc.get_fallback_font();  // Query current setting
```

## 8. Unit Conversion

- HWP internal unit: HWPUNIT = 1/7200 inch
- Canvas rendering: pixels (DPI-based conversion)
- Conversion formula: `pixel = hwpunit * dpi / 7200`
- Reverse conversion: `hwpunit = pixel * 7200 / dpi`
- Default DPI: 96 (web standard)
- A4 paper: 59528 x 84188 HWPUNIT = 793.7 x 1122.5 px (@ 96 DPI)

## 9. CLI Commands

```bash
rhwp export-svg <file.hwp> [--output <folder>] [--page <number>]
rhwp info <file.hwp>
rhwp --version
rhwp --help
```

- SVG export default output folder: `output/`

## 10. First Phase Support Scope

| Element | Support Level |
|------|----------|
| Page | Paper size, orientation, margins, page background/border |
| Section | Per-section page settings, single/multi-section |
| Text | Basic text, font, size, color, bold/italic |
| Paragraph | Alignment, indent, line spacing, paragraph spacing |
| Table | Basic table structure, cell merging, borders |
| Image | Inline images (PNG, JPG) |
| Shape | Line, rectangle, ellipse, polygon, curve, arc |
| Header/Footer | Basic header/footer rendering |
| Font | NanumGothic fallback, runtime-changeable |

### Not Supported in First Phase (Future Extension)
- Equations, charts, OLE objects
- Footnotes/endnotes
- Table page splitting
- Text effects (shadow, outline, emboss/engrave)
- Vertical writing
- Text wrapping (text flow around objects)

## 11. Build Verification Status

| Target | Result | Test Count |
|------|------|---------|
| Native (cargo build) | Success | - |
| Tests (cargo test) | **88 passed** | 88 |
| WASM (wasm-pack build) | Success | - |

### Test Distribution

| Module | Test Count |
|------|---------|
| model (12 files) | 31 |
| parser | 1 |
| renderer (8 files) | 44 |
| wasm_api | 12 |
| Total | **88** |
