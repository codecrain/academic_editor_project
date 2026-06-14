# hwpers Project Analysis — Competitive Analysis from rhwp's Perspective

## 1. Overview

| Item | hwpers | rhwp |
|------|--------|------|
| Repository | github.com/Indosaram/hwpers | (private) |
| Language | Rust (edition 2021) | Rust (edition 2021) |
| License | MIT / Apache-2.0 | TBD |
| Current version | v0.5.0 (2026-01-19) | - |
| Published on crates.io | Yes (`cargo add hwpers`) | No |
| Total code size | ~13,400 lines (Rust) | ~30,000+ lines (Rust + JS) |
| Tests | 104 (15 test files) | 414 |
| First commit | 2025-01-20 | Early 2025 |
| Total commits | 20 | 66 |

hwpers is a Rust HWP parser/writer library published on crates.io.
It appears to have been developed by a developer named "Indosaram" using Claude Code
(CLAUDE.md present, commit message patterns, code generation patterns).

---

## 2. Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| v0.1.0 | 2025-01-20 | Initial structure, basic HWP reading |
| v0.2.0 | 2025-01-28 | Parser complete, SVG rendering, layout engine |
| v0.3.0 | 2025-01 | Writer functionality added (partial) |
| v0.3.1 | 2025-01-29 | Writer complete (tables, lists, images, hyperlinks, etc.) |
| v0.4.0 | 2025-12-29 | **Writer compatibility fix** — claimed to fix critical bug where Hancom couldn't open files |
| v0.5.0 | 2026-01-19 | HWPX support, distribution document decryption, preview extraction |

**Notable**: Writer was declared "complete" at v0.3.x, but v0.4.0 claimed to fix a bug that
prevented Hancom from opening the files. However, **actual verification with v0.5.0 showed
that all 5 generated HWP files produced "file is corrupted" errors in Hancom.**
That is, from v0.1.0 through v0.5.0, **there is a high probability that the Writer never
produced a single HWP file that Hancom could open normally.**

---

## 3. Architecture Comparison

### 3-1. Layer Structure

```
hwpers                                    rhwp
──────────────────────                    ──────────────────────
reader/  (CFB reading)                    parser/  (CFB reading + record parsing)
  cfb.rs (delegates to cfb crate)          cfb_reader.rs (custom implementation)
  stream.rs                                record.rs, byte_reader.rs
                                           header.rs, doc_info.rs, body_text.rs
                                           control.rs, bin_data.rs, crypto.rs

parser/  (record parsing)                 model/  (document IR)
  header.rs, doc_info.rs                   document.rs, paragraph.rs
  body_text.rs, record.rs                  control.rs, table.rs, style.rs
                                           page.rs, shape.rs, image.rs, etc.

model/  (document model)                  renderer/  (rendering engine)
  23 files                                  pagination.rs, layout.rs
  document.rs (596 lines)                   composer.rs, height_measurer.rs
                                           style_resolver.rs, render_tree.rs
                                           svg.rs, html.rs, canvas.rs
                                           web_canvas.rs, scheduler.rs

render/  (rendering)                      serializer/  (HWP serialization)
  layout.rs (380 lines)                     cfb_writer.rs (custom implementation)
  renderer.rs (310 lines)                   header.rs, doc_info.rs, body_text.rs
                                           control.rs, record_writer.rs

writer/  (HWP generation)                 wasm_api.rs  (78 WASM APIs)
  mod.rs (1,995 lines)                    web/  (editor UI)
  serializer.rs (1,007 lines)               editor.js, text_selection.js
  style.rs (980 lines)                       format_toolbar.js
                                           editor.html, editor.css
hwpx/  (HWPX support)
  reader.rs, writer.rs (1,559 lines)
  xml_types.rs

crypto/  (distribution documents)
preview/  (preview extraction)
```

### 3-2. Key Design Differences

| Aspect | hwpers | rhwp |
|--------|--------|------|
| **CFB handling** | Delegates to `cfb` crate | Custom CFB parser/writer |
| **Serialization approach** | New document creation (from scratch) | Round-trip preservation (read → modify → save) |
| **Writer approach** | High-level API (add_paragraph, etc.) | Low-level model direct manipulation |
| **Rendering engine** | Basic (text width estimation) | Sophisticated (WASM + Canvas measurement) |
| **WASM support** | None | 78 APIs, runs in browser |
| **Editing features** | None (generation only) | Insert/delete/formatting/reflow |
| **HWPX support** | Yes (v0.5.0) | No |

