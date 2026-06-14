# Task 41 Step 1 Completion Report: Programmatic Table Insertion Verification into Existing HWP

## Work Performed

Programmatically inserted a table into an existing HWP document (`samples/20250130-hongbo.hwp`), saved it, and verified whether Hancom word processor opens it correctly.

## Key Findings

### 1. DocInfo Re-serialization Bug (Critical)

| Test File | Method | Result |
|-----------|--------|--------|
| `save_test_roundtrip.hwp` | Re-serialize both DocInfo + Section | File corruption |
| `save_test_docinfo_only.hwp` | Re-serialize DocInfo only | File corruption |
| `save_test_section_only.hwp` | Re-serialize Section only | Opens correctly |

**Conclusion**: DocInfo re-serialization causes file corruption in complex documents. Current workaround is to keep DocInfo `raw_stream` and re-serialize only Sections.

### 2. Table Insertion Method Comparison

| Method | Result | Notes |
|--------|--------|-------|
| Manual construction (direct Table creation) | Content after table disappears | Mismatches in attr, LineSeg, and other detailed fields |
| Clone existing table insertion | Opens correctly + full content displayed | Cloned paragraph[2]'s 1x4 table |

**Conclusion**: Insertion works correctly with the clone existing table approach. Field value issues in manually constructed tables are the cause.

### 3. Table Removal and Re-save Verification

`save_test_table_removed.hwp` (insert table -> save -> re-parse -> remove table -> re-save): Opens correctly, full content rendering confirmed. Section serialization code itself verified as working correctly.

## Technical Details

- **Test file**: `samples/20250130-hongbo.hwp` (32 paragraphs, 9 controls)
- **Caret position**: list_id=0, para_id=8, char_pos=0 (empty paragraph)
- **Clone source**: paragraph[2] (1x4 table, attr=0x082A2311, cc=9)
- **Insertion result**: 33 paragraphs (original 32 + table 1), 10 controls (Table 6->7)
- **Output file size**: 561,664 bytes

## Tests

- `test_inject_table_into_existing`: Passed
- Total tests: 473 passed

## Next Step

Step 2: Fix DIFF-1 (empty cell spaces), DIFF-5 (TABLE attr), DIFF-7 (instance ID) within `parse_table_html()`.
