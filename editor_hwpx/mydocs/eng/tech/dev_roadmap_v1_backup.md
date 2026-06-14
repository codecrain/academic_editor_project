# rhwp Development Roadmap

## Status Summary (As of February 10, 2026)

### Completed Core Engine

| Area | Status | Details |
|------|--------|---------|
| HWP Parsing | Complete | OLE Compound File, full DocInfo/BodyText/BinData interpretation |
| HWP Serialization | Complete | Save modified documents as HWP binary, compatibility with Hancom Office verified |
| SVG Rendering | Complete | Text, tables, images, shapes, backgrounds |
| WASM Build | Complete | Browser operation confirmed, 78 WASM APIs |
| Text Editing | Complete | Insert/delete/split/merge, formatting, reflow |
| Table Editing | Complete | Add rows/columns, merge/split cells, cell text editing |
| Web Editor | Complete | Caret, selection, formatting toolbar, language-specific font branching |
| Unit Tests | 414 | All passing |

### Cumulative Task History (1-33)

33 tasks were used to incrementally build from parser to renderer to editor to serializer to formatting tools.

### Unimplemented Areas (Required for Productization)

| Component | Current Status | Required for Product |
|-----------|---------------|---------------------|
| HTML -> HWP Conversion | Not implemented | **Required** (Phase 1 core) |
| HWP -> PDF Conversion | Not implemented | **Required** (Phase 1 core) |
| Python Bindings (PyO3) | Not implemented | **Required** (distribution channel) |
| PyPI Package | Not implemented | **Required** (distribution) |
| MCP Server | Not implemented | **Required** (Phase 2 core) |
| npm Package Refinement | Partial (pkg/ exists) | Recommended |
| Header/Footer Rendering | Not implemented | Recommended |
| Multi-column Layout | Not implemented | Optional |
| Equation/Chart Rendering | Not implemented | Optional |
| Undo/Redo | Not implemented | Optional (editor only) |
| Copy/Paste | Not implemented | Optional (editor only) |

---

## Overall Timeline

```
2026
──────────────────────────────────────────────────────────
Feb 10~      Phase 1: Core Product Features         <- Current
             |- HTML -> HWP Conversion
             |- HWP -> PDF Conversion (hwp2pdf)
             +- Quality Improvements (header/footer, etc.)

Early Mar~   Phase 2: Distribution Channel Setup
             |- PyO3 Python Bindings
             |- PyPI Package Publishing
             +- npm Package Refinement

Mid Mar~     Phase 3: AI Agent Integration
             |- MCP Server Implementation
             |- Claude Skill Documentation
             +- Template System

Late Mar     > v1.0 Release (Product Complete)

Apr-Jun      Phase 4: Market Penetration (Open Source Release)
             |- GitHub Public Release (MIT/Apache 2.0)
             |- Technical Blog, Demo Site
             |- Community Building
             +- Early User Feedback Integration

Jul~         Phase 5: Monetization Transition
             |- Dual Licensing or Open Core Transition
             |- Enterprise Modules (encryption, batch processing)
             +- B2B/B2G Technical Support Contracts
──────────────────────────────────────────────────────────
```

---

## Phase 1: Core Product Features (Mid Feb - Early Mar)

**Goal**: Implement two key conversion features that AI Agents can actually use

### 1-1. HTML -> HWP Conversion

The core pipeline for converting AI Agent-generated HTML into HWP binary format.

**Technical Design**:
```
HTML String
  -> HTML Parser (html5ever or lightweight parser)
    -> Intermediate Representation (IR) Mapping
      -> HWP Document Model (Paragraph, Table, CharShape, ParaShape)
        -> HWP Serialization (using existing serializer)
          -> .hwp File Output
```

**Supported HTML Elements (by priority)**:

