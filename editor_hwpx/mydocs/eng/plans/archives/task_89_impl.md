# Task 89: HWPX File Processing Support — Implementation Plan

## Implementation Steps (4 steps)

---

### Step 1: Dependency Addition + ZIP Container + Format Auto-Detection

**Goal**: Build foundation for opening HWPX ZIP files and reading internal file lists, HWP/HWPX format auto-detection

**Modified files**:
- `Cargo.toml` — add `zip`, `quick-xml` dependencies
- `src/parser/mod.rs` — declare `hwpx` submodule, add `detect_format()`, `parse_auto()`
- `src/parser/hwpx/mod.rs` — HWPX parser entry point (`parse_hwpx()`)
- `src/parser/hwpx/reader.rs` — ZIP container reading (`HwpxReader`)
- `src/parser/hwpx/content.rs` — `content.hpf` parsing (section file list extraction)

**Implementation**:
```rust
// Format auto-detection
pub enum FileFormat { Hwp, Hwpx, Unknown }
pub fn detect_format(data: &[u8]) -> FileFormat;

// HwpxReader: ZIP container wrapper
pub struct HwpxReader { archive: ZipArchive<Cursor<Vec<u8>>> }
impl HwpxReader {
    pub fn open(data: &[u8]) -> Result<Self, HwpxError>;
    pub fn read_header_xml(&mut self) -> Result<String, HwpxError>;
    pub fn read_section_xml(&mut self, index: usize) -> Result<String, HwpxError>;
    pub fn read_bin_data(&mut self, path: &str) -> Result<Vec<u8>, HwpxError>;
    pub fn section_count(&self) -> usize;  // extracted from content.hpf
}
```

**Verification**: `docker compose run --rm test` — ZIP open/magic byte detection tests pass

---

### Step 2: header.xml Parsing → DocInfo Conversion

**Goal**: Parse HWPX header.xml and convert to existing `DocInfo` model (fonts, char shapes, paragraph shapes, styles, border fills)

**Modified files**:
- `src/parser/hwpx/header.rs` — header.xml parsing module

**Implementation**:
```rust
pub fn parse_hwpx_header(xml: &str) -> Result<(DocInfo, DocProperties), HwpxError>;
```

Key mappings:
| HWPX XML Element | → | Document Model |
|-------------------|---|----------------|
| `<hh:fontface>/<hh:font face="...">` | → | `DocInfo.font_faces[lang][i].name` |
| `<hh:charPr id="N" height="H">` + `<hh:bold/>` etc. | → | `DocInfo.char_shapes[N]` |
| `<hh:paraPr id="N">/<hh:align>/<hh:margin>` | → | `DocInfo.para_shapes[N]` |
| `<hh:style id="N" paraPrIDRef="P" charPrIDRef="C">` | → | `DocInfo.styles[N]` |
| `<hh:borderFill>` | → | `DocInfo.border_fills[N]` |
| `<hh:numbering>/<hh:paraHead>` | → | `DocInfo.numberings[N]` |
| `<hh:tabPr>` | → | `DocInfo.tab_defs[N]` |

**Reference**: openhwp crate's `header/` module + Python `header_parser.py`

**Verification**: Sample HWPX header.xml parsing → DocInfo field verification tests

---

### Step 3: section*.xml Parsing → Section/Paragraph/Control Conversion

**Goal**: Parse HWPX section XML and convert to existing `Section` model (paragraphs, tables, images, section definition)

**Modified files**:
- `src/parser/hwpx/section.rs` — section XML parsing module

**Implementation**:
```rust
pub fn parse_hwpx_section(xml: &str) -> Result<Section, HwpxError>;
```

