# Task 154: HWPX Rendering Enhancement

> **Created**: 2026-02-23
> **Priority**: P1
> **Status**: Execution Plan

---

## 1. Problem Definition

### 1-1. Symptoms

**A. HWPX documents without lineSegArray (service_agreement.hwpx)**
- All paragraph text renders at the **same y-coordinate**, overlapping
- **Line breaking does not work**, causing text to overflow past the right page boundary
- Only tables render normally (using their own layout)

**B. Image position anomaly (2024 Q1 foreign direct investment press release ff.hwpx, page 3)**
- Images are placed at **page top (y=0~15)** instead of body area (y=132~)
- x=-4.13 (negative → outside page), width=715.2 (exceeds body width 566px)
- Problem in HWPX image position/size parsing or coordinate interpretation

**C. HWPX control parsing entirely missing**

| Control | HWPX | HWP | Notes |
|---------|------|-----|-------|
| Picture/image (`<hp:pic>`) | **O** | O | Position/size parsing complete, coordinate conversion issue |
| Table (`<hp:tbl>`) | **O** | O | Fully implemented, inMargin fix complete |
| Section/column (`<hp:secPr>`, `<hp:colPr>`) | **O** | O | Fully implemented |
| Page/column break | **O** | O | Fully implemented |
| **Drawing objects** (rect/line/ellipse/polygon/curve) | **X** | O | Completely unimplemented in HWPX |
| **Text box** (`<hp:drawText>`) | **X** | O | Unimplemented in HWPX |
| **Fields/hyperlinks** (`<hp:ctrl>`) | **X** | O | Entire `<hp:ctrl>` skipped |
| **Footnotes/endnotes** (`<hp:footNote>`, `<hp:endNote>`) | **X** | O | Unimplemented in HWPX |
| **Headers/footers** (`<hp:headerFooter>`) | **X** | O | Unimplemented in HWPX |
| **Bookmarks** | **X** | O | Skipped in `<hp:ctrl>` |
| **Auto-numbering/bullets** | **X** | O | Skipped in `<hp:ctrl>` |
| Equations (`<hp:eqEdit>`) | **X** | incomplete | Incomplete on both sides |
| OLE objects | **X** | incomplete | Incomplete on both sides |

### 1-2. Root Causes

**A. Paragraphs without lineSegArray**:
- Some HWPX files have paragraphs without `<hp:lineSegArray>` (created by hwpxskill, Python editing, etc.)
- Hancom's word processor performs its own layout using ParaPr/CharPr even without lineSegArray
- Currently rhwp creates default LineSeg (all values 0) when lineSegArray is missing → no height/line breaking info

**B. Control parsing scope**:
- `<hp:ctrl>` elements are **entirely skipped** (section.rs:184-186) → fields, bookmarks, hyperlinks all ignored
- Drawing objects, footnotes/endnotes, headers/footers parsing modules don't exist for HWPX
- Binary HWP parser supports all of these (control.rs, control/shape.rs)

### 1-3. Existing Infrastructure
| Component | Location | Status |
|-----------|----------|--------|
| `reflow_line_segs()` | `renderer/composer/line_breaking.rs:574` | Can synthesize from CharPr when line_height=0. **Only called during editing** |
| `font_size_to_line_height()` | `renderer/composer/line_breaking.rs:667` | px → HWPUNIT conversion |
| `ResolvedStyleSet` | `renderer/style_resolver.rs` | CharPr/ParaPr → px interpretation complete |
| `resolve_cell_padding()` | `renderer/layout/table_layout.rs` | Table cell padding interpretation |

### 1-4. Already Fixed Items
| Item | File | Content |
|------|------|---------|
| VerticalAlign::Center formula error | `table_layout.rs:784` | Removed `- last_line_descent` |
| HWPX `<inMargin>` not parsed | `parser/hwpx/section.rs:464` | Added `table.padding` parsing |

---

## 2. Implementation Plan

### 3-Step Structure

#### Step 1: Synthesize LineSeg on HWPX Document Load

**Goal**: For HWPX paragraphs without lineSegArray (or with line_height=0), call `reflow_line_segs()` immediately after document load to generate correct LineSeg.

**Changed files**:

| File | Change Description |
|------|-------------------|
| `document_core/commands/document.rs` | After `from_bytes_native()` or `convert_to_editable_native()`, detect zero-height line_seg paragraphs for HWPX documents and call `reflow_line_segs()` |
| `renderer/composer/line_breaking.rs` | Enhance `reflow_line_segs()` to reflect ParaPr's line_spacing_type/value (currently line_spacing=0 fixed) |