---

## 4. Detailed Feature Comparison

### 4-1. Reading (Reader/Parser)

| Feature | hwpers | rhwp |
|---------|--------|------|
| HWP 5.0 parsing | Yes | Yes |
| OLE CFB reading | Yes (cfb crate) | Yes (custom) |
| zlib decompression | Yes | Yes |
| Distribution document decryption | Yes (v0.5.0) | Yes |
| DocInfo parsing | Yes | Yes |
| BodyText parsing | Yes | Yes |
| Table parsing | Yes | Yes (including nested tables) |
| Image/BinData | Yes | Yes |
| Hyperlinks | Yes | Yes |
| Header/Footer | Yes (model only) | Yes (model only) |
| Footnotes/Endnotes | Model exists | Model exists |
| Preview extraction | Yes (PrvText, PrvImage, Summary) | No |
| HWPX reading | Yes (v0.5.0) | No |
| Text extraction | Yes (extract_text) | Yes |

**Assessment**: Both projects handle the basic HWP 5.0 structure for reading.
hwpers has additional HWPX and preview extraction, while rhwp has more robust handling of complex structures like nested tables.

### 4-2. Writing (Writer/Serializer)

| Feature | hwpers | rhwp |
|---------|--------|------|
| **Approach** | **New document creation** (empty doc → add content) | **Existing document modification** (read → edit → save) |
| Empty document creation | Yes (HwpWriter::new) | Yes (create_empty) |
| Text addition | Yes (add_paragraph) | Yes (insert_text) |
| Formatting | Yes (TextStyle API) | Yes (apply_char_format) |
| Table creation | Yes (TableBuilder) | Yes (direct model manipulation) |
| Image insertion | Yes (add_image) | Model exists, API incomplete |
| Hyperlinks | Yes (add_paragraph_with_hyperlinks) | No |
| Lists/numbering | Yes (bullet/numbered/korean) | No |
| Text boxes | Yes (add_text_box) | No |
| Header/Footer | Yes (add_header/footer) | No |
| Page layout | Yes (set_custom_page_size) | Basic |
| Document metadata | Yes (title, author, etc.) | No |
| HWPX writing | Yes (HwpxWriter) | No |
| **Existing document modification** | **No (new documents only)** | **Yes (core feature)** |
| **Round-trip preservation** | **No** | **Yes (preserves unsupported records)** |
| Hancom compatibility | **No (v0.5.0 actual verification failed)** | Yes (verified) |
| Compression support | No (on write) | Yes |

**Key Difference**: hwpers's Writer is "new document creation" only.
It cannot read and modify an existing HWP. rhwp's core is the "read → modify → save" round-trip.

**Critical Flaw in hwpers Table Serialization (Verified 2026-02-10)**:

hwpers's `TableBuilder` correctly constructs the in-memory model (`table_data`), but
**the serializer does not serialize table control records at all.**

```rust
// serializer.rs:374-432 — write_content_paragraph()
// All paragraphs are processed identically:
para_header.write_u32::<LittleEndian>(0)?; // controlMask = 0 (always!)
// → ctrl_header, table_data, picture_data, text_box_data all ignored
// → HWPTAG_CTRL_HEADER("tbl "), HWPTAG_TABLE, HWPTAG_LIST_HEADER records missing
// → Cell text is flattened and output as plain paragraphs
```

**Tests also conceal this flaw**:
- `table_test.rs`: Validates only the in-memory model (`table_para.table_data.as_ref()`)
- `advanced_table_test.rs`: Same — no post-save verification
- `serialization_test.rs`: No table serialization test exists at all
- `writer_test.rs` roundtrip: Only `println!` on `is_ok()` result, no `assert!`

As a result, hwpers's table APIs (`add_table`, `add_simple_table`, `TableBuilder`) are
**dead code that exists only in memory**, and generated HWP files do not contain tables.

Additional model-level limitations:

