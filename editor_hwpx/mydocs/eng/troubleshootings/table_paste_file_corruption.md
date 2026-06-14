# File Corruption After Table Paste and Save

## Symptoms

After pasting an HTML table in the web viewer and saving as HWP, Hancom Office shows a "File is corrupted" error.
Content up to the point before the paste is rendered, but everything after the pasted table is not displayed.

## Test Files

### Simple Case (step1)
| File | Description | Status |
|------|-------------|--------|
| `template/empty.hwp` | Empty HWP document | Original |
| `template/empty-step1.hwp` | Manually created 2x2 table | Original |
| `template/empty-step1-p.hwp` | Pasted between HWP programs | Normal (reference) |
| `template/empty-step1_saved.hwp` | Pasted via our viewer | **Corrupted** |
| `template/empty-step1_saved-a.hwp` | Corrupted file saved-as in HWP | Normal |
| `template/empty-step1_saved_add_ccmsb.hwp` | Pasted via viewer after msb fix | **Normal** |

### Complex Case (step2)
| File | Description | Status |
|------|-------------|--------|
| `template/empty-step2.hwp` | Original (includes 2x2 table) | Original |
| `template/empty-step2-p.hwp` | Complex table pasted between HWP programs | Normal (reference) |
| `template/empty-step2_saved_err.hwp` | Complex table pasted via our viewer | **Corrupted** |

### Real Document Case
| File | Description | Status |
|------|-------------|--------|
| `pasts/20250130-hongbo-p2.hwp` | Original | Original |
| `pasts/20250130-hongbo_saved-rp-006.hwp` | Pasted via viewer | **Corrupted** |
| `template/20250130-hongbo_saved_err.hwp` | Pasted via viewer (complex) | **Corrupted** |
| `template/111111.hwp` | Corrupted file saved-as in HWP | Normal (some content missing) |

---

## List of Discovered Differences

### Already Fixed Items

#### [FIX-1] char_count_msb Flag (Simple case resolved -> Re-fixed in complex case)

- **Location**: Paragraph containing table control (PARA_HEADER)
- **Symptom**: Behavior differs based on bit 31 (MSB) setting of `char_count`
- **Simple case (empty document)**: MSB = 1 (true) required -> MSB=0 causes "file corrupted" error
- **Complex case (document with existing content)**: MSB = 0 (false) required -> MSB=1 causes content after the table to disappear
- **Root cause analysis**:
  - HWP spec: `if (nchars & 0x80000000) { nchars &= 0x7fffffff; }` -- only shows code that masks the MSB to get the actual character count, meaning is unexplained
  - In empty documents, MSB=1 is required (the table control is the only content)
  - In documents with existing content, MSB=0 is needed for paragraphs after the table to render correctly
  - Verified by checking MSB values of table paragraphs in actual HWP-generated files:
    - `template/empty-step1-p.hwp`: Table inserted in empty document -> MSB=1
    - `samples/20250130-hongbo.hwp`: Existing table paragraph -> MSB=0

- **Definitive root cause** (full scan of `samples/k-water-rfp.hwp`):

  The MSB is an end marker indicating **"the last paragraph in the current paragraph list (scope)."**

  | MSB Value | Meaning |
  |-----------|---------|
  | 0 | More paragraphs follow in the current scope |
  | 1 | Last paragraph of the current scope |

  Verification data:
  - Section 0: 57 paragraphs -> indices 0-55 all MSB=0, only index 56 (last) has MSB=1
  - Section 1: 265 paragraphs -> indices 0-263 all MSB=0, only index 264 (last) has MSB=1
  - Multiple paragraphs in a cell: only the last paragraph has MSB=1 (e.g., in cell[11] with 26 paragraphs, only p[25] has MSB=1)
  - **ParaShape changes do not affect MSB** -- determined purely by position

  This rule applies uniformly to all paragraph lists: sections, cells, text boxes, headers/footers, etc.

  Therefore, MSB=1 was required in the empty document case because the table paragraph was the only (= last) paragraph in the section. MSB=0 was needed in existing documents because more paragraphs follow after the table paragraph.

