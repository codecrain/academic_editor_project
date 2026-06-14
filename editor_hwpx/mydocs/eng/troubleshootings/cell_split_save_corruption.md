# File Corruption After Cell Split and Save

## Symptoms

When creating a table in rhwp-studio, splitting cells, then saving, Hancom Office shows a "File is corrupted" error.
Opening the corrupted file in Hancom and saving with a different name makes the error disappear.

## Test Files

| File | Description | Status |
|------|-------------|--------|
| `saved/tb-err-003.hwp` | Table creation -> cell split -> save | **Corrupted** |
| `saved/tb-err-003-s.hwp` | Corrupted file saved-as in Hancom | Normal |

## Root Cause Analysis

### File Comparison Results

The **table structure (Table, Cell) was completely identical** between the two files:
- 3 rows x 5 columns, 11 cells
- row_sizes, col_count, row_count all match
- Per-cell col/row/col_span/row_span/width/height identical

**The difference was in the number of paragraphs outside the table**:

| | Corrupted File (5 paragraphs) | Normal File (3 paragraphs) |
|---|---|---|
| Paragraph[0] | SectionDef+ColumnDef | Same |
| Paragraph[1] | Table(3x5) | Same |
| **Paragraph[2]** | **Empty paragraph (ctrl_mask=0x00)** | Last paragraph (msb=true) |
| **Paragraph[3]** | **Orphan paragraph (see below)** | - |
| Paragraph[4] | Last paragraph (msb=true) | - |

### Root Cause: control_mask Mismatch in Orphan Paragraph

State of paragraph[3]:

| Field | Value | Problem |
|-------|-------|---------|
| `control_mask` | `0x00000800` (TABLE bit) | Actual controls array is **empty** |
| `has_para_text` | `true` | Neither text nor controls -- an **empty paragraph** |
| `char_count` | `1` | Only paragraph end marker exists |
| `controls` | `[]` | Empty array |

When this paragraph is serialized:

```
[Corrupted file - paragraph[3] serialization result]
PARA_HEADER: cc=1, ctrl_mask=0x800   <- Declares that a TABLE control record should follow
PARA_TEXT: [0D 00]                    <- PARA_TEXT exists for empty paragraph (cc=1 with PARA_TEXT -> corrupted)
PARA_CHAR_SHAPE
PARA_LINE_SEG
(No CTRL_HEADER)                     <- ctrl_mask=0x800 but no TABLE record present
```

Hancom's parser:
1. Sees `ctrl_mask=0x800` and expects a TABLE control record, but it doesn't exist
2. A PARA_TEXT record in a cc=1 (empty paragraph) is considered a record structure mismatch

Both mismatches occurring simultaneously result in the file being classified as corrupted.

### How the Orphan Paragraph Was Created

This occurs when a paragraph's `controls` array is modified but the `control_mask` field is not updated. For example:
- A table control was removed from an existing table paragraph, but `control_mask=0x800` was retained
- During paragraph split/copy, the original `control_mask` was inherited but `controls` is empty

## Fixes

### [FIX-1] Recompute control_mask at Serialization Time

**File**: `src/serializer/body_text.rs`

Instead of using the model's `control_mask` value as-is, **recompute it from the actual controls array** at serialization time.

```rust
/// Compute control_mask bits from the actual controls.
fn compute_control_mask(controls: &[Control]) -> u32 {
    let mut mask: u32 = 0;
    for ctrl in controls {
        let (char_code, _) = control_char_code_and_id(ctrl);
        mask |= 1u32 << char_code;
    }
    mask
}
```

Bit mapping:
- 0x0002 (SectionDef, ColumnDef) -> bit 2 = 0x04
- 0x000B (Table, Shape, Picture) -> bit 11 = 0x800
- 0x0010 (Header, Footer) -> bit 16 = 0x10000
- Other controls are also automatically mapped based on char_code

This ensures that when `controls=[]`, `control_mask=0`, matching Hancom's parser expectations.

### [FIX-2] Correct has_para_text at Serialization Time

**File**: `src/serializer/body_text.rs`

Prevent writing PARA_TEXT records for empty paragraphs (no text, no controls, char_count <= 1).

```
[Before fix]
if !para.text.is_empty() || !para.controls.is_empty() || para.has_para_text {
    // If has_para_text=true, writes PARA_TEXT even for empty paragraphs -> Hancom rejects

[After fix]
let has_content = !para.text.is_empty() || !para.controls.is_empty();
if has_content || (para.has_para_text && para.char_count > 1) {
    // Only write PARA_TEXT when there is actual content, or char_count > 1
```

This fix serves as a serialization-side defense layer for FIX-3 (corruption after two consecutive enters, see `table_paste_file_corruption.md`), also preventing `has_para_text` mismatches from paths other than `split_at()`.

## Modified Files

| File | Changes |
|------|---------|
| `src/serializer/body_text.rs` | Added `compute_control_mask()`, modified `serialize_paragraph_with_msb()` |

## Verification

```
[Before fix - paragraph[3] re-serialization result]
PARA_HEADER: ctrl_mask=0x800, cc=1
PARA_TEXT: [0D 00]           <- Unnecessary
-> Hancom "file corrupted" error

[After fix - paragraph[3] re-serialization result]
PARA_HEADER: ctrl_mask=0x000, cc=1
(No PARA_TEXT)               <- Correctly omitted for empty paragraph
-> Hancom opens normally
```

- 582 tests all passing
- WASM build successful
- TypeScript compilation successful
- Diagnostic test (`test_diag_tb_err_003`): 0 control_mask/has_para_text mismatches after re-serialization
- Confirmed normal opening in Hancom Office

## Related Documents

- `mydocs/troubleshootings/table_paste_file_corruption.md` -- FIX-3 (corruption after two consecutive enters: original discovery of the `has_para_text` issue)
- `mydocs/plans/task_135.md` -- Cell split feature implementation plan
