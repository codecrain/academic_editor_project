# Task 93: Shape Parsing Consistency Fix Based on hwplib

## Background

Comparison with hwplib (Java HWP library) source code revealed 6 parsing inconsistencies across shape-specific parsers.
Following the same pattern as the existing border.width bug (INT16→INT32), field size errors cause byte offset shifts that are accidentally compensated by other correction logic (>>16 shifts etc.).

## Reference Source

- hwplib shape models: `/home/edward/vsworks/shwp/hwplib/src/main/java/kr/dogfoot/hwplib/object/bodytext/control/gso/shapecomponenteach/`
- hwplib shape readers: `/home/edward/vsworks/shwp/hwplib/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/control/gso/`

## Inconsistency Items

| # | Shape | Inconsistency | hwplib (correct) | Our code (current) | Impact |
|---|-------|--------------|-------------------|---------------------|--------|
| 1 | LINE | 5th field size | `readSInt4()` 4B (startedRightOrBottom boolean) | `read_u16()` 2B (attr) | 2-byte shift |
| 2 | RECT | Coordinate read order | x1,y1,x2,y2,x3,y3,x4,y4 (interleaved pairs) | x[0..4],y[0..4] (all X → all Y) | Coordinates swapped |
| 3 | POLYGON | count type | `readSInt4()` 4B | `read_i16()` 2B | 2-byte shift |
| 4 | POLYGON | Coordinate values | plain i32 (HWPUNIT) | `i32 >> 16` (fixed-point assumption) | >>16 compensates shift |
| 5 | CURVE | count/coords/padding | i32 count + plain i32 + `skip(4)` | i16 count + >>16, no padding | Same pattern |
| 6 | ARC | First field | `readUInt1()` 1B (arcType enum) | `read_u32()` 4B (attr) | 3-byte shift |
| - | ELLIPSE | - | Match | Match | None |

## Modified Files

| File | Changes |
|------|---------|
| `src/model/shape.rs` | LineShape.attr→started_right_or_bottom, ArcShape.attr→arc_type(u8) |
| `src/parser/control.rs` | Fix 6 shape parser functions |
| `src/renderer/layout.rs` | Adjust renderer code for changed field names/types |

## Verification

- `docker compose run --rm test` — 532 existing tests pass
- `docker compose run --rm dev cargo run -- export-svg samples/basic/KTX.hwp` — shape rendering normal
- Additional sample (polygon/curve/arc containing) SVG output comparison