| Limitation | Description |
|-----------|-------------|
| Fixed column width (50mm) | `col_width = 5000u32` hardcoded, no individual specification |
| Fixed row height (10mm) | `row_height = 1000u32` hardcoded, no auto-adjustment |
| 1 paragraph per cell | No multi-paragraph, list, or mixed formatting within cells |
| No cell formatting | Only header row bold possible, no per-cell font/color |
| No cell background color | BorderFill has borders only, no fill |
| No nested tables | Cannot insert tables within cells |

### 4-3. Rendering Engine

| Feature | hwpers | rhwp |
|---------|--------|------|
| SVG output | Yes (basic) | Yes (sophisticated) |
| HTML output | No | Yes |
| Canvas 2D | No | Yes (WASM) |
| Pagination | Yes (basic) | Yes (advanced) |
| Layout engine | 380 lines, estimation-based | Thousands of lines, measurement-based |
| Text width calculation | `char_count * font_size / 2` (estimation) | Canvas measureText (accurate) |
| Table rendering | No (text only) | Yes (borders, merged cells, nesting) |
| Image rendering | Model only (not in SVG) | Yes (Base64 embedding) |
| Shape rendering | No | Yes |
| Line breaking | `text.lines()` (explicit newlines only) | LineSeg + auto reflow |
| Per-language fonts | No | Yes (7 categories) |
| Multi-column layout | No | No |

**Assessment**: The rendering engine is where **rhwp is overwhelmingly superior**.

hwpers's text width calculation:
```rust
// hwpers - render/layout.rs:370
fn calculate_text_width(&self, text: &str, char_shape: Option<&CharShape>) -> i32 {
    let char_count = text.chars().count() as i32;
    let avg_char_width = font_size / 2; // Rough approximation
    char_count * avg_char_width
}
```
All characters are treated as uniform width, with `font_size / 2` as the approximation
regardless of Hangul/English distinction. Text positions are inevitably significantly off
in actual document rendering.

rhwp measures actual font metrics via the Canvas `measureText()` API and applies
per-language fonts/letter spacing/character width ratios across 7 language categories.

### 4-4. Web/WASM Support

| Feature | hwpers | rhwp |
|---------|--------|------|
| WASM build | No | Yes |
| Browser viewer | No | Yes |
| Browser editor | No | Yes |
| Caret/selection | No | Yes |
| Formatting toolbar | No | Yes |
| Text input/deletion | No | Yes |
| WASM API count | 0 | 78 |

hwpers is available only as a native Rust library,
with no web environment support whatsoever.

### 4-5. Features Unique to hwpers

| Feature | Description | Need for rhwp Counterpart |
|---------|-------------|--------------------------|
| HWPX read/write | XML-based format for HWP | Low (market dominated by .hwp) |
| Preview extraction | PrvText, PrvImage, SummaryInfo | Low (viewer/converter use case) |
| High-level Writer API | add_paragraph, add_table, etc. | **Reference value** (for Python API design) |
| List/numbering creation | Bullets, numbers, Korean lists | Medium (needed for HTML→HWP) |
| Text box creation | Positioned/styled text boxes | Low |
| Hyperlink creation | URL, email, file, bookmark | Medium (needed for HTML→HWP) |
| Document metadata writing | Title, author, keywords, etc. | Low |

---

## 5. Code Quality Comparison

### 5-1. Writer Compatibility — Actual Verification Results

hwpers's Writer was announced as "complete" at v0.3.0 (2025-01),
but had a critical bug preventing Hancom from opening the files.
v0.4.0 (2025-12-29) claimed to have fixed this per the CHANGELOG:

```
- FileHeader: version 5.0.3.4, compression disabled, reserved[4]=0x04
- Scripts streams: uncompressed raw data matching hwplib format
- BodyText: section/column definition paragraph missing
  → Added secd, cold control characters
  → Added PAGE_DEF, FOOTNOTE_SHAPE, PAGE_BORDER_FILL records
  → lastInList flag handling
- PARA_LINE_SEG added
```

#### Actual Verification (2026-02-10)

Five test HWP files were generated with hwpers v0.5.0 and opened in Hancom:

