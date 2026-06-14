# Task 307 Implementation Plan: HWPX→IR LINE_SEG Calculation (Encoding Equivalence)

## 1. Design Principle
- **One renderer**: No HWP/HWPX distinction; render IR only (no renderer patches)
- **IR equivalence at encoding stage**: Calculate values present in HWP but absent in HWPX during HWPX→IR conversion

## 2. IR Comparison Analysis (Same Document HWP vs HWPX)

| Item | HWP IR | HWPX IR (Current) |
|------|--------|---------------|
| Paragraph 0.0 ls[0] lh | 4091 (includes TAC table height) | 100 (default value) |
| Paragraph 0.4 vpos | 13634 (reflects non-TAC table height) | 2947 (not reflected) |

Cause: HWPX body paragraphs originally have no `<hp:linesegarray>` → parser generates default values

## 3. Implementation Plan

### 3.1 Step 1: Calculate LINE_SEG During HWPX Encoding
**Location**: `document.rs` (convert current post-patch location to proper logic)

For paragraphs without linesegarray:
1. **Default lh**: Calculate from paragraph style font size x line spacing ratio
2. **TAC control lh correction**: lh = max(default lh, control height)
3. **vpos after non-TAC TopAndBottom**: Add object height + v_offset to subsequent paragraph vpos
4. **Inter-paragraph vpos chain update**: Cumulative running_vpos

### 3.2 Step 2: Remove HWPX-Specific Renderer Patches
- Remove vpos downward correction in `layout.rs` (lines 1102~1128)
- Clean up so renderer operates only on IR

### 3.3 Step 3: Verification
- Compare HWPX vs HWP dump with reference files (lh, vpos match confirmed)
- cargo test 716 tests all passing

## 4. Impact Scope
- `src/document_core/commands/document.rs` — LINE_SEG calculation normalization
- `src/renderer/layout.rs` — HWPX-specific patch removal