- **Final fix**: Set `char_count_msb: false` in `parse_table_html()`
  - Cell-internal paragraphs keep `char_count_msb: true` (set by cell adjustment code, since each cell has 1 paragraph, it is always the last)
  - The table paragraph itself (outer container) is `false` (unless the insertion position is the last paragraph)
  - Future improvement: MSB should be dynamically set based on insertion position

```
[Empty document case]
step1_saved (corrupted): rec[34] PARA_HEADER cc=9 msb=0  <- Last paragraph with MSB=0 -> corrupted
step1_saved-a (HWP fixed): rec[34] PARA_HEADER cc=9 msb=1  <- Last paragraph MSB=1 -> normal

[Existing document case - byte comparison]
Cloned table (normal): PARA_HEADER [09, 00, 00, 00, ...] -> cc=9, MSB=0  <- Middle paragraph, MSB=0 -> normal
Generated table (failed): PARA_HEADER [09, 00, 00, 80, ...] -> cc=9, MSB=1  <- Middle paragraph with MSB=1 -> content after disappears
Generated table (fixed): PARA_HEADER [09, 00, 00, 00, ...] -> cc=9, MSB=0  <- Middle paragraph MSB=0 -> normal

[k-water-rfp.hwp full scan]
Section 0 (57 paras): MSB_T=1 MSB_F=56  -> Only last has MSB=1
Section 1 (265 paras): MSB_T=1 MSB_F=264 -> Only last has MSB=1
cell[42] (3 paras): p[0] MSB=F, p[1] MSB=F, p[2] MSB=T  -> Only last has MSB=1
cell[11] (26 paras): p[0..24] MSB=F, p[25] MSB=T  -> Only last has MSB=1
```

#### [FIX-2] DIFF-1 through DIFF-8 Batch Fix (Task 41)

Fixed DIFF items:

| Item | Fix Description |
|------|----------------|
| DIFF-1 Empty cell space | In `html_to_plain_text()`, treat `&nbsp;` as empty cell (cc=1, no PARA_TEXT) |
| DIFF-2 CharShape ID | Add default CharShapeRef(id=0) for empty char_shapes |
| DIFF-3 ParaShape ID | Use default "Body" ParaShape(id=0) |
| DIFF-4 BorderFill ID | `create_border_fill_from_css()` + surgical insert for correct 1-based ID |
| DIFF-5 TABLE attr | `raw_table_record_attr = 0x04000006` (bit 1 no-cell-split always set) |
| DIFF-6 LineSeg metrics | tag=0x00060000, seg_width=cell_width-left_right_padding |
| DIFF-7 Instance ID | Hash-based non-zero instance_id generation |
| DIFF-8 Container LineSeg | Based on total_height, total_width |

#### [FIX-3] File Corruption After Two Consecutive Enters (Task 42)

- **Symptom**: Opening an existing HWP in the web viewer, pressing Enter twice in the middle of a paragraph, then saving causes a "file corrupted" error in the HWP program
- **Reproduction**: Enter once -> save = normal, Enter twice -> save = corrupted
- **Cause**: When `split_at(0)` is called, a paragraph with empty text (cc=1) is created, but `has_para_text=true` is retained, causing an unnecessary PARA_TEXT record ([0x000D] 1 code unit) to be serialized
  - Original HWP file's empty paragraphs (cc=1) have **no PARA_TEXT** (`has_para_text=false`)
  - The HWP program considers a PARA_TEXT record in a cc=1 paragraph as a record structure mismatch and reports file corruption
  - Our viewer's parser is more lenient, so re-parsing succeeds, but the HWP program rejects it

```
[Before fix - split-generated empty paragraph]
PARA_HEADER: cc=1
PARA_TEXT: 1 code_unit (0x000D)   <- HWP program rejects this
PARA_CHAR_SHAPE
PARA_LINE_SEG

[After fix - matches original HWP]
PARA_HEADER: cc=1
PARA_CHAR_SHAPE                   <- No PARA_TEXT
PARA_LINE_SEG
```

- **Fix**: After `split_at()`, if text is empty and there are no controls, set `has_para_text = false`
- **Modified file**: `src/model/paragraph.rs`
- **Verification**: 474 tests passing, confirmed normal opening in HWP program

#### [FIX-4] DocInfo Re-serialization Bug (Separate Issue)