| Test File | Content | Hancom Result |
|-----------|---------|---------------|
| hwpers_test1_basic.hwp | Basic text (Korean/English/numbers) | **"File is corrupted"** |
| hwpers_test2_styled.hwp | Formatting (bold/italic/underline/color/size) | **"File is corrupted"** |
| hwpers_test3_table.hwp | Basic tables (3x3, 4x2) | **"File is corrupted"** |
| hwpers_test4_complex_table.hwp | Cell merging (horizontal/vertical) | **"File is corrupted"** |
| hwpers_test5_comprehensive.hwp | Comprehensive (page setup/header/table/list) | **"File is corrupted"** |

**All 5 files failed to open in Hancom.**

This suggests that v0.4.0's "compatibility fix" did not actually resolve the problem,
or that v0.5.0 introduced new regression bugs.

**Conclusion**: hwpers's Writer is **practically unusable at this point**.
The fact that this level of compatibility issue exists while published on crates.io
starkly demonstrates how challenging HWP binary format serialization is.

rhwp's "read existing document → modify → save" approach makes such structural errors
unlikely to occur (the original document's structure is preserved, with only changes applied).

### 5-2. Rendering Accuracy

hwpers's layout engine estimates character widths uniformly as `font_size / 2`
and handles line breaking via `text.lines()` (explicit newline characters only).
This results in significantly misaligned text positions in real documents, with no automatic line wrapping.

rhwp uses Canvas measureText for actual measurement and supports LineSeg-based + auto reflow.

### 5-3. Serialization Strategy

| | hwpers | rhwp |
|---|--------|------|
| CFB creation | `cfb` crate's `CompoundFile::create_with_version()` | Custom mini_cfb writer |
| Record serialization | Creates only necessary records | Preserves original records + applies changes |
| Unsupported records | Omitted (information loss) | Preserved byte-for-byte |
| Compression | Read only, uncompressed on write | Read/write both supported |

rhwp's "round-trip preservation" approach completely preserves all complex structures
in existing HWP files, including records it doesn't understand.
hwpers only creates new documents, making modification/preservation of existing documents impossible.

---

## 6. Strategic Implications

### 6-1. Does hwpers Pose a Threat to rhwp?

**No direct threat at this point.** Reasons:

1. **Writer doesn't work**: HWP files generated with hwpers v0.5.0 all show
   "file is corrupted" in Hancom. **Writer functionality is effectively unusable.**

2. **Different goals**: hwpers is "an HWP read/write library in Rust,"
   rhwp is "a tool for AI Agents to manipulate HWP." Different market positioning.

3. **Missing core features**: hwpers lacks WASM, web editor, existing document modification, and sophisticated rendering.
   All of these are needed for an AI Agent tool.

4. **Rendering quality**: hwpers's rendering is at POC level.
   Insufficient for accurately displaying real documents or converting to PDF.

5. **No editing**: hwpers can only create new documents and cannot modify existing ones.
   The core AI Agent scenario of "filling data into existing forms" is impossible.

### 6-2. What to Learn from hwpers

1. **High-level Writer API design**:
   The high-level API pattern with `add_paragraph()`, `add_heading()`, `add_table()`, `add_image()`, etc.
   is worth referencing when designing rhwp's Python bindings.

2. **HWPX support**:
   The fact that hwpers implemented HWPX read/write can be considered for rhwp in the future.
   However, .hwp (binary) is the overwhelming majority in the current market, so priority is low.

3. **crates.io publication precedent**:
   Since hwpers is already published on crates.io, naming differentiation will be needed
   when rhwp publishes as a Rust crate.

4. **Writer compatibility lessons**:
   hwpers claimed to have fixed Hancom compatibility in v0.4.0,
   but the fact that v0.5.0 still can't open in Hancom shows
   just how challenging HWP Writer verification is.
   **Creating HWP from scratch is structurally very difficult.**
   rhwp's "round-trip preservation" strategy structurally avoids this problem.

### 6-3. Reaffirming rhwp's Differentiators

The comparison with hwpers makes rhwp's unique strengths even clearer:

| rhwp Unique Strength | Why hwpers Lacks It |
|---------------------|---------------------|
| WASM + web editor | Native-only design |
| Existing document modification (round-trip preservation) | Only supports new document creation |
| Sophisticated rendering (Canvas measurement) | Estimation-based rendering |
| 78 WASM APIs | No WASM support |
| 414 unit tests | 104 |
| Per-language font switching | Single font only |
| Formatting editing (bold/color/alignment) | No editing features |
| AI Agent tool goal | General-purpose library goal |

### 6-4. Market Positioning

```
                    Rendering Accuracy
                    ^
                    |
              rhwp  |  * (WASM+Canvas measurement, tables/images/shapes)
                    |
                    |
                    |
             hwpers |  o (estimation-based, text only)
                    |
                    └──────────────────────────────► Document Manipulation Capability
                         Read    Create    Modify    AI Agent Integration
                         only    only      capable   (MCP/PyPI)

                    hwpers: read + create
                    rhwp:   read + create + modify + render + AI integration
```

---

## 7. Blind Spots of AI Code Generation — hwpers Case Study

hwpers is a project developed with Claude Code. Supporting evidence:

| Evidence | Detail |
|----------|--------|
| `CLAUDE.md` present | Claude Code-specific project instruction file |
| Commit message pattern | Consistent structured format, characteristic AI-generated systematicity |
| Code generation pattern | API design is sophisticated, but binary compatibility verification absent |
| Co-Authored-By | Possible Claude-related signature |

### 7-1. What AI Code Generation Did Well

- **API design**: Clean fluent API patterns with `HwpWriter`, `TableBuilder`, `TextStyle`, etc.
- **Code structure**: Module separation, type system usage, error handling following Rust idioms
- **Documentation**: Systematic README, CHANGELOG, inline documentation
- **Test count**: 104 tests, 15 test files

### 7-2. What AI Code Generation Missed

| Issue | Detail |
|-------|--------|
| **Binary compatibility unverified** | Cannot verify generated HWP files by opening them in Hancom |
| **Serialization implementation gaps** | In-memory model is complete but serializer ignores table/image/text box controls |
| **Test blind spots** | 104 tests verify only in-memory models, not actual output binaries |
| **CHANGELOG exaggeration** | v0.4.0 states "Hancom compatibility fix complete," but files are still corrupted |
| **Dead code left unchecked** | `TableBuilder`, `add_image`, `add_text_box`, etc. are dead code that never gets serialized |
| **Weak roundtrip tests** | `writer_test.rs` only `println!`s the `is_ok()` result, no `assert!` |

### 7-3. Root Cause

AI code generation tools excel at:
- Type systems, API design, code structuring
- Writing unit tests (in-memory state verification)
- Documentation, comments, CHANGELOG writing

However, they cannot perform:
- **Integration verification with external programs** (opening files in Hancom)
- **Actual compatibility checking of binary formats** (subtle HWP spec requirements)
- **End-to-end verification** (create → save → load in external program → visual confirmation)

hwpers is a textbook example of **"tests passing != actually working."**
All 104 tests pass, but not a single file opens in Hancom.

### 7-4. Lessons for rhwp

1. **Hancom verification is essential**: Always verify by opening in Hancom after code changes
2. **Superiority of round-trip preservation strategy**: "From scratch" creation has many binary details
   that AI can easily miss. Preserving existing document structure and applying only changes is structurally safer
3. **Strengthen end-to-end tests**: Beyond unit tests, round-trip verification of actual file creation → parsing is essential
4. **Manual verification by the project lead**: The "open in Hancom" verification that AI cannot automate
   requires a human as the final gate

---

## 8. Conclusion

hwpers is significant as the first publicly available Rust crate for handling HWP files, but
it is **fundamentally different from rhwp in goals, architecture, and completeness**.

- hwpers = **"HWP read/write in Rust"** (general-purpose library, effectively unfinished)
- rhwp = **"A tool for AI Agents to manipulate HWP"** (AI-era specialized, verified to work)

The existence of hwpers does not significantly affect rhwp's strategy; rather,
it can be interpreted as a market signal that **"demand for programmatic HWP handling is real."**

hwpers is a project developed relying solely on AI code generation tools,
a typical case of falling into the trap of **"tests pass = actually works."**
Developed for approximately one year from v0.1.0 (2025-01) to v0.5.0 (2026-01),
there is a high probability that it never produced a single HWP file that Hancom could open normally.

What rhwp should focus on is not competing with hwpers,
but **completing the product by the end of March in its unique position as an "AI Agent tool."**

---

*Written: 2026-02-10*
*Analysis target: hwpers v0.5.0 (github.com/Indosaram/hwpers)*
