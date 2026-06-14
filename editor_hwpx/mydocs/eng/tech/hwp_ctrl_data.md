# HWPTAG_CTRL_DATA Analysis (hwplib Cross-Check)

## Overview

HWPTAG_CTRL_DATA (tag = HWPTAG_BEGIN + 71) is a record that stores supplementary control data in ParameterSet format.
It is located immediately after CTRL_HEADER and contains information such as control names/properties.

## ParameterSet Binary Structure

```
offset  size  description
0       2     ps_id (UINT16) - ParameterSet ID (e.g., 0x021B = field/bookmark name)
2       2     count (INT16) - number of parameter items
4       2     dummy (UINT16) - reserved
6+      var   ParameterItem[] x count
```

### ParameterItem Structure

```
offset  size  description
0       2     item_id (UINT16) - item ID (e.g., 0x4000 = name)
2       2     item_type (UINT16) - data type
4+      var   value - varies by type
```

### ParameterType Values

| Value | Name | Size |
|---|------|------|
| 0x0000 | NULL | 0 |
| 0x0001 | String | 2 + N*2 (len + UTF-16LE) |
| 0x0002 | Integer1 | 4 |
| 0x0003 | Integer2 | 4 |
| 0x0004 | Integer4 | 4 |
| 0x0005 | Integer | 4 |
| 0x0006 | UnsignedInteger1 | 4 |
| 0x0007 | UnsignedInteger2 | 4 |
| 0x0008 | UnsignedInteger4 | 4 |
| 0x0009 | UnsignedInteger | 4 |
| 0x8000 | ParameterSet | Recursive (nested ParameterSet) |
| 0x8001 | Array | 2(count) + 2(id) + items... |
| 0x8002 | BINDataID | 2 |

## Controls That Use CTRL_DATA (7 types per hwplib)

### 1. Bookmark (bokm) -- Implemented

- **Parsing**: CTRL_DATA -> ParameterSet -> name extraction
- **Creation**: `build_bookmark_ctrl_data(name)` -> ParameterSet binary generation
- **ps_id**: 0x021B, item_id: 0x4000, type: String
- **Example**: `1b 02 01 00 00 00 00 40 01 00 10 00 [UTF-16LE name]`

### 2. Field (%clk, %hlk, etc.) -- Implemented

- **Parsing**: CTRL_DATA -> `field.ctrl_data_name` extraction
- Same ParameterSet structure (ps_id=0x021B, item_id=0x4000)
- Field name stored separately from the command string

### 3. SectionDef (secd) -- Raw Round-Trip Preserved

- hwplib: `ForControlSectionDefine.java` -> CtrlData reading
- Supplementary metadata for section settings
- **Current impact**: None (round-trip normal via raw bytes preservation)

### 4. Table (tbl) -- Raw Round-Trip Preserved

- hwplib: `ForControlTable.java` -> CtrlData reading
- Supplementary metadata for tables
- **Current impact**: None

### 5. Picture ($pic) -- Raw Round-Trip Preserved

- hwplib: `ForControlPicture.java` -> CtrlData reading (GSO common)
- Supplementary metadata for picture objects
- **Current impact**: None

### 6. Rectangle ($rec) -- Raw Round-Trip Preserved

- hwplib: `ForControlRectangle.java` -> CtrlData reading (GSO common)
- Supplementary metadata for rectangles/text boxes
- **Current impact**: None

### 7. Other GSO (Line/Circle/Arc/Polygon/Curve/OLE/Group) -- Raw Round-Trip Preserved

- hwplib: `ForGsoControl.java` -> captionAndCtrlData() common handling
- **Current impact**: None

## Our Implementation Status

| Item | Status |
|------|--------|
| CTRL_DATA raw bytes preservation (round-trip) | `para.ctrl_data_records` |
| Bookmark name extraction | `parse_ctrl_data_field_name()` |
| Field name extraction | `field.ctrl_data_name` |
| New bookmark CTRL_DATA creation | `build_bookmark_ctrl_data()` |
| Bookmark delete/rename synchronization | Done |
| Other control structural parsing | Not needed (raw preservation is sufficient) |
| CTRL_DATA creation for new controls | Only bookmark implemented, others not implemented |

## Future Enhancement Targets

1. **Cursor navigation within table cells**: Add cellPath to BookmarkInfo -> precise position navigation for bookmarks inside tables
2. **FIELD_BOOKMARK (%bmk)**: Not found in current target files, add parsing if needed
3. ~~New control creation~~: Tables/pictures etc. can be inserted without CTRL_DATA -> serialization -> Hancom load confirmed successful. CTRL_DATA is an optional record.
