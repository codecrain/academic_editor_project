# Task 241 - Stage 1 Completion Report: FIELD_BOOKMARK Investigation and Hancom Bookmark Origin Identification

## Key Findings

### 1. synam-001.hwp Binary Analysis Results

| Item | Count |
|------|-------|
| `%bmk` (FIELD_BOOKMARK) ctrl_id | **0** |
| `bokm` (CTRL_BOOKMARK) in CTRL_HEADER | **0** |
| `bokm` in PARA_TEXT (char code 22) | **10** (10 out of 20 byte sequences are CTRL_DATA) |
| CTRL_HEADER total | 114 (all $pic, $rec, $con, etc.) |

### 2. Bookmark Storage Mechanism Identified

In HWP 5.0, bookmarks are stored in **two different ways**:

#### Method A: CTRL_HEADER + CTRL_DATA (our parsing method)
- CTRL_HEADER record with ctrl_id=bokm
- Following CTRL_DATA contains ParameterSet → name
- **synam-001.hwp has 0 of this type**

#### Method B: PARA_TEXT inline (char code 22) + CTRL_DATA
- Char code 0x0016 (22) = 16-byte extended char inside PARA_TEXT
- First 4 bytes of additional 12 bytes = ctrl_id (bokm)
- **No separate CTRL_HEADER record**
- Name stored in CTRL_DATA of the same paragraph
- **synam-001.hwp has 10 of this type**

### 3. Issues with Our Parser

1. `is_extended_only_ctrl_char(22)` = true → `ctrl_idx += 1` executed
2. But no corresponding CTRL_HEADER record exists
3. ctrl_idx gets misaligned, creating Bookmark from wrong CTRL_HEADER data
4. One accidentally matched (para=247 is a top-level body paragraph)

### 4. hwplib Also CTRL_HEADER-Based

hwplib's `ForParagraph.control()` also parses based on CTRL_HEADER records.
Further investigation needed on how hwplib handles inline-only bookmarks with char code 22.
→ hwplib may also have separate handling for inline bookmarks without CTRL_HEADER

### 5. FIELD_BOOKMARK (%bmk) Absence

synam-001.hwp has no `%bmk` signature in the binary at all.
Hancom's "Go To > Bookmarks" list comes entirely from **char code 22 based CTRL_BOOKMARK (bokm)**.

## Work Required for Next Stage

1. Add char code 22 dedicated bookmark parsing path (PARA_TEXT inline → Bookmark control creation)
2. Extract name from paragraph's CTRL_DATA
3. Compensate for CTRL_HEADER absence of char 22 in `ctrl_idx` calculation
