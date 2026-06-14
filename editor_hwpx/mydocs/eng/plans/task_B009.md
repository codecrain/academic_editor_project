# B-009: Print Engine Development Plan

> **Document Type**: Development Plan
> **Date**: 2026-02-23
> **Status**: Draft
> **Priority**: P2 (Key Differentiating Feature)
> **Prerequisites**: Hexagonal Architecture (Task 149 Complete), Renderer Trait (Existing)

---

## 1. Overview

### 1.1 Goal

Generate **PDF/PostScript directly** from the rhwp Core Engine and provide a **desktop-grade printing experience within the browser** via a Windows Localhost Agent.

### 1.2 Competitive Advantage

| | Competitors (Hancom Web Editor, etc.) | rhwp |
|---|---|---|
| Print Method | PDF download, then user prints separately | **Direct printing from the browser** |
| Output Quality | Depends on PDF viewer + driver | **Guaranteed by Core Engine** |
| Security Watermark | Requires separate solution purchase | **Built-in** |
| Driver Issues | User/admin resolves | **Bypasses drivers via PS RAW** |
| User Experience | 8-10 steps (2 app switches) | **3 steps (0 app switches)** |

### 1.3 Core Strategy

```
PDF Renderer = Default (download + standard printing)
PostScript Renderer = Advanced (direct output to government network printers)
Localhost Agent = Transport (ActiveX replacement pattern, proven in Korean IT)
```

---

## 2. Architecture

### 2.1 Overall Structure

```
┌─────────────────────────────────────────────────────────┐
│  Core Domain (Rust, WASM)                               │
│                                                         │
│  Document → Layout → PageRenderTree                     │
│                           │                             │
│                     Renderer Trait                       │
│                     (7 methods)                          │
│                           │                             │
│              ┌────────────┼────────────┐                │
│              │            │            │                │
│         SvgRenderer  PdfRenderer  PostScriptRenderer    │
│         (existing)   (new P1)     (new P2)              │
│              │            │            │                │
│              ▼            ▼            ▼                │
│         Screen Display  Vec<u8>       Vec<u8>            │
│                      (PDF bytes)   (PS bytes)            │
└─────────────┬────────────┬────────────┬─────────────────┘
              │            │            │
              │     ┌──────┴──────┐     │
              │     │  WASM API   │     │
              │     │  (Adapter)  │     │
              │     └──────┬──────┘     │
              │            │            │
         ┌────┴────┐  ┌───┴───┐  ┌─────┴─────┐
         │ PDF     │  │ Print │  │ PS RAW    │
         │Download │  │ Agent │  │ Agent     │
         │(Blob)   │  │ (PDF) │  │ (Spooler) │
         └─────────┘  └───┬───┘  └─────┬─────┘
                          │            │
                    ┌─────┴────────────┴─────┐
                    │   rhwp-print-service    │
                    │   (Windows Service)     │
                    │   localhost:9443 HTTPS  │
                    └────────────┬────────────┘
                                │
                          Win32 Spooler API
                                │
                            Printer Output
```

### 2.2 Renderer Trait (Existing, No Changes)

```rust
// src/renderer/mod.rs — 7 methods
pub trait Renderer {
    fn begin_page(&mut self, width: f64, height: f64);
    fn end_page(&mut self);
    fn draw_text(&mut self, text: &str, x: f64, y: f64, style: &TextStyle);
    fn draw_rect(&mut self, x: f64, y: f64, w: f64, h: f64, corner_radius: f64, style: &ShapeStyle);
    fn draw_line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, style: &LineStyle);
    fn draw_ellipse(&mut self, cx: f64, cy: f64, rx: f64, ry: f64, style: &ShapeStyle);
    fn draw_image(&mut self, data: &[u8], x: f64, y: f64, w: f64, h: f64);
    fn draw_path(&mut self, commands: &[PathCommand], style: &ShapeStyle);
}
```

### 2.3 Localhost Agent Pattern

Adopts the architecture already proven as an ActiveX replacement in Korea.

```
[Browser rhwp-studio]              [rhwp-print-service]
       │                                    │
       │  GET /check                        │
       │───────────────────────────────→    │ Check install/version
       │  ← { version, status }             │
       │                                    │
       │  GET /printers                     │
       │───────────────────────────────→    │ EnumPrintersW()
       │  ← [{ name, driver, status }, ..]  │
       │                                    │
       │  POST /print                       │
       │  { printer, data(base64), type }   │
       │───────────────────────────────→    │ WTSQueryUserToken()
       │                                    │ ImpersonateLoggedOnUser()
       │                                    │ OpenPrinterW()
       │                                    │ StartDocPrinterW()
       │                                    │ WritePrinter()
       │  ← { jobId, status }              │
       │                                    │
       │  GET /job/{id}                     │
       │───────────────────────────────→    │ Status query
       │  ← { status, progress }            │
```