- **Symptom**: Setting `doc_info.raw_stream = None` causes "file corrupted" error on complex documents
- **Cause**: DocInfo re-serialization code cannot fully reproduce some records
- **Workaround**: Keep DocInfo raw_stream, only re-serialize Sections
- **Verification**:
  - `save_test_section_only.hwp` (Section only re-serialization) -> Normal
  - `save_test_docinfo_only.hwp` (DocInfo only re-serialization) -> File corrupted
  - `save_test_roundtrip.hwp` (Full re-serialization) -> File corrupted
- **Status**: Workaround in effect (only partially modify raw_stream via surgical insert when DocInfo changes are needed)

#### [FIX-5] File Corruption Due to DocInfo raw_stream Invalidation After Text Editing

- **Symptom**: Opening an HWP document in rhwp-studio, adding/deleting text, then saving with Ctrl+S causes "file corrupted" error in Hancom Office
- **Reproduction**: Open document -> type or delete text -> save = corrupted. Open and save without changes = normal
- **Cause**: `insert_text_native()`, `delete_text_native()`, `delete_range_native()` set `doc_info.raw_stream = None` to update caret position, triggering the DocInfo re-serialization bug from FIX-4
  - Caret position (caret_list_id, caret_para_id, caret_char_pos) is located at DocInfo's DOCUMENT_PROPERTIES record offset 14-25 (each u32, 12 bytes)
  - Setting `raw_stream = None` causes the entire DocInfo to be re-serialized, producing incomplete records
- **Fix**: Implemented `surgical_update_caret()` function (src/serializer/doc_info.rs)
  - Searches for the DOCUMENT_PROPERTIES record in the DocInfo raw_stream using `scan_records()`
  - Directly modifies only bytes at offset 14-25 (12 bytes) to update caret position
  - Preserves the entire raw_stream, preventing re-serialization
- **Modified files**: `src/serializer/doc_info.rs`, `src/wasm_api.rs` (3 locations)
- **Verification**: 488 tests passing, save after text addition works, save after table paste works

---

### Unfixed Items (Complex Case)

step2 comparison baseline:
- **VALID** = `template/empty-step2-p.hwp` (pasted between HWP programs, normal)
- **DAMAGED** = `template/empty-step2_saved_err.hwp` (pasted via our viewer, corrupted)

#### [DIFF-1] Space Characters Inserted in Empty Cells (Record Structure Distortion)

- **Location**: Empty paragraph inside table cell (PARA_HEADER + PARA_TEXT)
- **Severity**: **High** -- Additional records shift all subsequent records
- **Symptom**:
  - VALID: Empty cell -> `char_count=1` (line break only), no PARA_TEXT record
  - DAMAGED: Empty cell -> `char_count=6` (5 spaces + line break), PARA_TEXT record added

```
VALID  rec[46]: PARA_HEADER cc=1 -> PARA_CHAR_SHAPE -> PARA_LINE_SEG
DAMAGED rec[46]: PARA_HEADER cc=6 -> PARA_TEXT("     \r") -> PARA_CHAR_SHAPE -> PARA_LINE_SEG
```

- **Cause**: `&nbsp;` in HTML cells is converted to spaces and not recognized as empty cells
  - `decode_html_entities()` converts `&nbsp;` -> space
  - `pc.content_html.trim().is_empty()` evaluates to `false` -> calls `parse_html_to_paragraphs()`
  - Result: Empty cells end up containing `"     "` text
- **Code location**: `wasm_api.rs:3870`

#### [DIFF-2] CharShape ID Loss (Uniform CS=0)

- **Location**: PARA_CHAR_SHAPE records of paragraphs inside table cells
- **Severity**: **Medium** -- Character formatting info lost, potential corruption cause
- **Symptom**:
  - VALID: Each cell has various CharShape IDs (CS5, CS6, CS7, CS8, ... CS19)
  - DAMAGED: All cells unified to `CS_id=0`

```
VALID DocInfo:  CS=20 (5 original + 15 pasted)
DAMAGED DocInfo: CS=8  (5 original + 3 pasted)
```

