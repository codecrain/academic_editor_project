# Task 133 Execution Plan — Blank Document Creation + Save

## Background

### Current Problem

rhwp-studio only provides viewer functionality for opening existing HWP files. The Menu > File > "New" item exists but is `canExecute: () => false` (stub state). The basic word processor functionality of creating a blank document, entering text, and saving as a valid HWP file is missing.

### Prerequisite (Enter Key Bug)

For word processor functionality to work on a blank document, the Enter key (paragraph split) must work correctly. Two bugs have been confirmed:

1. **Second Enter unresponsive**: Opening a blank document and pressing Enter at the caret position works the first time, but subsequent Enters have no response
2. **File corruption after Enter + Save**: Saving after pressing Enter causes a "file is corrupted" error in Hancom

### Diagnosis Results (blanK2020.hwp vs blanK2020_enter_saved_currupt.hwp)

| Item | Original (13,824B) | Corrupted (12,800B) | Difference |
|------|--------------------|--------------------|------------|
| DocInfo | CS=7, PS=20, 75 records | Same | None |
| BodyText records | 12 | 18 | +6 (normal: 2 paragraphs added) |
| para[0] PARA_HEADER | 24B, cc=17 | 24B, **cc=1** | **char_count excludes controls** |
| para[0] PARA_TEXT | 34B (with controls) | 34B (same) | cc=1 but 34B PARA_TEXT → **mismatch=corruption** |
| new para PARA_HEADER | - | **22B** | **2B short** vs original 24B (mergeFlags missing) |
| File size difference | - | -1,024B | raw_header_extra lost + structural mismatch |

### Root Cause

3 bugs in `split_at()` (`src/model/paragraph.rs:480-507`):

1. **char_count excludes control code units**: `self.char_count = split_pos + 1` → The 8xN code units from remaining controls after split are not reflected. cc=1 but PARA_TEXT contains control data, causing HWP parser to judge "corruption"
2. **raw_header_extra lost**: `raw_header_extra: Vec::new()` → Original 12-byte metadata (instanceId+mergeFlags) disappears. PARA_HEADER shrinks from 24B to 22B
3. **LineSeg tag fallback**: `tag: 0` fallback value → Should be HWP default `0x00060000`

## Implementation Steps (4 Steps)

---

### Step 1: Fix Enter Key (Paragraph Split) Bug

**Purpose**: Ensure Enter key works repeatedly in blank documents, and saving after Enter does not corrupt the file

**Files**: `src/model/paragraph.rs`, `rhwp-studio/src/engine/command.ts`

**Fix A**: Reflect control code units in char_count (`paragraph.rs:482`)
```rust
// Before: self.char_count = split_pos as u32 + 1;
// After: Reflect remaining controls' code units (8 each)
let ctrl_code_units: u32 = self.controls.len() as u32 * 8;
self.char_count = split_pos as u32 + ctrl_code_units + 1;
```

**Fix B**: Copy raw_header_extra (`paragraph.rs:507`)
```rust
// Before: raw_header_extra: Vec::new(),
// After: Copy original metadata (counts are recalculated during serialization)
raw_header_extra: self.raw_header_extra.clone(),
```

**Fix C**: LineSeg tag fallback value (`paragraph.rs:438`)
```rust
// Before: _ => (400, 400, 320, 0, 0, 0),
// After: Apply HWP default flags
_ => (400, 400, 320, 0, 0, 0x00060000),
```

**Fix D**: SplitParagraphCommand return value check (`command.ts:173-177`)
```typescript
// Before: wasm.splitParagraph(sec, para, charOffset);
//          return { sectionIndex: sec, paragraphIndex: para + 1, charOffset: 0 };
// After:
const result = JSON.parse(wasm.splitParagraph(sec, para, charOffset));
if (result.ok) {
  return { sectionIndex: sec, paragraphIndex: result.paraIdx, charOffset: 0 };
}
return this.position;
```

---

### Step 2: WASM API — `createBlankDocument`

**Purpose**: Add a Rust function to create a valid blank HWP document from a built-in template

**File**: `src/wasm_api.rs`

**Approach**: Embed template via `include_bytes!("../saved/blank2010.hwp")` into WASM

**Reason**: `Document::default()` is not a valid HWP. DocInfo re-serialization from FIX-4 is incomplete. Using blank2010.hwp created by Hancom ensures a valid DocInfo raw_stream with all required references correct.

**API**: `createBlankDocument() → JSON(version, sectionCount, pageCount, fontsUsed)`

---

### Step 3: WasmBridge + main.ts Integration

**Purpose**: Create blank document from JS → initialize document → transition to editable state

**Files**: `rhwp-studio/src/core/wasm-bridge.ts`, `rhwp-studio/src/main.ts`

- Add `createNewDocument()` method to WasmBridge
- Extract common `initializeDocument()` from `loadFile()`
- Create `createNewDocument()` function (connect to eventBus)

---

### Step 4: Command Activation + Shortcut + Menu

**Purpose**: Activate `file:new-doc` command and make it accessible to users

**Files**: `rhwp-studio/src/command/commands/file.ts`, `rhwp-studio/src/command/shortcut-map.ts`

- `canExecute: () => true`, `execute` → `eventBus.emit('create-new-document')`
- Add Alt+N shortcut (Hancom standard, Ctrl+N is intercepted by browser)

---

## Changed Files Summary

| File | Change Description | Scale |
|------|-------------------|-------|
| `src/model/paragraph.rs` | Fix split_at() char_count/raw_header_extra/tag | ~5 lines |
| `src/wasm_api.rs` | Add createBlankDocument API | ~40 lines |
| `rhwp-studio/src/engine/command.ts` | SplitParagraphCommand return value check | ~5 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | Add createNewDocument() method | ~10 lines |
| `rhwp-studio/src/main.ts` | Extract initializeDocument() + createNewDocument() | ~25 lines |
| `rhwp-studio/src/command/commands/file.ts` | Implement file:new-doc | ~5 lines |
| `rhwp-studio/src/command/shortcut-map.ts` | Add Alt+N shortcut | ~2 lines |
| **Total** | | **~90 lines** |

## Verification Methods

1. `docker compose run --rm test` — Confirm all regression tests pass
2. `docker compose run --rm wasm` — Confirm WASM build succeeds
3. In browser: Alt+N or Menu > File > New → Confirm blank 1-page document creation
4. Enter text in blank document → Confirm normal rendering
5. Repeatedly press Enter in blank document → Confirm paragraph split works correctly
6. Enter text + Enter in blank document then Ctrl+S save → Confirm opens normally in Hancom
7. Reopen saved file in rhwp-studio → Confirm content is preserved
