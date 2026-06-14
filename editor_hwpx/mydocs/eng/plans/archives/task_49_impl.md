# Task 49 Implementation Plan: Undo/Redo

## Strategic Direction

Transition the current structure where `InputHandler` directly calls WASM APIs to the **Command pattern**. Command objects encapsulate execution and reverse-execution of editing actions, while `CommandHistory` manages Undo/Redo stacks. Based on Design Document Section 8 but excluding unimplemented modules (IncrementalLayout, DirtyTracker).

## Core Design

### Command-WASM Mapping

| Command | execute() | undo() | mergeWith |
|---------|-----------|--------|-----------|
| InsertTextCommand | insertText[InCell] | deleteText[InCell] | Consecutive position + within 300ms |
| DeleteTextCommand | getTextRange[InCell] -> deleteText[InCell] | insertText[InCell] | Consecutive BS/Del + within 300ms |
| SplitParagraphCommand | splitParagraph | mergeParagraph | Not possible |
| MergeParagraphCommand | getParagraphLength -> mergeParagraph | splitParagraph | Not possible |

### IME Composition <-> Undo Boundary

```
[During composition] compositionstart -> input(update) x N
  -> Direct WASM calls (NOT recorded in Undo stack, current behavior maintained)

[Composition confirmed] compositionend
  -> Create InsertTextCommand, CommandHistory.execute()
  -> Previous composition text already has only final version in document
  -> Command's position = compositionAnchor, text = confirmed text
```

## Phase Structure (4 Phases)

### Phase 1: WASM API Enhancement + TypeScript Wrappers

- Rust: Add `getTextRangeInCell` WASM/Native method
- TypeScript: Add `getTextRange`, `getTextRangeInCell` wrappers to `wasm-bridge.ts`

### Phase 2: Command Pattern Infrastructure

- `engine/command.ts`: EditCommand interface + 4 Command classes
- `engine/history.ts`: CommandHistory class with undo/redo stacks, merge logic

### Phase 3: InputHandler Refactoring + Ctrl+Z/Y

- Integrate `CommandHistory` into `InputHandler`
- Convert editing methods to Command dispatch
- Add Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z handlers
- IME composition (isComposing branch) maintains existing direct WASM calls

### Phase 4: Build Verification + Runtime Testing

Runtime test items include:
- Text input + Ctrl+Z, Ctrl+Z + Ctrl+Y
- Backspace/Delete + Ctrl+Z
- Enter + Ctrl+Z, paragraph merge + Ctrl+Z
- Consecutive typing merge
- Korean IME input + Ctrl+Z
- Cell editing + Ctrl+Z
- Multiple Undo + new edit (Redo stack clear)
