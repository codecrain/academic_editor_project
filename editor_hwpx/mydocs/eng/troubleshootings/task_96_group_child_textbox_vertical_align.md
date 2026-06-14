# Group Child TextBox Vertical Alignment Not Applied

## Date
2026-02-16

## Related Task
Task 96 (Container/Group Rendering)

## Symptoms

- Vertical alignment (center) works correctly for standalone shapes (text boxes)
- When the same text box is grouped with an arrow image, vertical alignment is ignored
- `samples/basic/tbox-center.hwp` (standalone) -> vertical center alignment works
- `samples/basic/tbox-center-02.hwp` (grouped) -> vertical alignment not applied (top-aligned)

## Root Cause Analysis

### HWP Structure Differences

**Standalone shape** -- reads LIST_HEADER data through a separate TextBox parsing path:
```
CTRL_HEADER 'gso'
  SHAPE_COMPONENT
  SHAPE_COMPONENT_RECTANGLE
  LIST_HEADER  <- list_attr=0x00000020 (center), margins=(283,283,283,283)
    PARA_HEADER + PARA_TEXT + ...
```

**Group child** -- `parse_container_children()` encounters LIST_HEADER and skips it with `continue`:
```
CTRL_HEADER 'gso'
  SHAPE_COMPONENT (group container)
  SHAPE_COMPONENT_CONTAINER
    SHAPE_COMPONENT (child rectangle)
    SHAPE_COMPONENT_RECTANGLE
    LIST_HEADER  <- Data not parsed, skipped!
      PARA_HEADER + PARA_TEXT + ...
```

### Root Cause

In the `parse_container_children()` function (control.rs), when iterating through child shape records:

```rust
// Before fix
if record.tag_id == tags::HWPTAG_LIST_HEADER && !list_started {
    list_started = true;
    continue;  // <- LIST_HEADER data not read, skipped!
}
```

The LIST_HEADER record's data contains the following information:
- `para_count` (4 bytes)
- `list_attr` (4 bytes) -- bits 5-6: vertical alignment (0=top, 1=center, 2=bottom)
- `margin_left/right/top/bottom` (2 bytes each)
- `max_width` (4 bytes)

Because this data was not read, the TextBox's `list_attr` was always 0 (top alignment), and margins were all 0.

## Resolution

### 1. LIST_HEADER Data Capture and Parsing

Preserve the LIST_HEADER record data in `parse_container_children()`:

```rust
let mut list_header_data: Option<&[u8]> = None;
// ...
if record.tag_id == tags::HWPTAG_LIST_HEADER && !list_started {
    list_started = true;
    list_header_data = Some(&record.data);  // Capture data
    continue;
}
```

Parse attributes from LIST_HEADER data when creating the TextBox after paragraph collection:

```rust
if let Some(lh_data) = list_header_data {
    let mut lr = ByteReader::new(lh_data);
    let _para_count = lr.read_u32().unwrap_or(0);
    text_box.list_attr = lr.read_u32().unwrap_or(0);
    let v_align = ((text_box.list_attr >> 5) & 0x03) as u8;
    text_box.vertical_align = match v_align {
        1 => VerticalAlign::Center,
        2 => VerticalAlign::Bottom,
        _ => VerticalAlign::Top,
    };
    text_box.margin_left = lr.read_i16().unwrap_or(0);
    text_box.margin_right = lr.read_i16().unwrap_or(0);
    text_box.margin_top = lr.read_i16().unwrap_or(0);
    text_box.margin_bottom = lr.read_i16().unwrap_or(0);
    text_box.max_width = lr.read_u32().unwrap_or(0);
}
```

### 2. SHAPE_COMPONENT Inline Text Attributes (Fallback)

Extended the return type of `parse_shape_component_full()` to a 4-tuple to also return inline text attributes (Table 92) following the fill data. Used as a fallback when no LIST_HEADER record exists.

## Modified Files

| File | Changes |
|------|---------|
| `src/parser/control.rs` | `parse_container_children()`: LIST_HEADER data capture and parsing |
| `src/parser/control.rs` | `parse_shape_component_full()`: Return type extended to 4-tuple |

## Verification Results

| File | Before Fix | After Fix |
|------|-----------|-----------|
| tbox-center.svg (standalone) | Vertical center alignment works | Vertical center alignment works |
| tbox-center-02.svg (grouped) | Vertical alignment not applied (top) | Vertical center alignment works |
| KTX.hwp legend | Text clustered at top | Vertical center alignment applied |

Text Y coordinate comparison (after fix):
- Standalone shape: y=696.77, 723.43
- Group child: y=696.77, 723.43 (identical)

## Lessons Learned

- Group child shapes have a different parsing path than standalone shapes, so all record data must be accurately processed during record iteration
- Even records skipped with `continue` may contain important attributes in their data field
- When a feature works for standalone shapes but not for group children, suspect differences in parsing paths