- **Cause**: CSS styles are parsed from HTML to generate CharShapes, but unlike native HWP paste which copies the original document's CharShapes directly, our code regenerates from CSS, losing subtle formatting differences
- **Code location**: `parse_html_to_paragraphs()` -> `parse_inline_content()` CharShape assignment

#### [DIFF-3] ParaShape ID Offset (ps=12 vs ps=13)

- **Location**: `para_shape_id` field in all PARA_HEADERs inside table cells
- **Severity**: **Low-Medium** -- Incorrect paragraph style reference
- **Symptom**:
  - VALID: `para_shape_id = 13` (newly added ParaShape)
  - DAMAGED: `para_shape_id = 12` (existing ParaShape)

- **Cause**: The `cell_para_shape_id` resolution logic reuses the ParaShape of the first table cell in the existing document, while the normal file creates a new ParaShape (ID=13) for pasting
- **Code location**: `wasm_api.rs:3882-3904`

#### [DIFF-4] BorderFill ID Offset (Consistently Off by 1)

- **Location**: `border_fill_id` field in all cells' LIST_HEADER
- **Severity**: **Medium** -- Incorrect border/background reference
- **Symptom**:
  - VALID: `borderFillId = 4, 5, 9, 6, 7, 8, ...`
  - DAMAGED: `borderFillId = 3, 4, 5, 6, 7, ...` (off by 1)

```
VALID DocInfo:  BF=17
DAMAGED DocInfo: BF=15
```

- **Cause**: ID assignment in `create_border_fill_from_css()` may differ. The HWP program copies the original document's BorderFills directly, while our code regenerates from CSS
- **Code location**: `wasm_api.rs` `create_border_fill_from_css()`

#### [DIFF-5] TABLE Record Attr Flag Difference

- **Location**: First u32 attr field of the HWPTAG_TABLE record
- **Severity**: **Low-Medium**
- **Symptom**:
  - VALID: `attr = 0x04000006` (bits 1,2 set: no cell split + repeat_header)
  - DAMAGED: `attr = 0x04000004` (bit 2 only: repeat_header only)

```
VALID:   low bits = 110 (bit1=no cell split, bit2=repeat_header)
DAMAGED: low bits = 100 (bit2=repeat_header only)
```

- **Cause**: Bit 1 (no cell split) not set when generating `raw_table_record_attr`
- **Code location**: `wasm_api.rs` table creation section

#### [DIFF-6] PARA_LINE_SEG Metrics Zero-Initialized

- **Location**: PARA_LINE_SEG records of all cell paragraphs
- **Severity**: **Low** -- Layout information lost (affects rendering)
- **Symptom**:
  - VALID: `segWidth=appropriate_value, flags=0x00060000`
  - DAMAGED: `segWidth=0, flags=0x00000000`

- **Cause**: `seg_width` and `flags` of LineSeg are set to default (0) when creating cell paragraphs. Normal files use `flags=0x00060000` (bits 17,18 = line type flags)
- **Code location**: `wasm_api.rs:3931-3959` cell paragraph adjustment code

#### [DIFF-7] CTRL_HEADER Instance ID Zero-Initialized

- **Location**: CTRL_HEADER record of the table control (offset 36-39)
- **Severity**: **Low**
- **Symptom**:
  - VALID: `instance_id = 0x7c154b69` (unique value)
  - DAMAGED: `instance_id = 0x00000000` (zero-initialized)

- **Cause**: The `raw_ctrl_data` should contain an instance_id field but is filled with zeros
- **Code location**: `raw_ctrl_data` generation section for table controls

#### [DIFF-8] Inaccurate Table Container PARA_LINE_SEG

- **Location**: PARA_LINE_SEG of the paragraph containing the table control (rec[37])
- **Severity**: **Low**
- **Symptom**:
  - VALID: `yPos=3130, height=26990, textHeight=26990, baseline=22942, segWidth=42520, flags=0x00060000`
  - DAMAGED: `yPos=0, height=400, textHeight=400, baseline=320, segWidth=0, flags=0x00000000`

- **Cause**: The LineSeg height of the table paragraph should reflect the total table height, but is set based on default font size (400)
- **Code location**: `wasm_api.rs:4131-4137` table paragraph LineSeg creation

#### [DIFF-9] BorderFill ID Difference in First (Original) Table

