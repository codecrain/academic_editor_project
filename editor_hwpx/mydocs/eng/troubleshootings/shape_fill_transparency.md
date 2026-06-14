# Shape Fill Transparency (Alpha) Not Processed

## Date
2026-02-17

## Related Task
Task 105 (Page Border/Background Feature Implementation) -- Follow-up fix

## Symptoms

- In `Worldcup_FIFA2010_32.hwp`, 8 white rectangular shapes were rendered opaque over the background image
- In the HWP program, they appear as semi-transparent white (background image shows through)
- Shape fill transparency was not applied at all

## Root Cause Analysis

### Primary Cause: Incomplete Fill Binary Parsing (parse_fill)

The official HWP spec (Table 30) describes the end of the fill information as follows:

```
DWORD  Additional fill property length (size)
BYTE   Additional fill property [size bytes]
```

However, the spec does not describe **the bytes following the additional fill properties**. Analysis of hwplib (Java reference implementation)'s `ForFillInfo.java` revealed:

```java
// hwplib ForFillInfo.java
private static void additionalProperty(FillInfo fi, StreamReader sr) {
    long size = sr.readUInt4();  // Additional property size
    if (size > 0) {
        sr.skip((int) size);     // Skip additional property data
    }
}

private static void unknownBytes(FillInfo fi, StreamReader sr) {
    // Read 1 byte per active fill type
    if (fi.getType().getValue() & 0x01 != 0) sr.readUInt1();  // Solid fill alpha
    if (fi.getType().getValue() & 0x04 != 0) sr.readUInt1();  // Gradient alpha
    if (fi.getType().getValue() & 0x02 != 0) sr.readUInt1();  // Image fill alpha
}
```

**Key discovery**: The bytes labeled `unknownBytes` are actually the **transparency (alpha)** values for each fill type.

#### parse_fill() Before Fix
```rust
// Only reads additional properties, does not read unknownBytes (alpha)
let additional_size = r.read_u32().unwrap_or(0) as usize;
let _ = r.skip(additional_size);
// -> Alpha bytes are not consumed, causing byte alignment mismatch for subsequent parsing (shadow info, etc.)
```

#### parse_fill() After Fix
```rust
// Read additional properties
let additional_size = r.read_u32().unwrap_or(0) as usize;
if additional_size > 0 {
    if fill_type_val & 0x04 != 0 {
        let _blurring_center = r.read_u8().unwrap_or(0);
    } else {
        let _ = r.skip(additional_size);
    }
}
// Unknown bytes = fill alpha (hwplib unknownBytes)
if fill_type_val & 0x01 != 0 { fill.alpha = r.read_u8().unwrap_or(0); }
if fill_type_val & 0x04 != 0 { let a = r.read_u8().unwrap_or(0); if fill.alpha == 0 { fill.alpha = a; } }
if fill_type_val & 0x02 != 0 { let a = r.read_u8().unwrap_or(0); if fill.alpha == 0 { fill.alpha = a; } }
```

### Secondary Cause: ShapeComponent Parsing Order Error

The bytes after fill information were being parsed as text box properties (margins), but according to hwplib `ForShapeComponent.java`, the actual order is:

```
commonPart -> lineInfo -> fillInfo -> shadowInfo -> instid -> skip -> transparent
```

#### Before Fix (Incorrect Order)
```rust
// After fill: parsed as text box margins (error)
let left = r.read_i16().unwrap_or(0);    // Actually part of shadow_type
let right = r.read_i16().unwrap_or(0);
let top = r.read_i16().unwrap_or(0);
let bottom = r.read_i16().unwrap_or(0);
```

#### After Fix (Shadow Info)
```rust
// After fill: shadow info 16 bytes (hwplib ForShapeComponent.shadowInfo)
if r.remaining() >= 16 {
    let _shadow_type = r.read_u32().unwrap_or(0);    // ShadowType
    let _shadow_color = r.read_u32().unwrap_or(0);    // COLORREF
    let _shadow_offset_x = r.read_i32().unwrap_or(0); // X offset
    let _shadow_offset_y = r.read_i32().unwrap_or(0); // Y offset
}
```

### Tertiary Cause: ShapeStyle Default opacity=0.0

The `ShapeStyle` struct used `#[derive(Default)]`, causing the `opacity` field to default to `f64::default()` = `0.0` (fully transparent). When using `..Default::default()` to fill remaining fields (e.g., for table cell backgrounds), `opacity` became 0.0, making cell backgrounds invisible.

#### Before Fix
```rust
#[derive(Debug, Clone, Default)]
pub struct ShapeStyle {
    // ...
    pub opacity: f64,  // Default = 0.0 (fully transparent!)
}
```

#### After Fix
```rust
#[derive(Debug, Clone)]
pub struct ShapeStyle { /* ... */ }

impl Default for ShapeStyle {
    fn default() -> Self {
        Self {
            fill_color: None,
            stroke_color: None,
            stroke_width: 0.0,
            stroke_dash: StrokeDash::default(),
            opacity: 1.0,  // Default = opaque
        }
    }
}
```

## Alpha Value Interpretation

- `alpha = 0`: Not set (default) -> treated as opaque (opacity 1.0)
- `alpha = 1-254`: Semi-transparent -> `opacity = alpha / 255.0`
- `alpha = 255`: Opaque -> opacity 1.0

Worldcup file shapes: alpha = 0xA3 (163) -> opacity = 163/255 = 0.639

In HWPX format, an explicit float value is used: `<winBrush alpha="0.64">`.

## Modified Files

| File | Changes |
|------|---------|
| `src/model/style.rs` | Added `alpha: u8` field to `Fill` struct |
| `src/parser/doc_info.rs` | `parse_fill()`: additionalProperty + unknownBytes (alpha) parsing |
| `src/parser/control.rs` | `parse_shape_component_full()`: shadow info parsing (text box margins -> shadow info) |
| `src/renderer/mod.rs` | Manual `ShapeStyle::Default` implementation, opacity default 1.0 |
| `src/renderer/layout.rs` | `drawing_to_shape_style()`: alpha -> opacity conversion |
| `src/renderer/svg.rs` | `opacity` attribute output for rect/ellipse |
| `src/renderer/web_canvas.rs` | `globalAlpha` setting for opacity support |
| `src/parser/hwpx/header.rs` | HWPX `winBrush` alpha attribute parsing |

## Verification Results

| File | Before Fix | After Fix |
|------|-----------|-----------|
| Worldcup 8 shapes | Opaque white (hides background) | Semi-transparent white (opacity=0.639) |
| k-water-rfp cell backgrounds | opacity=0.000 (invisible) | No opacity attribute (opaque) |
| request.hwp shapes | opacity=0.000 (invisible) | No opacity attribute (opaque) |
| All tests | 565 passing | 565 passing |

## Lessons Learned

- The official HWP spec does not document the fill transparency bytes -> hwplib reference implementation analysis is essential
- When adding new fields with `#[derive(Default)]`, always verify that the type's default value is semantically correct (`f64` default of 0.0 is inappropriate for opacity)
- Missing byte consumption in binary parsing breaks the alignment of all subsequent fields -> compare byte-by-byte against the reference implementation
