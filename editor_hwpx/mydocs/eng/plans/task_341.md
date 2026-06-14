# Task 341 Plan: TAC Equation Inline Rendering

## Symptoms

In `samples/exam_math.hwp`, Equations with `treat_as_char=true` should be placed inline within paragraph text, but currently render at separate positions detached from the text.

Example: pi=18 "2. Function [equation] for which [equation] has the value?" — equations should be within the text flow.

## Root Cause Analysis

### Current Flow
1. **Composer** (composer.rs:110-135): Equations always registered in `tac_controls`
2. **Paragraph Layout** (paragraph_layout.rs:562-569): Equation width passed via `tac_offsets_px`
3. **Paragraph Layout**: Equation position is **not registered** with `tree.set_inline_shape_position()`
4. **Shape Layout** (shape_layout.rs:202-206): `get_inline_shape_position()` query → None → standalone placement

### Comparison: TAC Picture/Shape
- Picture/Shape registers position via `set_inline_shape_position()` in `paragraph_layout.rs`
- Shape Layout uses those coordinates for inline placement
- **Equations lack this registration logic**

## Implementation Plan

### Step 1: Register Equation Inline Position in paragraph_layout

- When iterating `tac_offsets_px`, call `set_inline_shape_position()` for Equation controls
- Use the same pattern as Picture/Shape

### Step 2: Use Inline Coordinates in shape_layout

- Query `get_inline_shape_position()` during equation rendering
- If coordinates exist, place equation at that position (including baseline alignment)
- If no coordinates, maintain existing behavior (standalone placement)

### Step 3: Verification

- Compare exam_math.hwp full-page SVGs
- Confirm equations are correctly placed within text flow
- Confirm 716 existing tests pass
- Confirm no impact on existing samples (exam_kor, hwpspec-w.hwp, etc.)

## Impact Scope

- `src/renderer/layout/paragraph_layout.rs` — Equation inline position registration
- `src/renderer/layout/shape_layout.rs` — Equation inline coordinate usage