Reference implementations: Yessign (public certificate), TouchEn nxKey (keyboard security), AhnLab Safe Transaction — all use the same pattern.

---

## 3. Detailed Design by Component

### 3.1 PdfRenderer (Core, Rust)

**Location**: `src/renderer/pdf.rs`

Minimal implementation per PDF 1.7 standard. Direct binary generation without external crate dependencies.

#### PDF Structure

```
%PDF-1.7
1 0 obj  << /Type /Catalog /Pages 2 0 R >>
2 0 obj  << /Type /Pages /Kids [...] /Count N >>
3 0 obj  << /Type /Page /MediaBox [0 0 595 842] /Contents 4 0 R /Resources ... >>
4 0 obj  << /Length ... >>
stream
  BT /F1 12 Tf 72 720 Td (Hello) Tj ET   ← draw_text()
  0.5 0 0 RG 72 700 200 1 re S            ← draw_line()
  q ... cm ... Do Q                        ← draw_image()
endstream
...
xref
trailer
%%EOF
```

#### Renderer Trait Mapping

| Trait Method | PDF Operator |
|-------------|-----------|
| `begin_page(w, h)` | Create Page object, set MediaBox |
| `end_page()` | Close content stream |
| `draw_text(text, x, y, style)` | `BT /Font size Tf x y Td (text) Tj ET` |
| `draw_rect(x, y, w, h, r, style)` | `x y w h re` (S/f/B) |
| `draw_line(x1, y1, x2, y2, style)` | `x1 y1 m x2 y2 l S` |
| `draw_ellipse(cx, cy, rx, ry, style)` | 4 Bezier curve approximation |
| `draw_image(data, x, y, w, h)` | XObject Image + `Do` |
| `draw_path(commands, style)` | `m`/`l`/`c`/`h` + S/f/B |

#### Coordinate Transformation

```
rhwp (px, 96 DPI, origin=top-left)  →  PDF (pt, 72 DPI, origin=bottom-left)

pdf_x = px_x * 72.0 / 96.0
pdf_y = page_height_pt - (px_y * 72.0 / 96.0)
```

#### Font Strategy

| Phase | Approach | Description |
|------|------|------|
| Phase 1 | PDF Base 14 font mapping | Korean text uses CIDFont /KR |
| Phase 2 | TrueType embedding | WASM embedded fonts → PDF /FontFile2 |
| Phase 3 | Subsetting | Extract only used glyphs to minimize file size |

### 3.2 PostScriptRenderer (Core, Rust)

**Location**: `src/renderer/postscript.rs`

Based on PostScript Level 2. Outputs the same vector commands as PDF but in PS syntax.

#### Renderer Trait Mapping

| Trait Method | PostScript Commands |
|-------------|------------------|
| `begin_page(w, h)` | `%%Page: n n`, `%%PageBoundingBox: 0 0 w h` |
| `end_page()` | `showpage` |
| `draw_text(text, x, y, style)` | `/Font size selectfont x y moveto (text) show` |
| `draw_rect(x, y, w, h, r, style)` | `x y w h rectfill` or `rectstroke` |
| `draw_line(x1, y1, x2, y2, style)` | `x1 y1 moveto x2 y2 lineto stroke` |
| `draw_ellipse(cx, cy, rx, ry, style)` | `gsave translate scale arc grestore` |
| `draw_image(data, x, y, w, h)` | `image` or `colorimage` operator |
| `draw_path(commands, style)` | `moveto`/`lineto`/`curveto`/`closepath` |

#### PS Output Example

```postscript
%!PS-Adobe-3.0
%%Pages: 3
%%DocumentFonts: NanumGothic

%%Page: 1 1
%%PageBoundingBox: 0 0 595 842

% draw_text("Hello", 72, 100, style)
/NanumGothic 12 selectfont
0 0 0 setrgbcolor
72 742 moveto
<C548B155D558C138C694> show

% draw_rect(72, 200, 200, 50, 0, style)
0.8 0.8 0.8 setrgbcolor
72 592 200 50 rectfill

% draw_line(72, 300, 272, 300, style)
0 0 0 setrgbcolor
1 setlinewidth
72 542 moveto 272 542 lineto stroke

showpage
```

