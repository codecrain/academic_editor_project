# Task 90: HWPX Parser Accuracy Improvement — Implementation Plan

## Implementation Steps (4 steps)

---

### Step 1: Common Utility Extraction + header.rs charPr/paraPr Improvements

**Goal**: Extract duplicate utility functions to common module, improve missing charPr/paraPr attributes

**Modified files**:
- `src/parser/hwpx/utils.rs` (new) — common utility function extraction
- `src/parser/hwpx/mod.rs` — utils submodule declaration
- `src/parser/hwpx/header.rs` — charPr/paraPr parsing improvements, remove duplicates
- `src/parser/hwpx/section.rs` — remove duplicates, use utils

**Implementation**:

1. **utils.rs new creation** — extract duplicate functions from header.rs and section.rs:
   ```rust
   pub fn local_name(name: &[u8]) -> &[u8];
   pub fn attr_str(attr: &Attribute) -> String;
   pub fn parse_u8(attr: &Attribute) -> u8;
   pub fn parse_i8(attr: &Attribute) -> i8;
   pub fn parse_u16(attr: &Attribute) -> u16;
   pub fn parse_i16(attr: &Attribute) -> i16;
   pub fn parse_u32(attr: &Attribute) -> u32;
   pub fn parse_i32(attr: &Attribute) -> i32;
   pub fn parse_color(attr: &Attribute) -> u32;  // #RRGGBB -> 0x00BBGGRR
   pub fn skip_element(reader: &mut Reader<&[u8]>, end_tag: &[u8]) -> Result<(), HwpxError>;
   ```

2. **charPr parsing improvements** (header.rs):
   - `<hh:emboss/>` → `cs.emboss = true` (no field in existing CharShape → use attr bits)
   - `<hh:engrave/>` → `cs.engrave = true`
   - Confirm already parsed items:
     - fontRef (7 languages), ratio, spacing, relSz, offset
     - bold, italic, underline, strikeout, outline, shadow, supscript, subscript
     - height(base_size), textColor, shadeColor, borderFillIDRef
   - **Addition needed**: `<hh:charSz>` (per-language actual sizes x7) — optional in OWPML schema

3. **paraPr parsing improvements** (header.rs):
   - Add `<hh:breakSetting>` parsing:
     ```
     widowOrphan → attr2 bit 5
     keepWithNext → attr2 bit 6
     keepLines → attr2 bit 7
     pageBreakBefore → attr2 bit 8
     ```
   - Add `<hh:autoSpacing>` parsing:
     ```
     eAsianEng → attr1 bit 20 (Korean-English auto spacing)
     eAsianNum → attr1 bit 21 (Korean-number auto spacing)
     ```
   - Support `<hh:margin>` child text node parsing:
     OWPML schema allows margin child elements (intent/left/right/prev/next) to have values in
     **child element text nodes** instead of attributes — support both approaches
   - `condense` → `ps.condense` (change from `{}` ignore → store value)
   - `fontLineHeight` → store in attr bit
   - `snapToGrid` → store in attr bit
   - `<hh:border>` improvements: `offsetLeft/Right/Top/Bottom` → `ps.border_spacing[0..4]`

**Verification**: `docker compose run --rm test` — existing 529 tests + new unit tests pass

---

### Step 2: section.rs Text/Special Characters/Table Cell Parsing Improvements

**Goal**: Fix rendering-critical items: table cell size, special character handling, image size

**Modified file**:
- `src/parser/hwpx/section.rs` — table/image/text parsing improvements

**Implementation**:

1. **Fix image size 0x0** (critical):
   - Current `parse_picture` does not parse `<hp:imgRect>/<hp:pt>`
   - Fix: Map `<hp:sz>` or `<hp:curSz>` attribute width/height to `ImageAttr.width/height`
   - python-hwpx reference: `<hp:sz width="..." height="..."/>` within `pic` element

2. **Add `<hp:columnBreak/>` special character**:
   - Current: only `lineBreak`, `tab` handled
   - Addition: `columnBreak` → column break character (0x000B or substitute as line break)

3. **Table cell parsing improvements**:
   - Add `<hp:cellPr>` parsing — currently skipped
     ```
     borderFillIDRef → cell.border_fill_id (also provided in cellPr)
     textDirection → cell.text_direction
     ```
   - `<hp:tcPr>` improvements:
     ```
     cellMargin (left/right/top/bottom) → cell margin fields
     ```

4. **Paragraph property improvements**:
   - Parse `pageBreak` attribute → paragraph-level page break handling
   - Parse `columnBreak` attribute

**Verification**: `docker compose run --rm test` — all tests pass

---

### Step 3: borderFill Improvements + Font Language Mapping Fix

**Goal**: Improve borderFill gradation/image background parsing, accurate font language group mapping

**Modified file**:
- `src/parser/hwpx/header.rs` — borderFill, fontface modifications

**Implementation**:

1. **Font language group mapping fix**:
   - Current: all fonts added only to `font_faces[0]` (Korean)
   - Fix: map based on `<hh:fontface lang="...">` attribute
     ```
     HANGUL → font_faces[0]
     LATIN → font_faces[1]
     HANJA → font_faces[2]
     JAPANESE → font_faces[3]
     OTHER → font_faces[4]
     SYMBOL → font_faces[5]
     USER → font_faces[6]
     ```

2. **borderFill improvements**:
   - `<hh:gradation>` parsing improvements — currently only basic attributes parsed
     - `<hh:color>` child elements → gradation color list
   - `<hh:imgBrush>` parsing improvements — image background mode
   - `<hh:slash>`, `<hh:backSlash>` diagonal division parsing

3. **paraPr margin text node support**:
   - OWPML schema: `<hh:margin><hh:left>200</hh:left>...</hh:margin>` form possible
   - Currently attribute-based (`left="200"`) only → support text node approach too

**Verification**: `docker compose run --rm test` — all tests pass

---

### Step 4: Build + SVG Export Verification + Final Report

**Goal**: WASM/Vite build confirmation, SVG rendering comparison verification for 5 HWPX samples

**Modified files**:
- (Build verification only, no additional modifications expected)

**Verification**:
1. `docker compose run --rm test` — all Rust tests pass
2. `docker compose run --rm wasm` — WASM build success
3. `npm run build` — Vite build success
4. `export-svg` for 5 HWPX samples → rendering quality confirmation:
   - Image sizes normal (previously: 0x0)
   - Font language-accurate mapping
   - Paragraph line break settings reflected
   - Table cell properties accurately parsed
5. Final report written

---

## Modified Files Summary

| File | Step | Changes |
|------|------|---------|
| `src/parser/hwpx/utils.rs` (new) | 1 | Common utility functions |
| `src/parser/hwpx/mod.rs` | 1 | utils submodule declaration |
| `src/parser/hwpx/header.rs` | 1,3 | charPr/paraPr/borderFill/fontface improvements |
| `src/parser/hwpx/section.rs` | 1,2 | Image size, table cell, special character improvements |

## Priority Rationale

Rendering quality-critical items first:
1. Image size 0x0 → visible defect
2. Font language groups → font mismatch in Korean/English mixed documents
3. paraPr breakSetting → pagination accuracy
4. Table cell properties → table rendering quality
5. borderFill gradation → visual completeness
