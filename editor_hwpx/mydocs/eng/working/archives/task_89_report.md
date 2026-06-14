# Task 89: HWPX File Processing Support — Final Completion Report

## Completion Date
2026-02-15

## Overview
Implemented a parser that converts HWPX (XML-based Hangul document) files into the existing Document IR, and integrated auto-detection of HWP/HWPX formats in the web viewer and CLI.

## Implementation Results

### Stage 1: Dependency Addition + ZIP Container + Format Auto-Detection

| Item | Result |
|------|--------|
| `Cargo.toml` | Added `zip = "2.4"`, `quick-xml = "0.37"` |
| `src/parser/mod.rs` | `FileFormat` enum, `detect_format()` (magic byte based) |
| `src/parser/hwpx/mod.rs` | `parse_hwpx()` entry point, `HwpxError` error type |
| `src/parser/hwpx/reader.rs` | `HwpxReader` — ZIP container reading |
| `src/parser/hwpx/content.rs` | content.hpf parsing — section file list + BinData list extraction |

### Stage 2: header.xml Parsing -> DocInfo Conversion

| Item | Result |
|------|--------|
| `src/parser/hwpx/header.rs` (~700 lines) | header.xml -> DocInfo + DocProperties conversion |
| Fonts | `<hh:fontface>` -> `font_faces[lang]` (7 language groups) |
| CharShape | `<hh:charPr>` -> `CharShape` (size/bold/italic/underline/color, etc.) |
| ParaShape | `<hh:paraPr>` -> `ParaShape` (alignment/margins/line spacing/border) |
| Styles | `<hh:style>` -> `Style` (name/para_shape_id/char_shape_id) |
| Border/Fill | `<hh:borderFill>` -> `BorderFill` (4-direction lines/background color/gradient) |
| Tab Definition | `<hh:tabPr>` -> `TabDef` |
| Numbering | `<hh:numbering>` -> `Numbering` |
| Color conversion | `#RRGGBB` -> HWP `0x00BBGGRR` format |

### Stage 3: section*.xml Parsing -> Section Conversion

| Item | Result |
|------|--------|
| `src/parser/hwpx/section.rs` (~680 lines) | section XML -> Section model conversion |
| Section definition | `<hp:secPr>/<hp:pagePr>/<hp:margin>` -> SectionDef + PageDef |
| Paragraphs | `<hp:p>/<hp:run>/<hp:t>` -> Paragraph (text + char_shapes + line_segs) |
| Tables | `<hp:tbl>/<hp:tr>/<hp:tc>` -> Table + Cell (row/col count/cell merge/cell padding/border) |
| Images | `<hp:pic>/<hp:img>` -> Control::Picture (BinData ID linkage) |
| BinData | ZIP BinData/ -> bin_data_content (image binary loading) |

**Key Finding**: In HWPX, `<hp:secPr>` is not a top-level element but is located inside the first paragraph's `<hp:run>`.
Implemented secPr parsing within `parse_paragraph` to extract SectionDef accordingly.

### Additional Issues Found and Fixed During Rendering Verification

| Issue | Cause | Fix |
|-------|-------|-----|
| Line overlap (lineseg not parsed) | Missing `<hp:linesegarray>/<hp:lineseg>` parsing | Added `parse_lineseg_array`, `parse_lineseg_element` functions — mapping textpos/vertpos/vertsize/textheight/baseline/spacing/horzpos/horzsize/flags |
| Paper orientation error (A4 rendered landscape) | HWPX stores actual dimensions in width/height, so swap by landscape flag is unnecessary. Existing code swapped when `landscape="WIDELY"` | Ignored landscape attribute in HWPX (always set to false). Verified with lineseg horzsize=48188 approx equal to portrait body width 48190 |
| Strikethrough displayed everywhere | `<hh:strikeout shape="3D">` — "3D" is not a valid LineStyleType2 value. Existing code: `val != "NONE"` -> treated everything as strikethrough | Explicit whitelist matching for valid strikethrough shapes (SOLID/DASH/DOT, etc.) |
| Table border lines missing | `borderFillIDRef` attribute of `<hp:tc>` element not parsed (function parameter was `_e`, ignored) | Changed `_e` to `e`, added `borderFillIDRef`/`header` attribute parsing |
| Table cell vertical alignment missing | `<hp:subList vertAlign="CENTER">` not parsed | Added vertAlign parsing from subList element -> Cell.vertical_align mapping |

### Stage 4: WASM/Frontend Integration + Build + Verification

| Item | Result |
|------|--------|
| `src/wasm_api.rs` | Applied `detect_format()` branching in `from_bytes()` |
| `rhwp-studio/src/main.ts` | Allowed `.hwpx` file upload/drag-and-drop |
| `rhwp-studio/index.html` | `<input accept=".hwp,.hwpx">` |
| CLI | Auto HWPX support in `export-svg`, `info` commands |

## Verification Results

| Item | Result |
|------|--------|
| `docker compose run --rm test` | 529 tests passed (including HWPX-specific tests) |
| `docker compose run --rm wasm` | WASM build succeeded (1,215KB) |
| `npm run build` (Vite) | Frontend build succeeded |
| Sample HWPX info output | Recognized 2 sections, 121 paragraphs, 26 tables, 5 images, 5 BinData |
| Sample HWPX SVG export | 9 pages generated normally (A4 portrait 793.7x1122.5px) |
| Paper size | 59528x84188 HWPUNIT parsed correctly |
| Margins | left 5669 right 5669 top 4251 bottom 4251 correct |
| 5 HWPX sample files | All loaded and rendered normally |

## Modified File List

### New Files (5)
- `src/parser/hwpx/mod.rs` — HWPX parser entry point
- `src/parser/hwpx/reader.rs` — ZIP container reading
- `src/parser/hwpx/content.rs` — content.hpf parsing
- `src/parser/hwpx/header.rs` — header.xml -> DocInfo
- `src/parser/hwpx/section.rs` — section*.xml -> Section

### Modified Files (5)
- `Cargo.toml` — Added zip, quick-xml dependencies
- `src/parser/mod.rs` — hwpx module declaration, detect_format(), FileFormat
- `src/wasm_api.rs` — Format detection branching in from_bytes()
- `rhwp-studio/src/main.ts` — Allow .hwpx files
- `rhwp-studio/index.html` — Extended file input accept

## Known Limitations (Unimplemented Items)
- Shape object parsing unimplemented — HWPX `<hp:drawText>`, etc.
- Header/footer/footnotes unimplemented
- Multi-column layout unimplemented
- Nested table parsing is structurally possible but unverified
- Image size (images 3~5) is 0x0 — need to add pic element width/height attribute mapping

## Architecture

```
[HWPX File (ZIP)]
     |
     v
  HwpxReader <- zip crate
     |
     +-- content.hpf -> section list
     +-- header.xml -> DocInfo
     +-- section*.xml -> Section
     +-- BinData/* -> bin_data_content
     |
     v
  Document IR (shared existing model)
     |
     v
  [Existing pipeline: compose -> paginate -> render -> SVG/Canvas]
```
