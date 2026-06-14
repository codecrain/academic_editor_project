# Task 11: Caption Handling (Table/Image) - Completion Report

## Overview

Implemented caption parsing and rendering for HWP Table and Picture controls.

---

## Implementation Details

### Step 1: Model Changes
- `src/model/table.rs`: Added `caption: Option<Caption>` field to Table struct
- `src/model/shape.rs`: Added `include_margin: bool` field to Caption struct

### Step 2: Caption Parsing Function
- `src/parser/control.rs`: Implemented `parse_caption()` function
  - LIST_HEADER common fields (6 bytes) parsing
  - Caption attributes (4 bytes): direction, include_margin
  - Caption width, spacing, max width parsing
  - Caption internal paragraph list parsing

### Step 3: Table/Picture Caption Integration
- `parse_table_control()`: Treats LIST_HEADER before HWPTAG_TABLE as caption
- `parse_gso_control()`: Added Picture object caption parsing

### Step 4: Renderer Implementation
- `src/renderer/layout.rs`:
  - `calculate_caption_height()`: Caption height calculation
  - `layout_caption()`: Caption paragraph rendering
  - `layout_table()`: Table caption rendering (Top/Bottom direction support)
- `src/renderer/height_measurer.rs`:
  - `MeasuredTable.caption_height` field added
  - `measure_caption()`: Caption height measurement

---

## Test Results

```
running 219 tests
...
test result: ok. 219 passed; 0 failed; 0 ignored
```

---

## Changed Files

| File | Changes |
|------|---------|
| `src/model/table.rs` | caption field added, Caption import |
| `src/model/shape.rs` | include_margin field added |
| `src/parser/control.rs` | parse_caption(), table/picture caption parsing |
| `src/renderer/layout.rs` | Caption rendering functions |
| `src/renderer/height_measurer.rs` | Caption height measurement |

---

## Caption Direction Support

| Direction | Support | Notes |
|-----------|---------|-------|
| Top | Supported | Caption above table/image |
| Bottom | Supported | Caption below table/image |
| Left | Partial | Falls back to Bottom |
| Right | Partial | Falls back to Bottom |

---

## Limitations and Future Work

1. **Left/Right captions**: Currently fall back to Bottom. Full support requires additional layout logic
2. **Caption styling**: Caption paragraph CharShape style application works identically to existing paragraph rendering

---

*Written: 2026-02-06*