| Priority | HTML Element | HWP Mapping |
|----------|-------------|-------------|
| P0 (Required) | `<h1>`~`<h6>` | Paragraph + font size/bold |
| P0 | `<p>` | Paragraph |
| P0 | `<strong>`, `<em>`, `<u>` | CharShape (bold/italic/underline) |
| P0 | `<table>`, `<tr>`, `<td>` | Table control + Cell |
| P0 | `<br>` | Line break |
| P1 (Important) | `<ul>`, `<ol>`, `<li>` | Paragraph + numbering |
| P1 | `<img>` | Picture control (BinData) |
| P1 | `<a>` | Hyperlink |
| P1 | `style` attribute | CharShape/ParaShape mapping |
| P2 (Optional) | `<div>` + CSS | Layout hints |
| P2 | `<code>`, `<pre>` | Fixed-width font paragraph |

**Required Dependencies**:
- `html5ever` or `scraper` (HTML parsing)
- Existing `model/` + `serializer/` reuse

**Deliverable**: `html_to_hwp(html: &str, output_path: &str)` function

**Estimated Effort**: 3-4 tasks (HTML parsing -> text/formatting mapping -> table mapping -> integration tests)

### 1-2. HWP -> PDF Conversion (hwp2pdf)

PDF conversion leveraging the existing SVG rendering engine.

**Technical Design**:
```
HWP File
  -> rhwp Parsing (existing)
    -> Page Layout (existing)
      -> SVG Rendering (existing)
        -> SVG -> PDF Conversion (new)
          -> .pdf File Output
```

**Implementation Approach Comparison**:

| Approach | Library | Pros | Cons |
|----------|---------|------|------|
| A. SVG->PDF | `svg2pdf` + `printpdf` | Reuses existing SVG engine, minimal implementation | Font embedding handling needed |
| B. Direct PDF Generation | `printpdf` | No SVG intermediate step, fine-grained control | Layout logic reimplementation needed |
| C. External Tool Integration | `resvg` + `cairo` | Guaranteed rendering quality | Increased external dependencies, WASM incompatible |

**Recommended: Approach A (SVG->PDF)**
- Directly convert already-verified SVG rendering output to PDF
- Use `printpdf` crate, font embedding via system fonts or bundled fonts

**Deliverable**: `hwp_to_pdf(hwp_path: &str, pdf_path: &str)` function + CLI `rhwp export-pdf`

**Estimated Effort**: 2-3 tasks (SVG->PDF converter -> font embedding -> multi-page)

### 1-3. Quality Improvements (Optional)

| Feature | Description | Product Impact |
|---------|-------------|---------------|
| Header/Footer | Essential for government documents | Improved PDF conversion quality |
| Page Numbers | Automatic page numbering | Government document requirement |
| Empty Document Creation | Clean empty HWP with default styles | Template system foundation |

---

## Phase 2: Distribution Channel Setup (Early-Mid March)

**Goal**: Anyone can use immediately with `pip install rhwp`

### 2-1. PyO3 Python Bindings

**Public API Design**:

```python
import rhwp

# === Conversion API (Phase 1 Core) ===
rhwp.html_to_hwp(html_string, output_path)         # HTML -> HWP
rhwp.hwp_to_pdf(hwp_path, pdf_path)                # HWP -> PDF

# === Read/Modify API ===
doc = rhwp.open(hwp_path)                           # Open HWP
text = doc.extract_text()                           # Extract all text
doc.insert_text(section, para, offset, text)        # Insert text
doc.delete_text(section, para, start, end)          # Delete text
doc.save(output_path)                               # Save HWP

# === Structured Creation API ===
doc = rhwp.create()                                 # Create empty document
doc.add_paragraph(text, style="heading1")           # Add paragraph
doc.add_table(rows, cols, data)                     # Add table
doc.save(output_path)

# === Info API ===
info = rhwp.info(hwp_path)                          # Document metadata
pages = rhwp.render_svg(hwp_path)                   # SVG rendering
```

**Required Work**:
- Add PyO3 dependency to `Cargo.toml` + feature flag (`python` feature)
- Create `src/python/` module -> write PyO3 wrapper functions
- Python type conversions (bytes <-> Vec<u8>, str <-> String, dict <-> JSON)

**Estimated Effort**: 2-3 tasks

### 2-2. PyPI Package Publishing

