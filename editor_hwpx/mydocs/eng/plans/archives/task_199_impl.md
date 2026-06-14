# Task 199 Implementation Plan: Paragraph Marks Correction to Hancom Level + Forced Line Break Implementation

## Step Configuration (3 Steps)

### Step 1: Forced Line Break (Shift+Enter) Editing Feature Implementation

**Rust side:**
- Add `insert_line_break_native()` function to `src/document_core/commands/text_editing.rs`
  - Insert `\n` character into paragraph text at current cursor position
  - Move cursor to next position
- Expose `insertLineBreak(para_idx, char_idx)` WASM API in `src/wasm_api.rs`

**TypeScript side:**
- Add `InsertLineBreakCommand` class to `rhwp-studio/src/engine/command.ts`
- Add `e.shiftKey` branching to Enter case in `rhwp-studio/src/engine/input-handler-keyboard.ts`
  - Shift+Enter → Execute `InsertLineBreakCommand`
  - Enter → Existing `SplitParagraphCommand` maintained
- Add `insertLineBreak()` bridge to `rhwp-studio/src/core/wasm-bridge.ts`

**Verification:**
- cargo test passes
- After WASM build, confirm line break behavior on Shift+Enter input in web

### Step 2: is_line_break_end Flag Normalization + Renderer Symbol Correction

**layout.rs modification:**
- Add `is_line_break_end` setting logic: set true on the last TextRunNode based on `ComposedLine.has_line_break`

**Renderer symbol correction (SVG/HTML/Canvas):**
- Hard return (is_para_end): maintain or change to appropriate Unicode character
  - Select optimal Unicode based on Hancom reference images
- Forced line break (is_line_break_end): use separate symbol (distinct from hard return)
- Maintain color #4A90D9 (blue)

**Verification:**
- Confirm rendering of paragraphs containing line breaks in existing HWP files
- Confirm two symbols are displayed distinctly when paragraph marks display is toggled

### Step 3: Test + WASM Build + Verification

**Native tests:**
- Add line break insertion unit tests
- Add paragraph mark symbol rendering tests
- Confirm all cargo test passes

**WASM build and integration verification:**
- Docker WASM build
- E2E verification in web editor:
  1. Shift+Enter input → line break inserted (no paragraph split)
  2. Paragraph marks display shows distinct hard return and forced line break symbols
  3. Opening existing HWP files → documents containing line breaks render correctly
