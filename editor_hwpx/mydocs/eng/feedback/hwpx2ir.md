# Issue

When rendering HWPX files, layout placement issues occur with tables, images, and paragraphs.
When the problematic HWPX file is converted to HWP using the Hancom program and then opened with rhwp-studio, it renders correctly.

# Key Consideration

When encoding HWPX XML-defined controls into IR, where does the discrepancy originate when HWP encodes correctly but HWPX does not?

The fact that there are no issues with rendering the controls themselves, but problems occur in height calculation and placement, leads to the logical prediction that encoding HWPX to IR identically to how HWP is encoded to IR would eliminate all issues.

# Where Does the Problem Originate?
When encoding HWPX paragraphs into IR?
When encoding controls like tables and images into IR?
Why does HWPX alone have paragraph spacing issues?

# Analysis Results (2026-03-21)

## Root Cause
Difference in LINE_SEG generation between HWP and HWPX:
- **HWP binary**: LINE_SEG is pre-calculated by Hancom. Heights of all objects (tables, images, etc.) are already reflected in vpos
- **HWPX XML**: `<hp:lineseg>` tag values are used as-is. Heights of non-TAC TopAndBottom tables/images are not included in vpos

## Symptoms
- Paragraphs after non-TAC TopAndBottom tables/images overlap with the objects
- TAC table LINE_SEG lh does not include table height, causing insufficient paragraph spacing

## Current Workaround (Post-patch)
- `document.rs` vpos recalculation: retroactively add non-TAC TopAndBottom Picture/Table heights to vpos
- `layout.rs` vpos downward correction: reduce y_offset when cumulative error is large
- Problem: each patch risks HWP regression, case-by-case branching becomes complex

## Correct Solution Direction

### Design Principles
- **One renderer**: Render based on IR only, regardless of HWP/HWPX (no HWPX-specific patches in the renderer)
- **Ensure IR equivalence at the encoding stage**: Calculate and fill in values that exist in HWP but are absent in HWPX during HWPX->IR encoding

### Hancom's Presumed Behavior Model
The Hancom word processor likely performs a 1:1 conversion to HWP control structures internally when loading HWPX, then recalculates LINE_SEG.
Therefore, it is normal for HWPX to lack LINE_SEG (linesegarray) -- the viewer must calculate it.

### Values Present in HWP but Absent in HWPX (Confirmed via IR Comparison)
1. **Body paragraph linesegarray in full**: HWPX does not include linesegarray for body paragraphs (only includes them for cell interiors)
2. **TAC table paragraph LINE_SEG lh**: HWP includes table height in lh (e.g., lh=4091), HWPX default generation produces lh=100
3. **vpos after non-TAC TopAndBottom objects**: HWP reflects object height in subsequent paragraph vpos

### Implementation Direction
Calculate LINE_SEG during the HWPX->IR encoding stage:
1. Calculate base lh from font size x line spacing
2. If a TAC control is present, lh = max(font lh, control height)
3. Add non-TAC TopAndBottom object heights to subsequent paragraph vpos
4. Remove HWPX-specific patches from the renderer (layout.rs vpos downward corrections, etc.)
