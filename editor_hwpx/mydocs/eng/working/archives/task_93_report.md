# Task 93: Shape Parsing Conformance Fix Based on hwplib — Completion Report

## Changes

### Stage 1: Data Model Changes

| Change | File | Before | After |
|--------|------|--------|-------|
| LineShape field | `src/model/shape.rs` | `attr: u16` | `started_right_or_bottom: bool` |
| ArcShape field | `src/model/shape.rs` | `attr: u32` | `arc_type: u8` |

### Stage 2: Parser Function Fixes

| Shape | Inconsistency | Fix |
|-------|---------------|-----|
| LINE | 5th field `read_u16()` 2B | `read_i32()` 4B -> boolean conversion |
| RECT | x[0..4],y[0..4] (all X then all Y) | x1,y1,x2,y2,x3,y3,x4,y4 interleaved pairs |
| POLYGON | count `read_i16()` 2B | `read_i32()` 4B |
| POLYGON | coordinate values `i32 >> 16` (fixed-point assumption) | plain i32 (HWPUNIT) |
| CURVE | count `read_i16()` 2B + `>>16` + no padding | `read_i32()` 4B + plain i32 + `skip(4)` |
| ARC | `read_u32()` 4B | `read_u8()` 1B |

### Stage 3: Renderer Code Adjustment

- Renderer did not directly reference `LineShape.attr` or `ArcShape.attr`, so no changes needed
- Polygon/curve coordinates use `points` vector directly, so `>>16` removal is auto-reflected
- Rectangle coordinates use `common.width/height` in renderer, no impact

### Stage 4: Serialization Code Sync

Serialization code also updated to match parser changes:

| Shape | Change |
|-------|--------|
| LINE | `write_u16(line.attr)` -> `write_i32(started_right_or_bottom as i32)` |
| RECT | split -> interleaved order |
| POLYGON | `write_i16` -> `write_i32`, x/y split -> interleaved |
| CURVE | `write_i16` -> `write_i32`, x/y split -> interleaved, added `write_u32(0)` padding |
| ARC | `write_u32(arc.attr)` -> `write_u8(arc.arc_type)` |

## Modified Files

| File | Changes |
|------|---------|
| `src/model/shape.rs` | LineShape, ArcShape field changes |
| `src/parser/control.rs` | 6 shape parser function fixes |
| `src/serializer/control.rs` | 6 shape serialization function fixes |

## Verification Results

- `cargo test` — 532 tests passed (0 failures)
- `export-svg KTX.hwp` — SVG output normal
