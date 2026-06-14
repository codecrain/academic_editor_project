# Task 145 Execution Plan: Expanding Use of ShapeObject::common()

## 1. Overview

Consolidate duplicate 8-variant matching on ShapeObject enum into methods.

## 2. Goals

- Add `shape_attr()`, `shape_name()` methods
- Simplify `z_order()` (`self.common().z_order`)
- Remove 8 duplicate match blocks → replace with method calls

## 3. Changed Files

| File | Change |
|------|--------|
| src/model/shape.rs | Add shape_attr(), shape_name(), simplify z_order() |
| src/renderer/layout/shape_layout.rs | 5 match blocks → method calls |
| src/renderer/layout/table_cell_content.rs | 1 match block → shape.common() |
| src/main.rs | 2 match blocks → shape_name() + common()/shape_attr() |

## 4. Verification

- 582 tests pass + WASM build + Clippy 0