**Package Structure**:
```
rhwp/
|- pyproject.toml          # maturin build config
|- Cargo.toml              # python feature flag
|- src/
|   +- python/             # PyO3 bindings
|- python/
|   +- rhwp/
|       |- __init__.py     # Python package entry point
|       +- py.typed        # Type hint marker
+- README.md
```

**Build Tool**: `maturin` (official PyO3 build tool)
- `maturin develop` -> local install
- `maturin build --release` -> wheel generation
- `maturin publish` -> PyPI upload

**Supported Platforms** (maturin cross-compilation):
- Linux x86_64 (primary)
- macOS x86_64 / ARM64
- Windows x86_64

**Estimated Effort**: 1-2 tasks

### 2-3. npm Package Refinement

WASM build output exists in `pkg/`, but needs refinement for public distribution.

- Complete `package.json` metadata (description, keywords, license, repository)
- Write README.md (usage examples, API documentation)
- Test `npm publish`

**Estimated Effort**: 1 task

---

## Phase 3: AI Agent Integration (Mid-Late March)

**Goal**: Provide MCP tools for Claude Code/Cowork to directly manipulate HWP documents

### 3-1. MCP Server Implementation

**MCP Tool Definitions**:

| Tool Name | Description | Input | Output |
|-----------|-------------|-------|--------|
| `html_to_hwp` | HTML -> HWP conversion | html: string, path: string | Success/failure |
| `hwp_to_pdf` | HWP -> PDF conversion | hwp_path: string, pdf_path: string | Success/failure |
| `create_hwp` | Create HWP from structured data | sections: JSON, path: string | Success/failure |
| `read_hwp` | Extract HWP text/structure | path: string | JSON (text, tables, metadata) |
| `modify_hwp` | Modify existing HWP | path: string, ops: JSON | Success/failure |
| `render_hwp` | HWP -> SVG/PDF rendering | path: string, format: string | File path |

**Architecture**:
```
Claude Code / Cowork
    |
    |  MCP (JSON-RPC over stdio)
    v
+-----------------------------+
| rhwp-mcp (Rust single binary)|
|                             |
|  initialize()               |
|  tools/list -> 6 tools      |
|  tools/call -> execute tool  |
|                             |
|  Internal: direct rhwp core |
|  engine calls               |
+-----------------------------+
    |
    v
  .hwp / .pdf files
```

**Implementation Approach**:
- Separate binary: `rhwp-mcp` (Cargo workspace member or feature flag)
- JSON-RPC message handling via `stdin/stdout`
- Use MCP SDK or implement protocol directly (lightweight)

**Estimated Effort**: 2-3 tasks

### 3-2. Claude Skill Documentation

Provide skill documentation so AI Agents can correctly use rhwp.

```markdown
# HWP Document Tools (rhwp)

## Available Tools
- html_to_hwp: Convert HTML string to HWP file
- hwp_to_pdf: Convert HWP file to PDF
- read_hwp: Extract text/structure from HWP file
- modify_hwp: Modify existing HWP file
- create_hwp: Create HWP from structured data

## Usage Guidelines
- Use html_to_hwp when Korean government documents/reports are needed
- HTML should use standard tags: <h1>~<h6>, <p>, <table>, <strong>, etc.
- Use hwp_to_pdf for additional conversion when PDF submission is required
```

### 3-3. Template System

An advanced feature for filling data into government/institutional document forms.

**Workflow**:
```
Template HWP + Manifest YAML
    |
    |- AI Agent inspects structure with read_hwp()
    |- Checks field positions/formats from manifest
    |- Inserts data with modify_hwp()
    +- Saves completed HWP
```

**Estimated Effort**: 1-2 tasks (leveraging existing read/modify APIs)

---

## Phase 4: Market Penetration (April-June)

**Strategy**: "Get it installed everywhere" -- get as many AI Agents as possible using rhwp.

### 4-1. Open Source Release

**License Strategy**: MIT or Apache 2.0 (completely free)
- Minimize entry barriers: enterprises can adopt immediately with no legal concerns
- Preemptive release to deter competitors from catching up

**Release Items**:
- GitHub repository (core engine + WASM + Python bindings)
- PyPI package (`pip install rhwp`)
- npm package (`npm install rhwp`)
- Crates.io (`cargo add rhwp`)
- MCP server binary (GitHub Releases)

