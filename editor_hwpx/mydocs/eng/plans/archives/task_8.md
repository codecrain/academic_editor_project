# Task 8 — Execution Plan: HWP Editor-Compatible Height Processing

## Goal

Calculate line spacing in the same manner as the HWP editor to improve page layout accuracy.

## Current State Analysis

### 1. Page Margins ✅
- Applied correctly via `PageDef` → `PageLayoutInfo` → `body_area` path

### 2. Paragraph Spacing (spacing_before/after) ✅
- Applied in `ParaShape` → `ResolvedParaStyle` → `layout.rs:270-371`
- spacing_before added to first line, spacing_after to last line of paragraph
- Parsed in HWPUNIT and converted to px (not ratio)

### 3. Line Spacing (line_spacing) ✅ Implemented
- Parsing: `ParaShape.line_spacing`, `ParaShape.line_spacing_type`
- Style resolution: `ResolvedParaStyle.line_spacing`, `ResolvedParaStyle.line_spacing_type`
- **HWP line spacing types**:
  - `Percent` (default 160%): ratio relative to character size
  - `Fixed`: fixed height (HWPUNIT)
  - `SpaceOnly`: base height + additional spacing
  - `Minimum`: minimum height specified
- **Implemented**: `calculate_effective_line_height()` function added, applied to all paragraph rendering

### 4. Font Height ⚠️ Partially Applied
- Parsing: `CharShape.base_size` (HWPUNIT)
- Style resolution: `ResolvedCharStyle.font_size` (px)
- **Issue**: Line height does not automatically reflect font size changes

## HWP Line Spacing Type Calculation Formulas

```
LineSpacingType::Percent (default 160%)
  effective_line_height = base_line_height * (line_spacing / 100.0)
  base_line_height = max(font_size * 1.2, LineSeg.line_height)

LineSpacingType::Fixed
  effective_line_height = line_spacing (HWPUNIT → px converted value)

LineSpacingType::SpaceOnly
  effective_line_height = base_line_height + line_spacing

LineSpacingType::Minimum
  effective_line_height = max(base_line_height, line_spacing)
```

## Implementation Completed

### Phase 1: Add Line Height Calculation Function ✅

**File**: `src/renderer/layout.rs`

```rust
/// Calculate actual line height based on line spacing type
pub fn calculate_effective_line_height(
    base_height: f64,
    line_spacing: f64,
    line_spacing_type: LineSpacingType,
) -> f64
```

### Phase 2: Modify layout_composed_paragraph ✅

**File**: `src/renderer/layout.rs`

- Before: `line_height = hwpunit_to_px(comp_line.line_height, self.dpi)`
- After: `line_height = calculate_effective_line_height(base, line_spacing, type)`

### Phase 3: Modify HeightMeasurer ✅

**File**: `src/renderer/height_measurer.rs`

- Applied same line height calculation logic to `measure_paragraph()` function
- Maintained height consistency between pagination and layout

### Phase 4: Modify Table and Footnote Areas ✅

**File**: `src/renderer/layout.rs`

- Applied line spacing to paragraph height calculation within table cells
- Applied line spacing to footnote area height estimation
- Applied line spacing to `layout_footnote_paragraph_with_number()` function

### Phase 5: Verification ✅

- 216 tests pass
- `samples/2010-01-06.hwp` SVG output normal (6 pages)
- Comparison with Hancom editor rendering results needed

## Modified Files List

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Added `calculate_effective_line_height()`, applied line spacing to body/table/footnotes |
| `src/renderer/height_measurer.rs` | Applied same line height calculation logic |

## Verification Method

1. `docker compose run --rm test` — 216 tests pass ✅
2. Visual comparison with Hancom editor results after SVG output
3. Test with documents having various line spacing settings
