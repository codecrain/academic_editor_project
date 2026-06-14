# Task 245 Plan: Connector Line ($col) Implementation

## Investigation Results

### Binary Structure
- Connector lines **reuse SC_LINE (HWPTAG_SHAPE_COMPONENT_LINE) rather than having a separate tag**
- Distinguished from regular lines by using `$col` (0x24636f6c) as SHAPE_COMPONENT's ctrl_id
- CTRL_HEADER is identical to `gso ` (regular GSO) but description reads "Straight connector line", etc.

### SC_LINE Data Structure (per hwplib)

| Offset | Type | Field | Notes |
|--------|------|------|------|
| 0 | i32 | startX | Start point X |
| 4 | i32 | startY | Start point Y |
| 8 | i32 | endX | End point X |
| 12 | i32 | endY | End point Y |
| 16 | u32 | type | LinkLineType (0~8) |
| 20 | u32 | startSubjectID | Start connected object instance_id |
| 24 | u32 | startSubjectIndex | Start connection point index |
| 28 | u32 | endSubjectID | End connected object instance_id |
| 32 | u32 | endSubjectIndex | End connection point index |
| 36 | u32 | countOfControlPoints | Number of control points |
| 40+ | CP[] | x(u32)+y(u32)+type(u16) x count | For bent/curved types |
| End | u32 | padding | 0x00000000 |

- Regular LineShape: 20 bytes (startX/Y, endX/Y, started_right_or_bottom)
- Connector: 40+ bytes (connection info added after type field)

### LinkLineType Enum (9 types)

| Value | Name | Description |
|----|------|------|
| 0 | Straight_NoArrow | Straight connector |
| 1 | Straight_OneWay | Straight arrow connector |
| 2 | Straight_Both | Straight double-arrow connector |
| 3 | Stroke_NoArrow | Bent connector |
| 4 | Stroke_OneWay | Bent arrow connector |
| 5 | Stroke_Both | Bent double-arrow connector |
| 6 | Arc_NoArrow | Curved connector |
| 7 | Arc_OneWay | Curved arrow connector |
| 8 | Arc_Both | Curved double-arrow connector |

### Constraints
- Only objects on the same page can be connected
- SubjectID references the object's instance_id

### References
- HWPML Spec: Table 141 CONNECTLINE element (hwp_spec_3.0_hwpml.md:4563)
- HWP 5.0 Binary Spec: Undocumented (SC_LINE reuse)
- Hancom Help: draw/draw/drawing(connect).htm
- hwplib: ForControlObjectLinkLine.java, ShapeComponentLineForObjectLinkLine.java
- Examples: samples/cline-00~03.hwp

## Implementation Plan

### Step 1: Model + Parser + Renderer (Viewer)
- Rust model: `ConnectorLine` struct (extends or separate from LineShape)
- Parser: Detect ctrl_id='$col' → parse SC_LINE extended data
- Renderer: Generate SVG paths for straight/bent/curved connectors
- Serialization: Write SC_LINE extended data

### Step 2: Editing Features
- Connector creation UI (add connector types to shape dropdown)
- Object connection point hit testing
- Automatic connector tracking when connected objects are moved

### Step 3: Serialization + Hancom Compatibility
- Connector save/load round-trip
- Compatibility testing with opening/saving in Hancom