Key mappings:
| HWPX XML Element | → | Document Model |
|-------------------|---|----------------|
| `<hs:secPr>/<hs:pagePr>/<hs:margin>` | → | `Section.section_def.page_def` |
| `<hp:p paraPrIDRef="P" styleIDRef="S">` | → | `Paragraph { para_shape_id, style_id, ... }` |
| `<hp:run charPrIDRef="C">/<hp:t>` | → | `Paragraph.text` + `Paragraph.char_shapes` |
| `<hp:tbl>/<hp:tr>/<hp:tc>` | → | `Control::Table(Table { cells, ... })` |
| `<hp:pic>/<hp:img binaryItemIDRef>` | → | `Control::Picture(...)` |
| `<hp:tab/>`, `<hp:lineBreak/>` | → | Control characters (`\t`, line break) |

Processing order:
1. Section definition (`<secPr>`) → `SectionDef` + `PageDef`
2. Paragraph (`<p>`) iteration → extract text/controls from each paragraph's runs (`<run>`)
3. Table (`<tbl>`) → `Table`/`Cell` structure (recursive — nested table support)
4. Image (`<pic>`) → `Control::Picture` (BinData ID linking)
5. BinData loading → `bin_data_content` (ZIP's `BinData/` folder)

**Verification**: Sample HWPX parsing → section/paragraph/table/image structure verification tests

---

### Step 4: WASM/Frontend Integration + Build + Verification

**Goal**: Load and render .hwpx files in web viewer

**Modified files**:
- `src/wasm_api.rs` — apply format auto-detection to `from_bytes()`
- `rhwp-studio/src/main.ts` — accept `.hwpx` files
- `rhwp-studio/src/core/wasm-bridge.ts` — file extension handling

**Implementation**:

```rust
// wasm_api.rs — from_bytes() modification
pub fn from_bytes(data: &[u8]) -> Result<HwpDocument, HwpError> {
    let document = match crate::parser::detect_format(data) {
        FileFormat::Hwpx => crate::parser::hwpx::parse_hwpx(data)
            .map_err(|e| HwpError::InvalidFile(format!("HWPX: {}", e)))?,
        _ => crate::parser::parse_hwp(data)
            .map_err(|e| HwpError::InvalidFile(e.to_string()))?,
    };
    // Subsequent pipeline identical (compose, paginate, render)
    ...
}
```

```typescript
// main.ts — file extension check
const ext = file.name.toLowerCase().split('.').pop();
if (!['hwp', 'hwpx'].includes(ext ?? '')) {
    alert('Only HWP and HWPX files are supported.');
    return;
}
```

**Verification**:
1. `docker compose run --rm test` — all Rust tests pass
2. `docker compose run --rm wasm` — WASM build success
3. `npm run build` — Vite build success
4. Load sample HWPX file in web viewer → rendering confirmed

---

## Modified Files Summary

| File | Step | Changes |
|------|------|---------|
| `Cargo.toml` | 1 | Add `zip`, `quick-xml` dependencies |
| `src/parser/mod.rs` | 1 | `hwpx` module declaration, `detect_format()`, `FileFormat` |
| `src/parser/hwpx/mod.rs` | 1 | HWPX parser entry point `parse_hwpx()` |
| `src/parser/hwpx/reader.rs` | 1 | ZIP container reading `HwpxReader` |
| `src/parser/hwpx/content.rs` | 1 | content.hpf parsing (section list) |
| `src/parser/hwpx/header.rs` | 2 | header.xml → DocInfo conversion |
| `src/parser/hwpx/section.rs` | 3 | section*.xml → Section conversion |
| `src/wasm_api.rs` | 4 | Apply format detection to `from_bytes()` |
| `rhwp-studio/src/main.ts` | 4 | Accept `.hwpx` files |
| `rhwp-studio/src/core/wasm-bridge.ts` | 4 | File name handling |

## Dependency Diagram

```
[HWPX File (ZIP)]
     |
     v
  HwpxReader (reader.rs)        <- zip crate
     |
     +-- content.hpf -> section list (content.rs)
     +-- header.xml -> DocInfo    (header.rs)    <- quick-xml
     +-- section*.xml -> Section  (section.rs)   <- quick-xml
     +-- BinData/* -> bin_data_content
     |
     v
  Document model (existing)
     |
     v
  [Existing pipeline: compose -> paginate -> render]
```
