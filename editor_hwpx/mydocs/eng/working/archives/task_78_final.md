# Task 78 Final Report: 2 Inline Images Missing in 20250130-hongbo.hwp Page 2

## Summary

Resolved an issue where only 1 of 2 inline images inside a Rectangle in `samples/20250130-hongbo.hwp` page 2 was rendered. The root cause was the parser's legacy Group detection condition where a deep-level SHAPE_COMPONENT of an inline control inside a TextBox was misidentified as a Group child, causing the Rectangle to be incorrectly parsed as a Group.

## Root Cause

1. GSO control of paragraph 25 is a **Rectangle with TextBox** (containing 2 inline Pictures in TextBox)
2. The legacy Group detection condition `r.level > first_level` in `parse_gso_control()` misidentified the SHAPE_COMPONENT (level 5) of inline Picture controls inside TextBox as Group children
3. `is_container = true` -> `parse_container_children()` called -> SHAPE_COMPONENT used as child boundary
4. Result: Incorrectly parsed as Group(children=[Picture(bid=4), Rectangle(textbox=None)])
5. Rectangle's TextBox was missing, so only 1 of 2 inline Pictures was rendered

## Modified Files

| File | Changes |
|------|---------|
| `src/parser/control.rs` | Changed legacy Group detection condition from `r.level > first_level` to `r.level == first_level + 1`. Only direct child level used for Group detection |
| `src/parser/control.rs` | Added level filtering to SHAPE_COMPONENT index collection in `parse_container_children()`. Only direct child level (child_level) used as boundary |
| `src/wasm_api.rs` | Added regression test `test_task78_rectangle_textbox_inline_images`. Fixed existing `test_task77` test para_index from 30 to 29 |

## Key Fixes

| Item | Before | After |
|------|--------|-------|
| Group detection condition (line 333) | `r.level > first_level` | `r.level == first_level + 1` |
| parse_container_children SHAPE_COMPONENT filter (line 738) | Collected all regardless of level | Collected only `record.level == child_level` |
| para[25] parsing result | Group(children=[Picture, Rectangle(no textbox)]) | Rectangle(textbox=Some(paragraphs=[Picture x 2])) |
| Page 2 image count | 1 | 2 |

## Verification Results

- 493 Rust tests passed (existing 492 + 1 new)
- SVG export: 20250130-hongbo.hwp page 2 with 2 images rendered correctly
- WASM build succeeded
- Vite build succeeded