#### Advantages over PDF (Government Agencies)

```
PS RAW → Spooler → Printer
  ✓ Complete driver bypass → Eliminates driver compatibility issues
  ✓ Core Engine has 100% control over final output
  ✓ Security watermark inserted at PS level → Tamper-proof
  ✓ Government network printers = all support PS (enterprise laser MFPs)
```

### 3.3 rhwp-print-service (Windows Service)

**Separate Project**: `rhwp-print-service/`

#### Tech Stack

| Component | Technology |
|------|------|
| Language | Rust |
| HTTP Server | hyper + rustls (TLS) |
| Windows API | windows-rs crate |
| Service Registration | windows-service crate |
| Certificate | rcgen (self-signed, Root CA registered at install) |
| Installer Package | WiX Toolset (MSI) |

#### API Specification

| Method | Path | Description | Request | Response |
|--------|------|------|------|------|
| GET | `/check` | Service health check | - | `{ version, status }` |
| GET | `/printers` | List printers | - | `[{ name, driver, port, status }]` |
| POST | `/print` | Submit print job | `{ printer, docName, data, dataType }` | `{ jobId, status }` |
| GET | `/job/{id}` | Query job status | - | `{ status, progress }` |

#### dataType Options

| Value | Spooler Data Type | Purpose |
|----|---------------------|------|
| `"raw"` | `RAW` | Direct PS/PCL transmission (bypasses driver) |
| `"pdf"` | `NT EMF 1.008` | PDF → EMF → via driver |
| `"xps"` | `XPS_PASS` | Via XPS pipeline |

#### Security Design

```
1. Binding: 127.0.0.1 only (blocks external access entirely)
2. TLS: Self-signed certificate (Root CA registered at install)
3. CORS: Only allows rhwp-studio origin
4. Origin Validation: Checks Origin header on every request
5. Rate Limiting: Blocks excessive requests
6. User Isolation: WTSQueryUserToken → Impersonation (accesses only user's printers)
```

### 3.4 Browser Side (rhwp-studio)

**Location**: `rhwp-studio/src/print/`

#### Print Flow

```
User presses Ctrl+P
    │
    ├─ Agent install check (GET /check, 1.5s timeout)
    │   ├─ Not installed → Installation guide dialog
    │   └─ Installed → Continue
    │
    ├─ Printer list query (GET /printers)
    │
    ├─ Print dialog display
    │   ├─ Printer selection (dropdown)
    │   ├─ Page range (all/current/specified)
    │   ├─ Copies
    │   ├─ Duplex printing
    │   ├─ Output method: PS direct (recommended) / via PDF
    │   └─ Security options: Watermark, security level
    │
    ├─ Generate PDF or PS in WASM
    │   └─ DocumentCore → PdfRenderer/PostScriptRenderer → Vec<u8>
    │
    ├─ Send to Agent (POST /print)
    │
    └─ Progress display (GET /job/{id} polling)
```

#### Fallback When Agent Not Installed

```
Agent not installed / macOS / Linux
    │
    ├─ PDF Blob download (conventional method)
    └─ Or window.print() (browser print)
```

---

## 4. Phased Roadmap

### Phase 1: PDF Renderer (Foundation)

**Goal**: Implement Renderer trait to generate PDF for download functionality

| Step | Content | Deliverable |
|------|------|--------|
| 1-1 | PDF binary basic structure (header, xref, trailer) | `src/renderer/pdf.rs` |
| 1-2 | draw_text: Base 14 fonts + CIDFont/KR for Korean | Text output verification |
| 1-3 | draw_rect, draw_line, draw_ellipse, draw_path | Shape output verification |
| 1-4 | draw_image: JPEG/PNG embedding | Image output verification |
| 1-5 | Multi-page + coordinate transformation verification | Sample HWP → PDF comparison |
| 1-6 | WASM API binding (`export_pdf_native`) | PDF Blob download from JS |

**Verification**: 10 sample HWP files → PDF conversion → layout consistency check

### Phase 2: PostScript Renderer (Government Differentiation)

**Goal**: Output the same vector paths as PDF Renderer in PS syntax

