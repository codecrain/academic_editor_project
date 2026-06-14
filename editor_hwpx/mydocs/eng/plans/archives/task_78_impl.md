# Task 78 Implementation Plan: 2 Images Missing on Page 2 of 20250130-hongbo.hwp

## Implementation Overview

Refine the level comparison in `parse_gso_control()`'s legacy Group detection condition to prevent deep SHAPE_COMPONENTs from inline controls within TextBoxes from being misidentified as Group children.

---

## Step 1: Fix Legacy Group Detection Condition

**File**: `src/parser/control.rs`

### Modification Location: lines 332-333

```rust
// Before
if child_records[1..].iter().any(|r|
    r.tag_id == tags::HWPTAG_SHAPE_COMPONENT && r.level > first_level
) {

// After
if child_records[1..].iter().any(|r|
    r.tag_id == tags::HWPTAG_SHAPE_COMPONENT && r.level == first_level + 1
) {
```

With this fix:
- Only direct child level (first_level + 1) SHAPE_COMPONENTs are used for Group detection
- Deep level (first_level + 3) SHAPE_COMPONENTs from inline Pictures within TextBoxes are ignored
- Existing legacy Group parsing works normally (child SHAPE_COMPONENTs are always first_level + 1)

**Scale**: 1 line modified

---

## Step 2: Defensive Level Filtering in parse_container_children()

**File**: `src/parser/control.rs`

### Modification Location: lines 735-741

```rust
// Before
let mut comp_indices: Vec<usize> = Vec::new();
for (i, record) in records.iter().enumerate() {
    if record.tag_id == tags::HWPTAG_SHAPE_COMPONENT {
        comp_indices.push(i);
    }
}

// After
let child_level = child_records.first().map(|r| r.level + 1).unwrap_or(0);
let mut comp_indices: Vec<usize> = Vec::new();
for (i, record) in records.iter().enumerate() {
    if record.tag_id == tags::HWPTAG_SHAPE_COMPONENT && record.level == child_level {
        comp_indices.push(i);
    }
}
```

With this fix:
- Even for actual Groups, only direct child level SHAPE_COMPONENTs are used as boundaries
- Prevents SHAPE_COMPONENTs from inline controls within child Rectangle's TextBox from being incorrectly used as boundaries

**Scale**: ~3 lines modified

---

## Step 3: Regression Tests + Build Verification

**File**: `src/wasm_api.rs`

### Test 1: Page 2 Rectangle with 2 Inline Images

```rust
#[test]
fn test_task78_rectangle_textbox_inline_images() {
    // Verify that the GSO control in para[25] of 20250130-hongbo.hwp page 2
    // is parsed as Rectangle and 2 inline Pictures inside TextBox are rendered
}
```

### Build Verification

1. `docker compose --env-file /dev/null run --rm test` — all tests pass
2. SVG export: confirm 2 images on `20250130-hongbo.hwp` page 2
3. WASM build + Vite build + web browser verification

**Scale**: Test ~30 lines

---

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/parser/control.rs` | Refine Group detection level comparison (1 location) + parse_container_children level filtering (1 location) | ~4 lines |
| `src/wasm_api.rs` | Add regression test | ~30 lines |
