# Task 90: HWPX Parser Accuracy Improvement — Final Report

## Background
After implementing the HWPX parser in Task 89, comparison with the python-hwpx reference parser and the OWPML schema revealed numerous parsing omissions and errors that required accuracy improvement.

## Steps Performed

### Step 1: Common Utility Extraction + charPr/paraPr Enhancement
- Created new `utils.rs` — 13 common utility functions + 3 tests
- Removed 120 lines of duplicate functions from header.rs/section.rs
- charPr: Added emboss and engrave bit parsing
- paraPr: Added breakSetting (widowOrphan, keepWithNext, keepLines, pageBreakBefore), autoSpacing (eAsianEng, eAsianNum), border offset (left/right/top/bottom) parsing

### Step 2: section.rs Image/Table/Special Character Enhancement
- **Major parse_picture improvement**: `<hp:pic>` element attributes, `<hp:pos>` position attributes, `<hp:outMargin>`/`<hp:inMargin>` margins, `<hp:imgClip>` cropping, `<hp:img>` effect parsing added
- Added `<hp:columnBreak/>` special character handling
- cellPr attribute parsing (borderFillIDRef, textDirection, vAlign)

### Step 3: borderFill Enhancement + Font Language Mapping
- **Font language group fix**: Tracked `<hh:fontface lang="...">` context to correctly map to 7 language groups (Korean/English/Hanja/Japanese/Other/Symbol/User)
- borderFill gradation color list parsing
- imgBrush image background parsing (fill mode, bin_data_id, etc.)
- Slash (diagonal) parsing

### Step 4: Build + SVG Verification + Report
- 532 Rust tests passed
- WASM build + Vite build successful
- 5 HWPX sample SVG exports normal
- **Fixed 0x0 image bug**: Resolved issue where curSz/sz zero values overwrote valid orgSz values

## Improved Parsing Items Summary

| Area | Before | After |
|------|--------|-------|
| Image size | Some 0x0 | All images displayed correctly with orgSz fallback |
| Image position | Position/text flow not parsed | pos, textWrap, outMargin, inMargin, imgClip parsed |
| Font mapping | All fonts mapped to Korean group | Accurate mapping to 7 language groups |
| paraPr | Only align, margin, lineSpacing | Added breakSetting, autoSpacing, border offset |
| charPr | Basic attributes only | Added emboss, engrave bits |
| borderFill | 4-directional lines + solid color only | Added gradation colors, imgBrush, slash |
| Special characters | lineBreak, tab | Added columnBreak |
| Table cells | cellPr skipped | cellPr attributes parsed |
| Code quality | Duplicate functions in header/section | Common utils.rs module |

## Modified Files

| File | Change Type | Changes |
|------|------------|---------|
| `src/parser/hwpx/utils.rs` | New | 13 common utility functions + tests |
| `src/parser/hwpx/mod.rs` | Modified | Added `pub mod utils;` |
| `src/parser/hwpx/header.rs` | Modified | fontface lang, charPr/paraPr/borderFill enhancements |
| `src/parser/hwpx/section.rs` | Modified | Image/table cell/special character enhancements |

## Verification Results
- `docker compose run --rm test` — **532** Rust tests passed
- `docker compose run --rm wasm` — WASM build successful
- `npm run build` — Vite build successful
- 5 HWPX sample SVG exports — 45 pages generated error-free
- 0x0 images — 3 before fix -> **0** after fix