| Step | Content | Deliverable |
|------|------|--------|
| 2-1 | PS Level 2 basic frame (DSC header, page structure) | `src/renderer/postscript.rs` |
| 2-2 | draw_text: PS font selection + Korean CID handling | Text output verification |
| 2-3 | draw_rect, draw_line, draw_ellipse, draw_path | Shape output verification |
| 2-4 | draw_image: PS image/colorimage operators | Image output verification |
| 2-5 | Security watermark insertion at PS level | Watermark output verification |
| 2-6 | Sample HWP → PS → GhostScript rendering comparison | Layout consistency check |

**Verification**: GhostScript PS → PNG conversion, then pixel comparison with SVG output

### Phase 3: Windows Print Service (Transport Layer)

**Goal**: Establish browser → Spooler print path via Localhost HTTPS Agent

| Step | Content | Deliverable |
|------|------|--------|
| 3-1 | Rust Windows Service skeleton (SCM register/start/stop) | `rhwp-print-service/` |
| 3-2 | Hyper + Rustls HTTPS server (localhost binding) | TLS communication verification |
| 3-3 | Self-signed certificate generation + Root CA registration | Browser communicates without warnings |
| 3-4 | `/check`, `/printers` API (EnumPrintersW) | Printer list display |
| 3-5 | `/print` API (OpenPrinterW → WritePrinter) | RAW/PDF printing |
| 3-6 | User token delegation (WTSQueryUserToken + Impersonation) | Network printer access |
| 3-7 | `/job/{id}` status query | Progress display |

**Verification**: Actual printer output test (local + network)

### Phase 4: Browser Integration (Final UX)

**Goal**: Ctrl+P → Print dialog → Output complete (identical to desktop Hancom Word)

| Step | Content | Deliverable |
|------|------|--------|
| 4-1 | print-client.ts (Agent communication module) | `rhwp-studio/src/print/` |
| 4-2 | Agent install detection + installation guide UI | Installation prompt dialog |
| 4-3 | Print dialog UI (printer selection, options) | Hancom-style UI |
| 4-4 | WASM export_pdf/export_ps → Agent transmission | End-to-End printing |
| 4-5 | Progress display + error handling | User feedback |
| 4-6 | Agent fallback (PDF download) | Universal compatibility |

**Verification**: Real-world scenario testing (government environment simulation)

### Phase 5: Secure Printing + Advanced Features

**Goal**: Meet government agency security requirements

| Step | Content | Deliverable |
|------|------|--------|
| 5-1 | Security watermark (username, datetime, classification) | PDF/PS dual support |
| 5-2 | Banner Page (auto-generated cover info) | Security regulation compliance |
| 5-3 | Job Ticket metadata (user ID, security level) | Audit trail support |
| 5-4 | TrueType font subsetting (PDF/PS) | File size optimization |
| 5-5 | MSI installer + GPO deployment support | Enterprise-scale deployment |

---

## 5. Technical Considerations

### 5.1 Coordinate System

```
                 rhwp Internal     PDF              PostScript
Origin           Top-left          Bottom-left      Bottom-left
Unit             px (96 DPI)       pt (72 DPI)      pt (72 DPI)
A4 Size          793.7 x 1122.5 px 595 x 842 pt    595 x 842 pt
Y-axis Direction Down (increases)   Up (increases)   Up (increases)
```

Conversion formula:
```
pt_x = px_x * (72 / dpi)
pt_y = page_height_pt - px_y * (72 / dpi)
```

### 5.2 Korean Font Handling

| Phase | PDF | PostScript |
|------|-----|------------|
| Initial | CIDFont + Adobe-Korea1-2 encoding | CIDFont + CMap |
| Mid-term | TrueType embedding (/FontFile2) | Type 42 (TrueType in PS) |
| Final | Glyph subsetting | Glyph subsetting |

### 5.3 Image Handling

| Format | PDF | PostScript |
|------|-----|------------|
| JPEG | `/Filter /DCTDecode` (raw stream as-is) | `<< /Filter /DCTDecode >>` |
| PNG | `/Filter /FlateDecode` + alpha separation | `image` + Decode/DataSource |
| BMP | Raw → Flate compression | `image` operator |

### 5.4 Minimal Crate Dependency Principle

PDF/PS generation builds binary/text directly **without external crates**.

```
Allowed:
  - flate2 (Deflate compression, for PDF streams)
  - WASM embedded font data (existing)

Not Allowed:
  - printpdf, lopdf, etc. (loss of control)
  - cairo, skia, etc. (WASM incompatible)
```

Reason: Must work in WASM environments, and byte-level control is a prerequisite for security watermark insertion.

---

## 6. Project Structure

### 6.1 Core (Added to Existing rhwp)

