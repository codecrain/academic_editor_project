# Task 262 Plan: Paragraph Numbering Enhancement

## Current Implementation Status

| Item | Status |
|------|------|
| Numbering/Bullet model (7 levels) | Done |
| HWP binary parser | Done |
| Number text generation (expand_numbering_format) | Done |
| NumberingState counter | Basic implementation done |
| 12 presets (numbering-defaults.ts) | Done |
| Numbering/bullet dialog | Basic implementation done |
| **Starting number mode control** | Not implemented |
| **Context menu "Paragraph Number Style"** | Not implemented |
| **Ctrl+K,N shortcut** | Not implemented |

## Unimplemented Features (Per Hancom)

### Starting Number Modes
1. **Continue from previous list (C)**: Continue incrementing from the previous number with the same numbering_id (current default behavior)
2. **Continue from prior list (P)**: When returning from a different numbering_id, restore the previous counter
3. **Start new number list (G)**: Reset counter for that level to a specified value
4. **Level start number (S)**: Specify the starting number for a specific level (default: Numbering.level_start_numbers)

### Implementation Plan

#### Step 1: NumberingState Extension (Rust)
- "Continue from prior list" support: Preserve previous numbering_id counters as history
- "Start new number list" support: Add per-paragraph start number override property
- Add `numbering_start_override: Option<u32>` field to Paragraph model

#### Step 2: WASM API
- `getNumberingInfo(sec, para)`: Query current paragraph numbering info
- `setNumberingStart(sec, para, mode, startNum)`: Set starting number mode

#### Step 3: Dialog UI Enhancement
- Starting number mode radio buttons (Continue / Continue prior / Start new)
- Level start number spinner
- 12-preset paragraph number style selection

#### Step 4: Context Menu + Shortcut
- Add "Paragraph Number Style(N)... Ctrl+K,N" to right-click context menu
- Register Ctrl+K,N chord shortcut (chordMapK)

## Reference Files

| File | Role |
|------|------|
| `src/model/style.rs` | Numbering, Bullet, HeadType, ParaShape |
| `src/renderer/layout.rs` | NumberingState |
| `src/renderer/layout/utils.rs` | expand_numbering_format |
| `src/renderer/layout/paragraph_layout.rs` | apply_paragraph_numbering |
| `rhwp-studio/src/ui/numbering-dialog.ts` | Numbering dialog |
| `rhwp-studio/src/core/numbering-defaults.ts` | Presets |
