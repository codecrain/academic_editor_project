# Keyboard Shortcut Addition Guide

## How to Add Shortcuts

### 1. Shortcuts via Command System (Recommended)

Most shortcuts should be added this way.

**File**: `rhwp-studio/src/command/shortcut-map.ts`

```typescript
export const defaultShortcuts: [ShortcutDef, string][] = [
  // Existing entries...
  [{ key: 'enter', ctrl: true }, 'page:break'],  // <- Add here
];
```

**Field descriptions**:
- `key`: `e.key.toLowerCase()` value. Examples: `'enter'`, `'z'`, `'f7'`, `'home'`
- `ctrl`: `true` requires Ctrl (Windows) or Meta (Mac)
- `shift`: `true` requires Shift
- `alt`: `true` requires Alt

**Command implementation**: Define commands in files under `rhwp-studio/src/command/commands/`

```typescript
{
  id: 'page:break',
  label: 'Page Break',
  shortcutLabel: 'Ctrl+Enter',  // For menu display
  canExecute: (ctx) => ctx.hasDocument,
  execute(services) { /* implementation */ },
}
```

### 2. Chord Shortcuts (Ctrl+K -> ?)

Sequential two-key input. Add to the `chordMapK` table.

**File**: `rhwp-studio/src/engine/input-handler-keyboard.ts`

```typescript
const chordMapK: Record<string, string> = {
  b: 'insert:bookmark',
  // Korean IME state mappings as needed
};
```

### 3. Mode-Specific Key Handling (Direct Handling)

For cases where the same key behaves differently depending on the editing mode. Handle directly in mode-specific branches within `onKeyDown`.

**Applicable modes**:
- Header/footer editing mode
- Footnote editing mode
- F5 cell selection mode
- Picture/table object selection mode
- Connector/polygon drawing mode

**File**: `rhwp-studio/src/engine/input-handler-keyboard.ts`

## onKeyDown Processing Order

```
1.  Chord shortcut second key (Ctrl+K -> ?)
2.  Special mode exit (connector/polygon/image/textbox placement mode -> Escape)
3.  Hold navigation keys during IME composition
4.  Editing mode key handling (header/footer / footnote)
5.  F5 cell selection mode
6.  Cell selection mode key handling
7.  Picture/table object selection mode key handling
8.  Ctrl/Meta combo -> handleCtrlKey() -> via shortcut-map.ts
9.  Alt combo -> via shortcut-map.ts
10. Body key handling (Esc, Backspace, Enter, Arrow, etc.)
```

**Note**: If a higher-level step returns, lower-level steps are not reached.

## Related Files

| File | Role |
|------|------|
| `src/command/shortcut-map.ts` | Shortcut to command ID mapping table |
| `src/command/commands/*.ts` | Command definitions (execute functions) |
| `src/command/dispatcher.ts` | Command dispatcher |
| `src/engine/input-handler-keyboard.ts` | Keyboard event handler (onKeyDown) |
| `src/engine/input-handler.ts` | InputHandler main class (delegates handleCtrlKey) |

## Korean IME Handling

When the Korean IME is active, alphabet keys are converted to Korean characters. Register Korean key variants alongside shortcuts.

```typescript
[{ key: 'l', alt: true }, 'format:char-shape'],
[{ key: '\u3139', alt: true }, 'format:char-shape'],  // Korean IME (ㄹ)
```

## When WASM API Integration Is Needed

1. Implement `*_native` function in Rust (`src/document_core/commands/`)
2. Add WASM binding (`src/wasm_api.rs`)
3. Add TypeScript bridge (`src/core/wasm-bridge.ts`)
4. Call the bridge from the command's execute function
