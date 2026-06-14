# Task 241 Implementation Plan: HWPTAG_CTRL_DATA Full Cross-Check

## Phase-by-Phase Implementation Plan

### Phase 1: FIELD_BOOKMARK Investigation and Hancom Bookmark Source Identification

- Directly search for `%bmk` ctrl_id in synam-001.hwp binary
- Investigate the actual source of names displayed in Hancom "Go to > Bookmark"
  - CTRL_BOOKMARK (bokm) CTRL_DATA ParameterSet
  - FIELD_BOOKMARK (%bmk) field control
  - Field's command string or ctrl_data_name
- Aggregate control type counts for fields/bookmarks across multiple sample HWP files
- Document results

### Phase 2: New Bookmark CTRL_DATA ParameterSet Generation

- Generate CTRL_DATA record when adding new Bookmark via `add_bookmark_native()`
  - ParameterSet binary structure: id(0x021B) + count(1) + dummy(0) + item(id=0x4000, type=String, value=name)
- Add `build_bookmark_ctrl_data(name: &str) -> Vec<u8>` function to `bookmark_query.rs`
- Insert generated CTRL_DATA into `para.ctrl_data_records` at correct index
- Synchronize CTRL_DATA on deletion/renaming as well
- Verify cargo test passes

### Phase 3: Other Control CTRL_DATA Investigation and Documentation

- Identify CTRL_DATA usage for 7 control types (SectionDef, Table, Picture, Rectangle, GSO, etc.) based on hwplib
- Document which ParameterSet id/items are used by each control
- Dump actual CTRL_DATA content from sample files → verify structure
- Write `mydocs/tech/hwp_ctrl_data.md` technical document
- Identify items requiring immediate parsing (determine if raw round-trip is sufficient for now)