```
src/renderer/
├── mod.rs              ← Renderer trait (existing, no changes)
├── svg.rs              ← SvgRenderer (existing)
├── canvas.rs           ← CanvasRenderer (existing)
├── html.rs             ← HtmlRenderer (existing)
├── pdf.rs              ← PdfRenderer (new, Phase 1)
├── pdf/
│   ├── mod.rs          ← PdfRenderer struct + Renderer impl
│   ├── objects.rs      ← PDF objects (Catalog, Page, Font, XObject)
│   ├── stream.rs       ← Content stream generation (drawing operators)
│   ├── font.rs         ← Font embedding + CIDFont handling
│   └── image.rs        ← Image embedding (JPEG/PNG)
├── postscript.rs       ← PostScriptRenderer (new, Phase 2)
└── postscript/
    ├── mod.rs          ← PostScriptRenderer struct + Renderer impl
    ├── dsc.rs          ← DSC header/footer (%%Page, %%EOF, etc.)
    ├── font.rs         ← PS font definitions (Type 42, CIDFont)
    └── image.rs        ← PS image handling (image operator)
```

### 6.2 Windows Print Service (Separate Project)

```
rhwp-print-service/
├── Cargo.toml
├── src/
│   ├── main.rs              ← Windows Service entry point
│   ├── service.rs           ← SCM register/start/stop
│   ├── tls_server.rs        ← Hyper + Rustls HTTPS server
│   ├── cert.rs              ← Self-signed certificate generation/management
│   ├── routes.rs            ← REST API handlers
│   ├── print_spooler.rs     ← Win32 Spooler API (OpenPrinter/WritePrinter)
│   └── security.rs          ← Origin validation, Rate Limiting, Token delegation
├── installer/
│   ├── rhwp-print.wxs       ← WiX MSI definition
│   └── install.ps1          ← PowerShell install script
└── tests/
    └── integration_test.rs  ← Spooler integration test
```

### 6.3 Browser Side (Added to rhwp-studio)

```
rhwp-studio/src/
├── print/
│   ├── print-client.ts      ← Agent communication (fetch localhost:9443)
│   ├── print-dialog.ts      ← Print dialog UI
│   ├── print-dialog.css     ← Dialog styles
│   └── print-fallback.ts    ← PDF download fallback when Agent not installed
```

---

## 7. Target Environments

### 7.1 By Print Path

| Target Environment | Print Path | Notes |
|-----------|----------|------|
| Government (internal network) | PS RAW → Agent → Spooler | **Optimal path**. All government printers support PS |
| General Enterprise | PDF → Agent → Spooler (via driver) | Universal compatibility |
| Individual Users | PDF download | Fallback when Agent not installed |
| macOS / Linux | PDF download or browser print | Extendable to CUPS Agent in the future |

### 7.2 Windows Version Support

| OS | Supported | Notes |
|----|------|------|
| Windows 11 | Yes | Primary target |
| Windows 10 | Yes | Majority of government agencies |
| Windows Server 2019+ | Yes | Terminal service environments |

---

## 8. Risks and Mitigation

| Risk | Impact | Mitigation |
|--------|------|----------|
| Korean font PDF embedding complexity | Phase 1 delay | CIDFont first, embedding later |
| Self-signed certificate browser compatibility | Agent communication failure | Automate Root CA registration at install |
| Corporate firewall blocking localhost | Agent communication blocked | Port change option + PDF fallback |
| PS output printer compatibility variations | Output errors | PS Level 2 (maximum compatibility) + test matrix |
| Service account printer access permissions | Network printer failure | WTSQueryUserToken Impersonation |
| WASM environment memory limits | Large document PDF generation failure | Per-page streaming generation |

---

## 9. Success Criteria

| Metric | Target |
|------|------|
| PDF layout accuracy | Pixel comparison with SVG rendering, error < 1px |
| PS layout accuracy | GhostScript rendering result, error < 1px |
| Print step count | Ctrl+P → output complete in 3 steps or fewer |
| Agent response time | `/printers` query < 500ms |
| Print transmission time | 10-page document < 3 seconds |
| Test coverage | PDF/PS Renderer 70% or higher |

---

> [!IMPORTANT]
> The core value of this plan is to realize **"web, but better than desktop"** for printing.
> PDF Renderer is the foundation, PostScript is the government differentiator, and Localhost Agent is a transport mechanism proven in the Korean IT ecosystem.
> The combination of these three elements creates the decisive product difference from competitors.
