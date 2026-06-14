# Task 178: Undo System Routing Consolidation Refactoring — Execution Plan

## Background

Task 177 introduced snapshot-based SnapshotCommand to enable Undo for paste and object deletion. The current Undo system is split across 3 entry points:

| Entry Point | Purpose | Call Site |
|-------------|---------|-----------|
| `executeCommand(cmd)` | Precise commands (text, paragraph, formatting) | input-handler.ts (private) |
| `executeSnapshotOperation(type, fn)` | Snapshot commands (paste, object delete) | input-handler.ts (public) |
| `recordWithoutExecute(cmd)` | Record after direct WASM call (move, IME) | history.ts |

Callers (keyboard/table/text handlers) directly decide **which command to create and which entry point to use**, causing:

1. New operations must determine precise/snapshot strategy at the call site
2. Changing Undo strategy (precise↔snapshot) requires modifying call sites
3. executeCommand signature is bloated with 10-type union

## Goal

Introduce event-context-based routing structure:
- Callers only describe **"what they want to do"** (OperationDescriptor)
- Router **automatically selects appropriate Undo strategy**
- Unified single entry point `executeOperation(descriptor)`

## Design

### OperationDescriptor Type

```typescript
type OperationDescriptor =
  | { kind: 'insertText'; pos: DocumentPosition; text: string }
  | { kind: 'deleteText'; pos: DocumentPosition; count: number; forward: boolean }
  | { kind: 'splitParagraph'; pos: DocumentPosition; inCell: boolean }
  | { kind: 'snapshot'; operationType: string; operation: (wasm: WasmBridge) => DocumentPosition }
  | { kind: 'record'; command: EditCommand };
```

### Router (`executeOperation`)

Routes to internal `_exec`, `_execSnapshot`, `_record` methods based on descriptor kind.

## Implementation Steps

### Step 1: OperationDescriptor Type + Router
Define type in command.ts, implement `executeOperation()` router in input-handler.ts. Keep existing methods as private (backward compatibility).

### Step 2: Call Site Migration
Convert 11+ call sites across input-handler-keyboard.ts, input-handler-text.ts, input-handler-table.ts to use `executeOperation()`.

### Step 3: Cleanup
Remove old `executeCommand()`, `executeSnapshotOperation()` (consolidated into router). Clean unused imports.

## Verification

- TS type check passes
- 615 cargo tests pass
- Functional verification: text input/delete → Undo/Redo, paste → Undo, object delete → Undo

## Out of Scope

- Existing 14 EditCommand implementations are not changed
- Undo strategy changes (e.g., switching DeleteSelection to snapshot) not done in this task
- No WASM/Rust code changes