### 4-2. Technical Marketing

| Channel | Content | Goal |
|---------|---------|------|
| GitHub README | Install -> 5-min quickstart -> demo GIF | First impression |
| Demo Site | Try HWP viewer/editor in the browser | Demonstrate technical capability |
| Technical Blog | "Reverse Engineering HWP Binary Format", "Parsing OLE in Rust" | Developer interest |
| Hacker News / Reddit | English introduction: "First open-source HWP writer" | Global exposure |
| Korean Community | GeekNews, Discord, developer communities | Acquire Korean developers |

### 4-3. Key Performance Indicators (KPI)

| Metric | 1-month Target (April) | 3-month Target (June) |
|--------|----------------------|----------------------|
| GitHub Stars | 100+ | 500+ |
| PyPI Weekly Downloads | 50+ | 500+ |
| npm Weekly Downloads | 30+ | 200+ |
| MCP Server Installs | 20+ | 100+ |
| Issue/PR Participants | 5+ | 20+ |

### 4-4. Early User Acquisition Paths

| Target | Approach | Value Proposition |
|--------|----------|-------------------|
| AI Startups (Wrtn, etc.) | Direct contact, tech demo | "Add HWP output to your Korean AI assistant" |
| SI Companies (Samsung SDS, LG CNS) | Tech seminars, PoC proposals | "Automated HWP generation for government SI" |
| Individual Developers | Open source community, blog | "Free HWP generation for your hobby projects" |
| Government IT Staff | Propose integration during AI adoption | "Automated AI-generated government reports" |

---

## Phase 5: Monetization Transition (July~)

### 5-1. Business Model Selection

Based on feedback document (`bz_model.md`) analysis, three models will be applied progressively.

**Primary: Dual Licensing (iText model)** -- Most strongly recommended

```
Core Library (MIT/Apache)          Enterprise (Commercial License)
|- html_to_hwp()                   |- rhwp-pdf (PDF conversion module)
|- read_hwp()                      |- rhwp-crypto (document encryption/DRM)
|- modify_hwp()                    |- rhwp-batch (bulk batch processing)
|- create_hwp()                    |- rhwp-template-builder (GUI)
+- MCP Server (basic)              +- SLA technical support (24h patch)
```

Transition scenario:
- Core library stays MIT/Apache -> continue market penetration
- Separate features enterprises need into paid modules
- MIT/Apache + paid add-ons approach (closer to Open Core than GPL)

**Secondary: Technical Support Subscription (Red Hat model)** -- B2G/B2B

```
Subscription tiers:
|- Community (free): GitHub Issues, community forum
|- Professional (~$400/month): 48h SLA, email support, quarterly consulting
+- Enterprise (~$1,600/month): 24h SLA, dedicated engineer, custom development
```

### 5-2. Paid Module Candidates

| Module | Target Customer | Estimated Price |
|--------|----------------|-----------------|
| `rhwp-pdf` | All enterprises (PDF output required) | ~$800/year |
| `rhwp-crypto` | Finance/Government (document security) | ~$1,600/year |
| `rhwp-batch` | Bulk dispatch systems (notifications, etc.) | ~$2,400/year |
| `rhwp-template-builder` | SI companies (form mapping tool) | ~$4,000/year |
| Technical Support SLA | B2G SI projects | ~$8,000/project |

### 5-3. Monetization Transition Conditions

Paid modules will be introduced when **all** of the following are met:
1. PyPI weekly downloads exceed 500 (market awareness secured)
2. At least 3 confirmed enterprise usage cases
3. GitHub Stars exceed 500 (community trust)
4. Technical support/pricing inquiries received from enterprises

If conditions are not met: continue free release, focus on market penetration.

---

## Planned Dependency Additions

### Phase 1 Additions

```toml
[dependencies]
# HTML Parsing (for html_to_hwp)
html5ever = "0.29"        # HTML5 standard parser
markup5ever = "0.14"      # Common markup parser utilities

# PDF Conversion (for hwp2pdf)
printpdf = "0.7"          # PDF generation
svg2pdf = "0.12"          # SVG -> PDF conversion
```

