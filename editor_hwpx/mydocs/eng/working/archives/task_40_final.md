# Task 40: HWP Save Basic Feature Implementation - Final Report

## Overview

A task to add controls one by one to an empty HWP document, save, and verify that Hancom word processor opens them correctly, while writing technical documentation for each control's save process.

## Steps and Results

### Step 1: Spec Cross-Verification and Technical Document Draft

- HWP 5.0 binary spec and HWPML 3.0 spec cross-verification completed
- Required record matrix per control type organized
- `mydocs/tech/hwp_save_guide.md` draft written

### Step 2: Text Save Verification

| File | Inserted Text | HWP Open |
|------|--------------|----------|
| save_test_korean.hwp | Korean characters | Pass |
| save_test_english.hwp | Hello World | Pass |
| save_test_mixed.hwp | Korean + Hello + 123 + !@# | Pass |

### Step 3: Table Save Verification

| File | Content | Records | HWP Open |
|------|---------|---------|----------|
| save_test_table_1x1.hwp | 1x1 empty cell table | 21 (same as reference) | Pass |

Key discovery: Table paragraphs require exactly 2 (table + blank line), segment_width=0, control_mask=0x00000804

### Step 4: Image (Picture) Save Verification

| File | Content | Records | HWP Open |
|------|---------|---------|----------|
| save_test_picture.hwp | 3tigers.jpg inline insertion | 15 (14/15 match) | Pass |

Key discovery: SHAPE_COMPONENT ctrl_id '$pic' written twice, tag=85 (SHAPE_PICTURE), border coordinate pattern

### Step 5: Other Control Round-trip Verification

| Sample File | Target Controls | Preserved |
|-------------|----------------|-----------|
| k-water-rfp.hwp | Header(3), Footer(2), Shape(2), Picture(15), Table(19) | All Pass |
| 20250130-hongbo.hwp | Shape(1), Picture(4), Table(6) | All Pass (100% match) |
| hwp-multi-001.hwp | Shape(1), Picture(2), Table(26) | All Pass |
| hwp-multi-002.hwp | Picture(3), Table(7) | All Pass |
| 2010-01-06.hwp | Footnote(30), Table(12) | All Pass |

### Additional Verification: Image Inside Table

| File | Content | Records | HWP Open |
|------|---------|---------|----------|
| save_test_pic_in_table.hwp | Image inside 1x1 table cell | 25 (21/25 match) | Pass |

## Modified/Created Files

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | 7 save test functions added |
| `mydocs/tech/hwp_save_guide.md` | Per-control save technical guide (new, 423 lines) |
| `src/serializer/body_text.rs` | raw_break_type preservation fix |
| `src/model/paragraph.rs` | raw_break_type field added |

## Test Function List

| Function Name | Purpose |
|---------------|---------|
| test_save_text_only | Korean/English/mixed text save |
| test_save_table_1x1 | 1x1 table FROM SCRATCH save |
| test_analyze_reference_picture | Image reference file analysis |
| test_save_picture | Image FROM SCRATCH save |
| test_analyze_pic_in_table | Image-in-table reference file analysis |
| test_save_pic_in_table | Image-in-table FROM SCRATCH save |
| test_roundtrip_all_controls | Other control round-trip verification |

## Build Verification

- **cargo test**: 473 all passed
- **wasm-pack build**: Build succeeded

## Deliverables

### Technical Document
- `mydocs/tech/hwp_save_guide.md` -- Per-control save technical guide
  - Spec cross-verification results
  - Control character size rules
  - Per-control save verification records
  - Known limitations

### Save Test Output Files
- `output/save_test_korean.hwp`
- `output/save_test_english.hwp`
- `output/save_test_mixed.hwp`
- `output/save_test_table_1x1.hwp`
- `output/save_test_picture.hwp`
- `output/save_test_pic_in_table.hwp`

## Known Limitations

1. Header/Footer LIST_HEADER serialization size difference compared to original (no functional impact)
2. ColumnDef extended attributes not preserved (multi-column documents)
3. Endnote/Bookmark verification samples not available
4. char_shape_id/para_shape_id differences (when using empty.hwp defaults)

---

**Written**: 2026-02-11
