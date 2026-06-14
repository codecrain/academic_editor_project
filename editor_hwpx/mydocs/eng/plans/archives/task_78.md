# Task 78 Execution Plan: 2 Images Missing on Page 2 of 20250130-hongbo.hwp

## Background

Page 2 of `samples/20250130-hongbo.hwp` should render 2 images but only 1 is displayed.

### Document Structure (page 2 relevant section)

Paragraph 25 has a GSO control (rectangle), with actual structure:

```
GSO Control (treat_as_char=true, w=25698, h=3736)
+-- Rectangle
   +-- TextBox
      +-- Paragraph (right-aligned)
         +-- Inline Picture 1 (bin_data_id=4)
         +-- Inline Picture 2
```

### Current Rendering

| Expected | Actual |
|----------|--------|
| 2 images inside rectangle | Only 1 image rendered (bin_data_id=4, 66x23px) |

### Root Cause

**Misidentified group container** in `parse_gso_control()` (control.rs:332-334):

```rust
// Legacy Group detection condition
if child_records[1..].iter().any(|r|
    r.tag_id == tags::HWPTAG_SHAPE_COMPONENT && r.level > first_level
) {
    is_container = true;  // <- Incorrect Group detection!
}
```

**Problem mechanism**:

1. This GSO control is a **Rectangle with TextBox**
2. The TextBox paragraph contains 2 inline Picture controls
3. Each inline Picture's sub-records contain `SHAPE_COMPONENT` (level 5)
4. `r.level > first_level` condition misidentifies these deep-level SHAPE_COMPONENTs as Group children
5. `is_container = true` → `parse_container_children()` called
6. Inline Picture's SHAPE_COMPONENT incorrectly used as child boundary
7. Result: incorrectly parsed as Group(children=[Picture(bid=4), Rectangle(textbox=None)])

**Record structure verification**:

```
child_records:
  SHAPE_COMPONENT (level 2)   <- rectangle itself (base_level)
  LIST_HEADER (level 3)       <- Rectangle TextBox (ignored due to misidentification)
  PARA_HEADER (level 3)       <- TextBox paragraph
  ...paragraph content...
  CTRL_HEADER (level 4)       <- 1st inline Picture
  SHAPE_COMPONENT (level 5)   <- * This is misidentified as Group child
  SHAPE_PICTURE (level 6)
  CTRL_HEADER (level 4)       <- 2nd inline Picture
  SHAPE_COMPONENT (level 5)   <- * This is also misidentified as Group child
  SHAPE_PICTURE (level 6)
  SHAPE_RECTANGLE (level 3)   <- actual rectangle definition
```

## Goal

Fix the legacy Group detection condition in `parse_gso_control()` so that deep-level SHAPE_COMPONENTs from inline controls within TextBoxes are not misidentified as Group children.

## Scope

1. **Parser fix**: Change level comparison in `is_container` detection from `> first_level` to `== first_level + 1`
2. **Defensive reinforcement**: Add level filtering to SHAPE_COMPONENT index collection in `parse_container_children()`
3. Expected result: GSO correctly parsed as Rectangle, and 2 inline Pictures inside TextBox are rendered
4. Add regression tests and verify
