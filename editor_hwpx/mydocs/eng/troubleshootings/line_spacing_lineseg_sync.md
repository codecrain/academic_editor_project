# Line Spacing Changes Not Synced to LineSeg

## Symptoms

Changing line spacing from the style bar (e.g., 160% -> 300%) produces no visual change in the document.
After saving as HWP and opening in Hancom, the style bar shows 300% but actual rendering remains at 160%.

## Cause

In HWP documents, line spacing is stored in two places:

1. **ParaShape** (`line_spacing`, `line_spacing_type`) -- the paragraph's logical line spacing setting
2. **LineSeg** (`line_spacing`) -- the physical line spacing value for each line (in HWPUNIT)

### Rendering Pipeline

```
ParaShape (logical value)
    | (calculated once at document load)
LineSeg (physical value)
    |
compose_lines() -> ComposedLine.line_spacing
    |
layout -> actual Y coordinate calculation
```

`compose_lines()` **uses LineSeg values directly** (line 193-199 of `composer.rs`):
```rust
lines.push(ComposedLine {
    line_height: line_seg.line_height,
    line_spacing: line_seg.line_spacing,  // Copied directly from LineSeg
    ...
});
```

### Problem 1: `apply_para_format` Does Not Update LineSeg

`apply_para_format_native()` only changed ParaShape and called `rebuild_section()`.
However, `rebuild_section()` -> `recompose_section()` -> `compose_section()` only reads
existing LineSeg values, so the changed ParaShape line spacing was never reflected.

### Problem 2: `reflow_line_segs` Preserves Existing Values

In `reflow_line_segs()`'s `make_line_seg` closure, when the original LineSeg is valid
(`line_height > 0`), **all dimensions were copied from the original**:

```rust
// Before fix (problematic code)
if let (true, Some(ref o)) = (has_valid_orig, &orig) {
    LineSeg {
        line_spacing: o.line_spacing,  // <- Original value preserved (ParaShape ignored)
        ...
    }
}
```

This was intended to preserve the original HWP's LineSeg dimensions at document load,
but had the side effect of retaining the original value even after changing line spacing in the UI.

## Fix

### Step 1: `formatting.rs` -- Add LineSeg Recalculation Call

When line-spacing-related mods exist in `apply_para_format_native()`,
call `reflow_line_segs()` before `rebuild_section()` to update LineSeg:

```rust
if mods.line_spacing.is_some() || mods.line_spacing_type.is_some() {
    let styles = resolve_styles(&self.document.doc_info, self.dpi);
    // ... calculate available_width ...
    reflow_line_segs(&mut para, available_width, &styles, self.dpi);
}
```

Same logic applied to cell paragraphs (`apply_para_format_in_cell_native`).

### Step 2: `line_breaking.rs` -- Recalculate line_spacing Even from Existing LineSeg

In the `make_line_seg` closure, even when the original LineSeg is valid, recalculate
`line_spacing` from ParaShape:

```rust
// After fix
if let (true, Some(ref o)) = (has_valid_orig, &orig) {
    let line_spacing_hwp = compute_line_spacing_hwp(ls_type, ls_value, o.line_height, dpi);
    LineSeg {
        line_height: o.line_height,          // Preserved from original
        text_height: o.text_height,          // Preserved from original
        baseline_distance: o.baseline_distance, // Preserved from original
        line_spacing: line_spacing_hwp,      // <- Recalculated from ParaShape
        ...
    }
}
```

## Key Lessons

- In HWP, **changing ParaShape alone does not affect rendering**.
  LineSeg holds the physical values for actual rendering, and compose/layout reference LineSeg directly.
- ParaShape is the "setting value," LineSeg is the "calculated layout value" -- this dual structure must be understood.
- Beyond line spacing, other properties like line height (`line_height`) and text height (`text_height`)
  may also need LineSeg synchronization when ParaShape/CharShape changes.

## Related Files

| File | Role |
|------|------|
| `src/document_core/commands/formatting.rs` | `apply_para_format_native` -- ParaShape change + LineSeg recalculation |
| `src/renderer/composer/line_breaking.rs` | `reflow_line_segs` -- LineSeg creation/update |
| `src/renderer/composer.rs` | `compose_lines` -- LineSeg -> ComposedLine conversion |
| `src/model/paragraph.rs` | `LineSeg` struct definition |
