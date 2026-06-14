# Task 49 Execution Plan: Undo/Redo

## Background

Task 48 completed basic cursor + text input, but editing mistakes cannot be undone. Currently `InputHandler` calls WASM APIs directly without tracking editing results. Apply the Command pattern from Design Document Section 8 (Command History) to encapsulate all editing actions as reversible Command objects.

## Goal

1. Build Command pattern infrastructure (EditCommand interface + CommandHistory)
2. Implement 4 editing commands (InsertText, DeleteText, SplitParagraph, MergeParagraph)
3. Refactor InputHandler -- direct WASM calls -> Command dispatch
4. Handle Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo) shortcuts
5. Consecutive typing merge (mergeWith, consecutive input within 300ms)
6. IME composition and Undo integration (no recording during composition, record at confirmation)

## Design Core

### Command Pattern (Simplified)

```typescript
interface EditCommand {
  readonly type: string;
  readonly timestamp: number;
  execute(wasm: WasmBridge): DocumentPosition;
  undo(wasm: WasmBridge): DocumentPosition;
  mergeWith(other: EditCommand): EditCommand | null;
}
```

### Consecutive Typing Merge

```
"Hello" -> 5 InsertTextCommands -> mergeWith -> 1 (within 300ms)
Ctrl+Z once -> entire "Hello" deleted
```

## Deliverables

| File | Type | Content |
|------|------|---------|
| `src/wasm_api.rs` | Modified | Add getTextRangeInCell API |
| `rhwp-studio/src/core/wasm-bridge.ts` | Modified | Add getTextRange, getTextRangeInCell wrappers |
| `rhwp-studio/src/engine/command.ts` | **New** | EditCommand interface + 4 Command classes |
| `rhwp-studio/src/engine/history.ts` | **New** | CommandHistory (Undo/Redo stacks, merge logic) |
| `rhwp-studio/src/engine/input-handler.ts` | Modified | Command dispatch transition, Ctrl+Z/Y handling |
