# Task 142 — Step 4 Completion Report

## Overview

Completed splitting parser/control.rs, serializer/control.rs, serializer/cfb_writer.rs, model/table.rs.

## Change Details

### parser/control.rs (1,744 lines → 585 lines)

| File | Lines | Content |
|------|-------|---------|
| `control.rs` | 585 | parse_control dispatcher + table/header-footer/footnote-endnote/simple control parsers |
| `control/shape.rs` | 789 | GSO/shape parsing (parse_gso_control, parse_common_obj_attr, etc.) |
| `control/tests.rs` | 394 | Parser tests (13) |

### serializer/control.rs (1,520 lines → 1,120 lines)

| File | Lines | Content |
|------|-------|---------|
| `control.rs` | 1,120 | All control serialization functions |
| `control/tests.rs` | 400 | Round-trip tests (3) |

### serializer/cfb_writer.rs (1,516 lines → 196 lines)

| File | Lines | Content |
|------|-------|---------|
| `cfb_writer.rs` | 196 | serialize_hwp + compress_stream + write_hwp_cfb |
| `cfb_writer/tests.rs` | 1,320 | CFB tests (14) + helpers (test-only) |

### model/table.rs (1,767 lines → 987 lines)

| File | Lines | Content |
|------|-------|---------|
| `table.rs` | 987 | Table/Cell/Row model definitions |
| `table/tests.rs` | 780 | Table tests (43) |

## Verification

- `cargo check`: 0 errors
- `cargo test`: 582 passed, 0 failed
- `cargo clippy`: 0 warnings
- All source files under 1,200 lines (cfb_writer/tests.rs at 1,320 lines is pure test code)

## Split Techniques

- **shape.rs extraction**: Separated shape parsing section (~768 lines) from parser/control.rs into separate module
  - `parse_gso_control`, `parse_common_obj_attr` → `pub(crate)` visibility
  - `parse_caption` → `pub(crate)` (called from shape)
  - `super::doc_info` → `crate::parser::doc_info` path fix
- **Test extraction**: All 4 files use `#[cfg(test)] mod tests;` pattern for external file separation
