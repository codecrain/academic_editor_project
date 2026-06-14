# Task 90: HWPX Parser Accuracy Improvement — Execution Plan

## Background

In Task 89, the HWPX parser was implemented enabling basic parsing and rendering. However, comparison with the python-hwpx reference parser and OWPML schema revealed numerous parsing omissions and errors.

## Reference Materials

- python-hwpx parser: `/home/edward/vsworks/shwp/python-hwpx/src/hwpx/oxml/`
- OWPML XML schema: `/home/edward/vsworks/shwp/python-hwpx/DevDoc/OWPML SCHEMA/`

## Gap Analysis

### header.rs Gaps

| Area | Current Status | Missing/Errors |
|------|---------------|----------------|
| charPr | Only basic properties parsed: height, bold, italic, underline, strikeout, color etc. | `spacing` (letter spacing), `relSz` (relative size), `offset` (vertical position), `shadow`, `emboss`, `engrave`, `supscript`/`subscript`, `charSz` (per-language sizes x7), `charSpacing` (per-language spacing x7), `charRelSz` (per-language relative size x7), `charOffset` (per-language vertical position x7) not parsed |
| paraPr | Basic align, margin, lineSpacing, border parsed | `heading` (numbering/bullets), `breakSetting` (paragraph line break settings — widowOrphan, keepWithNext, keepLines, pageBreakBefore), `autoSpacing` (Korean-English/Korean-number auto spacing), `tabPrIDRef` (tab reference), `condense`, `fontLineHeight`, `snapToGrid` not parsed |
| paraPr margin | left/right/indent/prev/next parsed | OWPML schema has margin child element values in **child element text nodes** — current attribute-only parsing may miss values |
| borderFill | 4-direction lines + background color parsed | `gradation`, `imgBrush` (image background), `windowBrush`, `fillBrushType` not parsed |
| bullet | Not implemented | python-hwpx parses `<hh:bullet>` (char, checkedChar, useImage, paraHead etc.) |

### section.rs Gaps

| Area | Current Status | Missing/Errors |
|------|---------------|----------------|
| Paragraph properties | paraPrIDRef, styleIDRef parsed | `pageBreak`, `columnBreak`, `merged` attributes not parsed |
| Controls in runs | Only tbl, pic handled | `<hp:ctrl>`, `<hp:equation>`, `<hp:ole>`, shapes (rect/ellipse/line/arc/polyline etc. 15 inline object types) not handled |
| Text | Only `<hp:t>` text extracted | `<hp:tab/>`, `<hp:lineBreak/>`, `<hp:columnBreak/>` special elements need conversion to tab/line break characters |
| Table | Basic structure parsed | `<hp:cellAddr>` (rowAddr/colAddr), `<hp:cellSpan>` (rowSpan/colSpan), `<hp:tcPr>` detailed properties not parsed. Cell size (`<hp:cellSz>` width/height) also not parsed |
| Image | pic → Control::Picture | `<hp:imgRect>/<hp:pt>` (image coordinates), `<hp:imgClip>` (clipping area) not parsed. Image size parsed as 0x0 |
| secPr | pagePr/margin parsed | `<hp:noteSpacing>`, `<hp:notePlacement>`, `<hp:noteNumbering>` (footnote settings), `<hp:colPr>` (multi-column settings), `<hp:headerFooterRef>` not parsed |

### Common Utility Gaps

| Item | Current Status | Needed |
|------|---------------|--------|
| Utility function duplication | header.rs, section.rs each have separate local_name, attr_str, parse_u8..parse_u32 | Extract to common module |

## Goals

1. **Prioritize rendering-critical items**: charPr spacing/relative size, paraPr heading/breakSetting, table cell size/address, image size, special characters (tab/line break)
2. **Ensure consistency with python-hwpx reference parser**: Major structures match for the same HWPX file
3. **Code quality improvement**: Extract common utilities to eliminate duplication

## Scope

- `src/parser/hwpx/header.rs` — charPr/paraPr/borderFill parsing improvements
- `src/parser/hwpx/section.rs` — table cell/image/special character/control parsing improvements
- `src/parser/hwpx/utils.rs` (new) — common utility extraction
- Maintain existing 529 tests + add new tests

## Out of Scope

- Shape rendering (inline object parsing only, rendering as separate task)
- Header/footer/footnote parsing (separate task)
- Multi-column layout (separate task)
- Track changes parsing (separate task)

## Verification

1. `docker compose run --rm test` — all Rust tests pass
2. `docker compose run --rm wasm && npm run build` — WASM/Vite build success
3. SVG export of 5 HWPX samples → confirm rendering quality improvement
4. `rhwp info` output for parsing accuracy comparison