### Phase 2 Additions

```toml
[dependencies]
# Python Bindings (feature = "python")
pyo3 = { version = "0.22", features = ["extension-module"], optional = true }

[build-dependencies]
maturin = "1.7"           # Python package build tool
```

### Phase 3 Additions

```toml
# MCP Server (separate binary or feature)
serde_json = "1.0"        # JSON-RPC message handling
tokio = { version = "1", features = ["io-std", "macros"] }  # async I/O
```

---

## Weekly Milestones (Detailed)

### Week 3 of February (2/10-16): HTML->HWP Foundation

- [ ] HTML parser integration (html5ever + tag->HWP IR mapping design)
- [ ] Basic text conversion (h1~h6, p, br, strong, em, u)
- [ ] Unit tests (HTML text -> HWP paragraph verification)

### Week 4 of February (2/17-23): HTML->HWP Tables + hwp2pdf Start

- [ ] Table conversion (table, tr, td -> HWP Table control)
- [ ] Image conversion (img -> Picture control)
- [ ] hwp2pdf: SVG->PDF converter prototype (single page)

### Week 1 of March (2/24-3/2): hwp2pdf Completion + CLI

- [ ] hwp2pdf: Multi-page PDF generation
- [ ] hwp2pdf: Font embedding handling
- [ ] CLI integration: `rhwp export-pdf`, `rhwp html-to-hwp`
- [ ] Integration tests (actual HWP file -> PDF conversion verification)

### Week 2 of March (3/3-9): PyO3 + PyPI

- [ ] PyO3 binding basic structure (html_to_hwp, hwp_to_pdf, open, create)
- [ ] maturin build config (pyproject.toml)
- [ ] Local testing (pip install -> create HWP from Python)
- [ ] PyPI test deployment (TestPyPI)

### Week 3 of March (3/10-16): MCP Server + Deployment

- [ ] MCP server implementation (JSON-RPC over stdio, 6 tools)
- [ ] PyPI official deployment
- [ ] npm package refinement + deployment
- [ ] Claude Code integration testing

### Week 4 of March (3/17-23): Templates + Documentation

- [ ] Template manifest system
- [ ] Skill documentation
- [ ] API documentation (Python/JS/Rust)
- [ ] README + quickstart guide

### Last Week of March (3/24-31): v1.0 Release Preparation

- [ ] Full integration tests (HTML->HWP->PDF pipeline)
- [ ] Performance benchmarks (conversion speed, memory usage)
- [ ] Release notes
- [ ] v1.0 tag + GitHub Releases

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| HTML->HWP mapping complexity exceeds estimates | Phase 1 delay | Implement P0 tags first, defer P1/P2 |
| PDF font embedding issues | hwp2pdf quality degradation | Bundle default fonts, system font fallback |
| PyO3 cross-build failure | Platform distribution limitation | maturin CI/CD for multi-platform automated builds |
| MCP protocol changes | Server compatibility breakage | Pin protocol version, adapter pattern |
| Hancom's API publication response | Increased competition | 6-month head start + open-source community effect |

---

## Success Criteria

### Technical Success (End of March)

- [ ] `pip install rhwp && python -c "import rhwp; rhwp.html_to_hwp('<h1>Test</h1>', 'test.hwp')"` works
- [ ] `rhwp export-pdf sample.hwp output.pdf` works
- [ ] HWP creation via MCP tool in Claude Code succeeds
- [ ] 500+ unit tests passing
- [ ] Generated HWP displays correctly in Hancom Office

### Business Success (June)

- [ ] PyPI weekly downloads exceed 500
- [ ] GitHub Stars exceed 500
- [ ] At least 3 enterprise usage cases
- [ ] At least 1 technical discussion with AI startup/SI company

### Long-term Success (12 months)

- [ ] "HWP generation = rhwp" becomes common knowledge in the Korean developer community
- [ ] Annual revenue exceeds $80,000 (technical support + paid modules)

---

*Written: 2026-02-10*
*Based on: project_vision.md, bz_model.md*
