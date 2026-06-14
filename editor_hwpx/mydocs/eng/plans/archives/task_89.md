# Task 89: HWPX File Processing Support — Execution Plan

## 1. Goal

Parse HWPX (XML-based HWP) files and convert to the existing `Document` model, enabling identical processing in the viewer/editor as HWP binary files.

## 2. Background

- HWPX is the XML-based document format per KS X 6101:2024 standard (ZIP package)
- Expanding as default save format in Hancom Office 2022+
- Currently rhwp only supports HWP binary (.hwp)

## 3. HWPX Format Structure

```
document.hwpx (ZIP)
+-- version.xml              # Version info
+-- META-INF/
|   +-- manifest.xml         # Package manifest
|   +-- container.xml        # Container info
+-- Contents/
|   +-- content.hpf          # Package file list (OPF)
|   +-- header.xml           # Document metadata (fonts, styles, paragraph shapes, etc.)
|   +-- section0.xml         # Section body (paragraphs, tables, images, etc.)
|   +-- section1.xml         # ...
|   +-- masterpage0.xml      # Master page
+-- BinData/                 # Images, embedded files
    +-- image01.png
    +-- image02.jpg
```

## 4. Key XML Namespaces

| Prefix | URI | Purpose |
|--------|-----|---------|
| `hp` | `http://www.hancom.co.kr/hwpml/2011/paragraph` | Paragraphs, text runs, tables |
| `hs` | `http://www.hancom.co.kr/hwpml/2011/section` | Section structure |
| `hh` | `http://www.hancom.co.kr/hwpml/2011/head` | Header metadata |
| `hc` | `http://www.hancom.co.kr/hwpml/2011/core` | Core elements |
| `ha` | `http://www.hancom.co.kr/hwpml/2011/app` | App data |
| `hpf` | `http://www.hancom.co.kr/schema/2011/hpf` | Package structure |

## 5. Integration Strategy

```
HWPX (ZIP+XML)   --> parse_hwpx()  --> Document model  --> [existing pipeline]
HWP (CFB+Binary)  --> parse_hwp()   --> Document model  --> compose -> paginate -> render
```

**Key**: The HWPX parser outputs the existing `Document` model. The subsequent composition/pagination/rendering/editing pipeline is reused without changes.

**Format auto-detection**: Distinguished by file magic bytes
- `D0 CF 11 E0` → HWP (CFB/OLE)
- `50 4B 03 04` → HWPX (ZIP)

## 6. Reference Materials

| Material | Path |
|----------|------|
| Python HWPX parser | `/home/edward/vsworks/shwp/hwp_semantic/hwpx/` |
| Rust openhwp HWPX crate | `/home/edward/vsworks/shwp/openhwp/crates/hwpx/` |
| HWPX spec documents | `/home/edward/vsworks/shwp/openhwp/docs/hwpx/` |
| python-hwpx library | `/home/edward/vsworks/shwp/python-hwpx/` |
| Sample HWPX files | `/home/edward/vsworks/shwp/samples/hwpx/`, `samples/seoul/` |

## 7. Scope

### Included (Phase 1)

- ZIP container reading
- header.xml parsing (fonts, char shapes, paragraph shapes, styles, border fills)
- section*.xml parsing (paragraphs, text runs, tables, images)
- BinData image loading
- Format auto-detection (HWP/HWPX)
- Web frontend .hwpx file acceptance
- Basic controls (section definition, tab, line break)

### Excluded (Future)

- HWPX export/save
- Advanced controls (fields, bookmarks, headers/footers, footnotes)
- Drawing objects (shapes, text art)
- OLE, equations, charts
- Change tracking, digital signatures
- Encrypted documents

## 8. Required Dependency Additions

```toml
# Cargo.toml
zip = "2.6"          # ZIP container reading
quick-xml = "0.37"   # XML parsing
```

## 9. Expected File Structure

```
src/parser/
+-- mod.rs                 # Modify: expose parse_hwpx(), format detection
+-- hwpx/
    +-- mod.rs             # HWPX parser entry point
    +-- reader.rs          # ZIP container reading
    +-- header.rs          # header.xml -> DocInfo conversion
    +-- section.rs         # section*.xml -> Section conversion
    +-- content.rs         # content.hpf parsing (section list)
```

## 10. Verification

1. Load sample HWPX file → Document model creation confirmed
2. HWPX file rendering in web viewer confirmed (same layout as existing HWP)
3. Rust tests: HWPX parsing → section/paragraph/table structure verification
4. Existing HWP feature regression tests pass