**Detailed logic**:

```
After from_bytes() completes:
  for each section:
    for each paragraph:
      if para.line_segs.len() == 1 && para.line_segs[0].line_height == 0:
        → reflow_line_segs(para, body_width_px, &styles, dpi)
```

**reflow_line_segs enhancement**:
- Current: Only calculates `line_height` from CharPr, `line_spacing` is fixed at 0
- Enhancement: Reflect ParaPr's `line_spacing_type` and `line_spacing` values
  - `PERCENT`: `line_spacing = font_height * (percentage - 100) / 100`
  - `FIXED`: `line_spacing = fixed_value - line_height`
  - `SPACEONLY`: `line_spacing = value`

**Verification**:
- `service_agreement.hwpx` → SVG: unique y-coordinate per paragraph, normal line breaking
- `2024 Q1 foreign direct investment press release ff.hwpx` → SVG: existing normal rendering maintained
- `Integrated fiscal statistics(2011.10).hwp` → SVG: no impact on HWP file rendering
- `cargo test` all 608+ pass

#### Step 2: HWPX Image Coordinate Fix + Parsing Attribute Enhancement

**Goal**: Fix image position/size rendering, enhance detail attribute parsing

| Item | Symptom | Fix |
|------|---------|-----|
| **HWPX image coordinates** | Image placed at page top (y=0) | Investigate and fix `<hp:pos>` coordinate conversion logic |
| **HWPX image size** | width=715px exceeds body width | Verify absolute/relative coordinate interpretation |
| ParaPr margins (prev/next) | Possible paragraph spacing not reflected | Check header.rs parsing |
| ParaPr indent | Possible indentation not reflected | Check header.rs parsing |
| secPr page margins | HWPX page margin consistency | Check section.rs parsing |

**Verification**: SVG comparison (HWPX image correctly placed) + Docker tests

#### Step 3: HWPX Control Parsing Extension

**Goal**: Parse major controls in HWPX that are supported in binary HWP

**Priority-based implementation targets**:

| Priority | Control | HWPX Element | Reference (Binary HWP) |
|----------|---------|-------------|------------------------|
| **HIGH** | Text box/drawing objects | `<hp:drawText>`, `<hp:rect>`, `<hp:line>`, `<hp:ellipse>`, etc. | `parser/control/shape.rs` (789 lines) |
| **HIGH** | `<hp:ctrl>` parsing | Fields, hyperlinks, bookmarks, auto-numbering | `parser/control.rs` |
| **HIGH** | Headers/footers | `<hp:headerFooter>` | `CTRL_HEADER`/`CTRL_FOOTER` |
| **MED** | Footnotes/endnotes | `<hp:footNote>`, `<hp:endNote>` | `CTRL_FOOTNOTE`/`CTRL_ENDNOTE` |
| **LOW** | Equations | `<hp:eqEdit>` | Incomplete on both sides |

**Implementation approach**:
- Populate the same model structures (`Control`, `ShapeObject`, etc.) that the binary HWP parser (`control.rs`, `control/shape.rs`) generates from HWPX XML
- Since the renderer only looks at the model, HWPX support can be extended **without renderer changes**

**Reference**:
- `/home/edward/vsworks/shwp/python-hwpx` — HWPX XML structure reference
- `/home/edward/vsworks/hwpxskill/references/hwpx-format.md` — HWPX format reference
- `src/parser/control.rs`, `src/parser/control/shape.rs` — Binary HWP parser (conversion target)

**Verification**:
- Visual comparison via SVG export with various HWPX samples
- Docker tests: all pass, Clippy 0

---

## 3. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| reflow affects binary HWP files | HWP always has valid line_segs → skip via line_height > 0 condition |
| reflow_line_segs available_width calculation | Pass section's body_width (page_width - margin_left - margin_right) |
| Table internal paragraph reflow | Table cells are handled by their own layout → can skip table internal paragraphs |
| Performance | reflow runs only once at document load, O(n) text scan per paragraph |

---

## 4. Expected Results

| Metric | Before | After |
|--------|--------|-------|
| service_agreement.hwpx rendering | All text overlapping at y=153.6 | Normal per-paragraph placement, normal line breaking |
| HWPX image placement | Page top (y=0), oversized | Normal placement within body area |
| HWPX control support | Only tables/pictures (2/14) | Additional major controls supported |
| Binary HWP file impact | - | None (skipped via line_height > 0) |
| Existing HWPX (with lineSegArray) | Normal | Maintained normal |
