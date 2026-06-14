# Task 11: Caption Handling (Table/Image)

## Overview

Implement parsing and rendering of captions for HWP Table and Picture controls.

---

## Current Status

### Table
| Item | Status | Notes |
|------|--------|-------|
| Table.caption field | Not present | Needs addition |
| Caption parsing | Not implemented | Needs implementation in control.rs |
| Caption rendering | Not implemented | Needs implementation in layout.rs |

### Picture
| Item | Status | Notes |
|------|--------|-------|
| Picture.caption field | Exists | `src/model/image.rs` |
| Caption parsing | Not implemented | Needs implementation in parse_picture() |
| Caption rendering | Not implemented | Needs implementation in layout.rs |

### Common
| Item | Status | Notes |
|------|--------|-------|
| Caption struct | Exists | `src/model/shape.rs` |

---

## HWP Spec Reference

### Table 70: Common Object Attributes
- Caption list info is included after common object attributes
- **Both tables and pictures use the same caption structure**

### Table 73: Caption List
| Type | Length | Description |
|------|--------|-------------|
| BYTE stream | n | Paragraph list header (Table 65) |
| BYTE stream | 14 | Caption (Table 74) |

### Table 74: Caption Data (14 bytes)
| Type | Length | Description |
|------|--------|-------------|
| UINT | 4 | Attributes (Table 75) |
| HWPUNIT | 4 | Caption width (for vertical direction) |
| HWPUNIT16 | 2 | Caption-frame spacing |
| HWPUNIT | 4 | Max text length |

### Table 75: Caption Attributes
| Range | Category | Value | Description |
|-------|----------|-------|-------------|
| bit 0~1 | Direction | 0=left, 1=right, 2=top, 3=bottom |
| bit 2 | Include margin in width | Used only for horizontal direction |

---

## Implementation Steps

### Step 1: Model Modification
- `src/model/table.rs`: Add `caption: Option<Caption>` field to Table struct
- `src/model/shape.rs`: Add `include_margin: bool` field to Caption struct

### Step 2: Parser Implementation
- `src/parser/control.rs`:
  - Implement common caption parsing function `parse_caption()`
  - `parse_table_control()`: Add caption parsing
  - `parse_gso_control()` → `parse_picture()`: Add caption parsing

### Step 3: Renderer Implementation
- `src/renderer/layout.rs`:
  - Implement common caption rendering function
  - `layout_table()`: Add caption rendering
  - `layout_body_picture()`: Add caption rendering
- `src/renderer/height_measurer.rs`: Add caption height calculation

### Step 4: Testing and Verification
- Test with HWP files containing captions (tables, images)
- SVG output verification
- Caption position/style verification

---

## Expected Files to Modify

| File | Task |
|------|------|
| `src/model/table.rs` | Add caption field |
| `src/model/shape.rs` | Add include_margin field |
| `src/parser/control.rs` | parse_caption(), table/picture caption parsing |
| `src/renderer/layout.rs` | Caption rendering logic |
| `src/renderer/height_measurer.rs` | Caption height calculation |

---

## Verification Method

```bash
docker compose run --rm dev cargo run -- export-svg "samples/table-caption.hwp" --output output/
docker compose run --rm dev cargo run -- export-svg "samples/image-caption.hwp" --output output/
```

- Verify caption text displays correctly above/below table/image
- Verify caption styles (font, alignment) are correct

---

## Risk Factors

1. **Caption presence detection**: Need to determine which bit in common attributes indicates caption existence
2. **Directional caption layout**: left/right directions require complex layout as they're placed beside the object
3. **Complex paragraphs in captions**: Captions may contain styles, inline images, etc.

---

*Created: 2026-02-06*
