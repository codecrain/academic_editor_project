# Task 11: Caption Handling (Table/Image) - Implementation Plan

## Overview

Implement parsing and rendering of captions for HWP Table and Picture controls.

---

## Implementation Steps

### Step 1: Model Modification

**Goal**: Modify Table and Caption structs

**Files to modify**:
- `src/model/table.rs`
- `src/model/shape.rs`

**Work**:

1. Add caption field to `Table` struct:
```rust
pub struct Table {
    // ... existing fields
    pub caption: Option<Caption>,
}
```

2. Add include_margin field to `Caption` struct:
```rust
pub struct Caption {
    pub direction: CaptionDirection,
    pub width: HwpUnit,
    pub spacing: HwpUnit16,
    pub max_width: HwpUnit,
    pub include_margin: bool,  // added
    pub paragraphs: Vec<Paragraph>,
}
```

**Verification**: Build succeeds

---

### Step 2: Parser Implementation - Caption Parsing Function

**Goal**: Implement common caption parsing function

**File to modify**:
- `src/parser/control.rs`

**Work**:

1. Implement `parse_caption()` function:
   - Parse caption attributes (14 bytes)
     - UINT (4): Attributes (bit 0~1: direction, bit 2: include_margin)
     - HWPUNIT (4): Caption width
     - HWPUNIT16 (2): Caption-frame spacing
     - HWPUNIT (4): Max text length

2. Parse caption paragraph list:
   - Collect paragraph records after HWPTAG_LIST_HEADER
   - Leverage existing `parse_paragraph_list()`

**HWP Spec Reference**:
- Table 73: Caption list (LIST_HEADER + caption data)
- Table 74: Caption (14 bytes)
- Table 75: Caption attributes

---

### Step 3: Parser Implementation - Table/Picture Caption Integration

**Goal**: Integrate caption parsing with table/picture controls

**File to modify**:
- `src/parser/control.rs`

**Work**:

1. Modify `parse_table_control()`:
   - Treat HWPTAG_LIST_HEADER before HWPTAG_TABLE as caption
   - Identify and parse caption records

2. Modify `parse_gso_control()`:
   - Identify caption records during Picture processing
   - Pass caption to parse_picture()

**Caption Presence Detection**:
- Table: If HWPTAG_LIST_HEADER exists before HWPTAG_TABLE, it's a caption
- Picture: If LIST_HEADER exists before HWPTAG_SHAPE_COMPONENT_PICTURE, it's a caption

---

### Step 4: Renderer Implementation

**Goal**: Implement caption rendering

**Files to modify**:
- `src/renderer/layout.rs`
- `src/renderer/height_measurer.rs`

**Work**:

1. Implement `layout_caption()` function:
   - Position calculation based on caption direction
     - top: above table/image
     - bottom: below table/image
     - left/right: beside table/image (phase 2 implementation)
   - Render caption paragraph text

2. Modify `layout_table()`:
   - Call caption rendering before/after table rendering
   - top caption: render before table
   - bottom caption: render after table

3. Modify `layout_body_picture()`:
   - Call caption rendering before/after image rendering

4. Modify `HeightMeasurer`:
   - Add `measure_caption()` function
   - Include caption height when measuring tables/images

---

### Step 5: Testing and Verification

**Goal**: Verify caption functionality

**Work**:

1. Add unit tests:
   - Caption parsing tests
   - Caption rendering tests

2. Integration tests:
   - Test with HWP files containing captions
   - Visual verification of SVG output

**Verification commands**:
```bash
docker compose run --rm test
docker compose run --rm dev cargo run -- export-svg "samples/table-ipc.hwp" --output output/
```

---

## Expected Schedule

| Step | Content |
|------|---------|
| Step 1 | Model modification |
| Step 2 | Caption parsing function |
| Step 3 | Table/picture caption integration |
| Step 4 | Renderer implementation |
| Step 5 | Testing and verification |

---

## Risk Factors and Mitigations

1. **Caption record identification**:
   - Need to distinguish whether HWPTAG_LIST_HEADER is a cell or caption when traversing child_records
   - Use record level and order for identification

2. **left/right captions**:
   - Requires complex layout, first implementation supports only top/bottom
   - Design for extensibility

3. **Caption styles**:
   - Caption paragraphs also need CharShape applied like regular paragraphs

---

*Created: 2026-02-06*
