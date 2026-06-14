# Troubleshooting: Group (Object Grouping) Child Shape Coordinate Transform Error

## Problem

When multiple shapes are grouped in an HWP document, child shapes were rendered approximately 100px above the group bounding rectangle.

### Symptoms

- `samples/basic/docdo.hwp` (Dokdo drawing + rectangle grouped together)
- The rectangle rendered at the correct position (y~257), but the Dokdo polygons rendered higher (y~194)
- The same shapes ungrouped in `docdo-1.hwp` rendered correctly (y~294)

### Comparison (Before Fix)

| Shape | Grouped (Wrong) | Ungrouped (Correct) | Difference |
|-------|-----------------|---------------------|------------|
| Dokdo P1 | y~194 | y~294 | ~100px |
| Dokdo P6 | y~183 | y~283 | ~100px |
| Rectangle | y~257 | y~257 | 0px |

## Analysis

### Step 1: Grouped vs. Ungrouped Data Comparison

Compared ShapeComponentAttr between grouped/ungrouped documents:
- Group CommonObjAttr size == ShapeComponentAttr size (4950x5850) -- no scaling difference
- Child shapes: `position_in_group = grouped_offset - ungrouped_offset` relationship holds
- Rectangle (no rotation) is correct in both versions -> only shapes with rotation components have the problem

### Step 2: Rendering Matrix Analysis

Rendering matrix structure per HWP spec Tables 86-87:
```
Translation x (Scale x Rotation) x cnt pairs
```

Dokdo P1 matrix data:
```
T = [1, 0, -16935; 0, 1, -6942]     # Translation
S1 = [5.290, 0, 3229; 0, 5.394, -4683]  # Scale (2nd pair of cnt=1)
R1 = [0.999, -0.011, 0; -0.011, 0.999, 0]  # Rotation
```

### Step 3: Matrix Composition Order Verification (Key)

**Existing code (incorrect)**: `T x S x R` order
```
result = compose(T, S1)  ->  tx = 3229 (S's tx retained)
result = compose(result, R1)  ->  ty ~ -4683 (negative -> displaced upward)
```

**Correct order**: `T x R x S`
```
result = compose(T, R1)  ->  tx ~ -16935, ty ~ -6942 (T retained)
result = compose(result, S1)  ->  tx ~ 1865, ty ~ 2812 (positive -> correct position)
```

Manual calculation confirmed that `T x R x S` results matched the actual `position_in_group` values (1852, 2798) within 13-18 HWPUNIT. This is within the rounding error of manual calculation with 3-decimal precision.

## Root Cause

In `src/parser/control.rs`'s `parse_shape_component_full()` function, the Scale and Rotation application order was reversed during rendering matrix composition.

### Incorrect Code

```rust
for i in 0..cnt {
    let scale = read_matrix(&mut r);
    let rotation = read_matrix(&mut r);
    result = compose(&result, &scale);     // Scale first
    result = compose(&result, &rotation);  // Rotation second
}
```

With this order, the translation component (tx, ty) of the Scale matrix gets transformed by Rotation, producing negative coordinates.

### Correct Order

```rust
for _ in 0..cnt {
    let scale = read_matrix(&mut r);
    let rotation = read_matrix(&mut r);
    result = compose(&result, &rotation);  // Rotation first
    result = compose(&result, &scale);     // Scale second
}
```

Applying Rotation first preserves the Translation's displacement component, then Scale is applied to produce correct coordinates.

## Changes

| File | Change |
|------|--------|
| `src/parser/control.rs` (lines 680-681) | Changed matrix composition order to `R -> S` |

## Results After Fix

| Shape | Grouped (After Fix) | Ungrouped (Reference) | Difference |
|-------|--------------------|-----------------------|------------|
| Dokdo P1 | y~294.41 | y~294.29 | ~0.1px |
| Dokdo P6 | y~282.92 | y~282.80 | ~0.1px |
| Rectangle | y~256.99 | y~256.99 | 0px |

The ~0.1px difference is due to floating-point arithmetic differences between the affine transform path and the direct coordinate path, and is visually indistinguishable.

## Lessons Learned

- In affine transform matrix composition, **order determines the result**. `A x B != B x A`
- Shapes without rotation (rectangle) produce the same result regardless of order because the Scale matrix is diagonal, so the problem was not exposed
- The order difference only manifests with shapes that have rotation components -- testing must include rotated shapes
- Using the same document with ungrouped shapes as a reference baseline enabled accurate coordinate comparison
