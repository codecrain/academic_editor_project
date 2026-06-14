# Task 167 Execution Plan: Caret Ghost Phenomenon Fix

## Problem Description

When moving cursor with arrow keys, if the cursor coordinates cannot be found in the render tree at the new position, the caret jumps to the origin (0, 0) of page 0.

## Root Cause Analysis

### Rust Side
1. `move_vertical_native()` (cursor_nav.rs:224) returns page 0 origin coordinates with `.unwrap_or((0, 0.0, 0.0, 16.0))` when `get_cursor_rect_values()` fails
2. `get_cursor_rect_values()` (cursor_nav.rs:507-510) returns origin with `unwrap_or(0.0)` on JSON parse failure
3. Phase 1 preferredX determination (cursor_nav.rs:177) returns `0.0` on failure → affects subsequent vertical movement

### JavaScript Side
4. `moveVertical()` (cursor.ts:410-414) uses WASM return value rect as-is → fallback coordinates become caret position
5. Horizontal movement's `updateRect()` has failure handling (`this.rect = null` for caret hiding), but vertical movement lacks this

## Fix Plan

### Step 1: Rust — Add rectValid Flag (cursor_nav.rs)
- Process `get_cursor_rect_values()` result with `match` in `move_vertical_native()`
- Success: Include coordinates as before
- Failure: Return `"rectValid":false` flag with coordinates as 0
- Apply same to `move_vertical_by_path_native()`

### Step 2: JavaScript — rectValid Check + Fallback (cursor.ts)
- In `moveVertical()`, when `result.rectValid === false`:
  1. Update position (logical position is correct)
  2. Call `this.updateRect()` to attempt separate cursor coordinate query
  3. If still fails, set `this.rect = null` (hide caret, prevent ghost)

### Step 3: Verification
- `cargo test` 608 pass
- WASM build + web testing

## Modified Files

| File | Change Description |
|------|-------------------|
| `src/document_core/queries/cursor_nav.rs` | rectValid flag for `move_vertical_native()`, `move_vertical_by_path_native()` |
| `rhwp-studio/src/engine/cursor.ts` | rectValid check + updateRect fallback in `moveVertical()` |

## Impact Scope

- Coordinate query success: Same behavior as before (only rectValid field added)
- Coordinate query failure: Page origin jump → caret hiding or correct position
- Horizontal movement: No changes (updateRect() fallback already exists)