- **Location**: CTRL_HEADER and cell LIST_HEADER of the original 2x2 table
- **Severity**: **Low** -- Original table data changes during re-serialization
- **Symptom**:
  - VALID: `borderFillId = 3`
  - DAMAGED: `borderFillId = 2`

- **Cause**: When the entire section is re-serialized after setting `section.raw_stream = None`, the original table's BorderFill reference is presumably affected by the index offset of newly added BorderFills in DocInfo

---

## Record Structure Order Comparison

### Basic HWP Table Control Structure (Based on Normal Files)

```
L0: PARA_HEADER (paragraph containing table, cc=9, msb=1, cm=0x800)
L1:   PARA_TEXT (extended control char + end marker)
L1:   PARA_CHAR_SHAPE
L1:   PARA_LINE_SEG (reflects total table height)
L1:   CTRL_HEADER (tbl)
L2:     TABLE (attr, row_count, col_count, spacing, padding, row_sizes, borderFillId)
L2:     LIST_HEADER (cell[0]: n_para, list_attr, col, row, colspan, rowspan, w, h, padding, borderFillId)
L2:     PARA_HEADER (cell[0] para[0], cc, msb=1)
L3:       PARA_TEXT (cell text)      <- This record absent for empty cells!
L3:       PARA_CHAR_SHAPE
L3:       PARA_LINE_SEG
L2:     LIST_HEADER (cell[1])
L2:     PARA_HEADER (cell[1] para[0])
L3:       ...
```

### Our Code's Serialization Order

Generated in the same order. **The order itself is correct.**

```
serialize_table() -> CTRL_HEADER(tbl) [level]
                   -> TABLE [level+1]
                   -> serialize_cell() [level+1]
                     -> LIST_HEADER [level+1]
                     -> serialize_paragraph_list() [level+1]
                       -> PARA_HEADER [level+1]
                         -> PARA_TEXT [level+2]    <- Generated even for empty cells (DIFF-1)
                         -> PARA_CHAR_SHAPE [level+2]
                         -> PARA_LINE_SEG [level+2]
```

**Key structural difference**: Unnecessary PARA_TEXT records are added for empty cells, shifting all subsequent records

---

## Priority Assessment

| Priority | Item | Reason |
|----------|------|--------|
| 1 | DIFF-1 Empty cell space | Distorts record structure, high probability of parser errors |
| 2 | DIFF-2 CharShape ID | Out-of-range ID reference can directly cause corruption |
| 3 | DIFF-4 BorderFill ID | Out-of-range ID reference can directly cause corruption |
| 4 | DIFF-5 TABLE attr | Table attribute flag difference |
| 5 | DIFF-3 ParaShape ID | Paragraph style reference error |
| 6 | DIFF-6 LINE_SEG metrics | Layout quality (may not directly cause corruption) |
| 7 | DIFF-7 Instance ID | Quality (may not directly cause corruption) |
| 8 | DIFF-8 Table container LINE_SEG | Layout quality |
| 9 | DIFF-9 Original table BF ID | Re-serialization side effect |

---

## Related Code Locations

| File | Line | Description |
|------|------|-------------|
| `src/wasm_api.rs` | 3870 | Cell content parsing (empty cell detection) |
| `src/wasm_api.rs` | 3907-3960 | Cell paragraph adjustment code |
| `src/wasm_api.rs` | 4122-4145 | Table paragraph creation |
| `src/wasm_api.rs` | 4648-4676 | HTML entity decoding, html_to_plain_text |
| `src/serializer/control.rs` | 305-332 | serialize_table (record order) |
| `src/serializer/control.rs` | 377-421 | serialize_cell |
| `src/serializer/body_text.rs` | 50-111 | serialize_paragraph (PARA_TEXT generation conditions) |

---

## Test Code

| Test Name | Description |
|-----------|-------------|
| `test_template_comparison` | Record dump comparison for step1 files |
| `test_step2_comparison` | DocInfo + BodyText comparison for step2 files |
| `test_step2_paste_area` | Byte-level comparison of step2 paste area |
| `test_complex_comparison` | Complex file (hongbo) comparison |
| `test_rp006_dangling_references` | CharShape/ParaShape reference range validation for rp-006 |
