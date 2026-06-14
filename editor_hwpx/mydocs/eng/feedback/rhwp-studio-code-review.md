# rhwp-studio Frontend Code Review

> **Target**: `rhwp-studio/` (Vite + TypeScript, 17,524 lines / 70 files)  
> **Purpose**: Architecture soundness and code quality evaluation + improvement recommendations  
> **Date**: 2026-02-23  

---

## 1. Overall Summary

| Item | Value |
|---|---|
| Total code | **17,524 lines** (TS 16,200 lines + CSS 1,324 lines) |
| Runtime dependencies | **0** (only Vite + TS as devDependencies) |
| Layer count | 6 (core / engine / view / ui / command / styles) |
| Largest file | `input-handler.ts` 1,148 lines |
| TypeScript strict | Enabled |

### Overall Rating: 4/5 stars

**A solid architecture for a document editor.** Pure design with zero runtime dependencies, Command pattern-based Undo/Redo, and an extension API -- this exceeds POC level and reaches product-grade design quality. However, some large files and EventBus overuse leave room for improvement from a SOLID perspective.

---

## 2. Architecture Evaluation

### 2.1 Layer Structure -- Excellent

```
main.ts (entry point + dependency assembly)
  +-- core/          WASM integration, types, constants
  |     +-- wasm-bridge.ts         585 lines  WASM <-> TS interface layer
  |     +-- types.ts               345 lines  All type definitions
  |     +-- event-bus.ts            24 lines  Pub/Sub communication hub
  |     +-- font-loader.ts              Font loading
  |     +-- font-substitution.ts        Font substitution rules
  |     +-- hwp-constants.ts       315 lines  HWP constants
  |     +-- numbering-defaults.ts  274 lines  Numbering defaults
  |     +-- paper-defaults.ts           Paper size defaults
  |
  +-- engine/        Input, editing, cursor, Undo/Redo
  |     +-- input-handler.ts      1148 lines  Coordinator + delegation
  |     +-- cursor.ts              888 lines  Cursor state machine
  |     +-- command.ts             654 lines  EditCommand implementations
  |     +-- history.ts              87 lines  Undo/Redo stack
  |     +-- input-handler-mouse.ts      Mouse event delegation
  |     +-- input-handler-keyboard.ts   Keyboard event delegation
  |     +-- input-handler-table.ts      Table input delegation
  |     +-- input-handler-text.ts       Text input delegation
  |     +-- input-handler-picture.ts    Picture input delegation
  |     +-- caret-renderer.ts           Caret rendering
  |     +-- selection-renderer.ts       Selection area rendering
  |     +-- cell-selection-renderer.ts  Cell selection rendering
  |     +-- table-resize-renderer.ts    Table resize rendering
  |
  +-- view/          Canvas-based rendering
  |     +-- canvas-view.ts         227 lines  Document view composition
  |     +-- virtual-scroll.ts      101 lines  Virtual scrolling
  |     +-- canvas-pool.ts              Canvas reuse pool
  |     +-- page-renderer.ts            Page rendering
  |     +-- viewport-manager.ts         Viewport management
  |     +-- coordinate-system.ts        Coordinate transformation
  |
  +-- command/       Command system (menu, toolbar, shortcut integration)
  |     +-- dispatcher.ts           51 lines  Single execution path
  |     +-- registry.ts             47 lines  Command registry
  |     +-- types.ts                60 lines  CommandDef, EditorContext
  |     +-- shortcut-map.ts         66 lines  Shortcut mapping
  |     +-- extension-api.ts        74 lines  Customer extension API
  |     +-- commands/               7 command modules
  |           +-- file.ts  edit.ts  view.ts  format.ts
  |           +-- insert.ts  table.ts  page.ts
  |
  +-- ui/            Dialogs, menus, toolbars
  |     +-- char-shape-dialog.ts  1040 lines  Character format dialog
  |     +-- table-cell-props-dialog.ts 935 lines
  |     +-- para-shape-dialog.ts   877 lines
  |     +-- toolbar.ts  menu-bar.ts  context-menu.ts ...
  |
  +-- styles/        CSS
        +-- dialogs.css  editor.css  toolbar.css ...
```

**Positive evaluation:**
- Clear **core -> engine -> view** unidirectional dependency flow
- `command/` exists independently from UI -- can share the same commands with future MCP Server Tools
- `view/`'s VirtualScroll + CanvasPool = essential performance patterns for large documents

### 2.2 Core Design Patterns -- Outstanding

#### 1. Command Pattern (Undo/Redo)
```
EditCommand (interface)
  +-- execute(wasm) -> DocumentPosition
  +-- undo(wasm) -> DocumentPosition
  +-- mergeWith(other) -> EditCommand | null   <- consecutive typing merge
```
- Solid abstractions with `InsertTextCommand`, `DeleteTextCommand`, `SplitParagraphCommand`, etc.
- `mergeWith()` merges consecutive typing into a single Undo unit -- excellent user experience
- `CommandHistory` (87 lines) manages cleanly. `maxSize=1000` is also appropriate

#### 2. Dual Command System
```
CommandDef (UI commands: menus, toolbars, shortcuts)
  +-- id: "category:action"  (e.g., "edit:copy", "format:bold")
  +-- canExecute(ctx: EditorContext)
  +-- execute(services: CommandServices)

EditCommand (editing commands: Undo/Redo support)
  +-- execute(wasm)
  +-- undo(wasm)
```
CommandDef handles high-level control (UI binding, activation conditions), EditCommand handles low-level editing (direct WASM calls, restoration). This **2-tier structure** is well-designed.

#### 3. Virtual Scrolling
```
VirtualScroll  ->  CanvasPool  ->  PageRenderer
    (offset calc)    (Canvas reuse)   (WASM rendering)
```
For a 100-page document, **only visible pages +/- 1 are rendered** -- Canvas pooling for memory savings.

#### 4. Customer Extension API
```typescript
StudioExtensionAPI
  +-- registerCommand(def)      // ext: prefix enforced
  +-- removeCommand(id)
  +-- executeCommand(id, params)
  +-- addMenuItem(menu, cmd)    // dynamic menu addition
  +-- removeMenuItem(cmd)
```
An extension point aligned with the Phase 1 goal of **replacing web-based document signing**. The `ext:` prefix namespace separation is well done.

---

## 3. Issues and Improvement Recommendations

### 3.1 P1: `input-handler.ts` (1,148 lines) -- God Object Tendency

**Symptom**: Mediates mouse, keyboard, table, picture, and text input all as a coordinator. Already attempted splitting into 5 delegation modules (`_mouse`, `_keyboard`, `_table`, `_text`, `_picture`), but **the `InputHandler` class itself has 107 methods**.

**Practical problems**:
- Adding a new input mode requires modifying `InputHandler` -> OCP violation
- Implicit state sharing between methods (class field dependencies)
- All dependencies must be injected for testing

**Recommendation**:
```
Current:  InputHandler { onClick, onKeyDown, ... }  (1148 lines)

Proposed: InputRouter (under 200 lines)
           +-- MouseHandler    (promote current _mouse delegation module)
           +-- KeyboardHandler
           +-- TableInputHandler
           +-- TextInputHandler
           +-- PictureInputHandler
```
Each Handler should have its own **state and lifecycle**. `InputRouter` only handles event routing.

**Expected effect**: `InputHandler` 1,148 lines -> `InputRouter` ~200 lines + 5 handlers (existing module sizes maintained)

---

### 3.2 P1: `cursor.ts` (888 lines) -- Dense Navigation Logic

**Symptom**: The `CursorState` class handles **cursor position management + directional movement + cell boundary navigation + textbox entry/exit + selection area** all at once.

**Particularly complex parts**:
- `moveHorizontalInCell()` -- 59 lines, inter-cell movement logic
- `moveVertical()` -- 53 lines, WASM call + result mapping
- `moveHorizontalInTextBox()` -- 34 lines, textbox boundary handling
- Nested table path (`cellPath`) related helpers

**Recommendation**:
```
Current:  CursorState { position + navigation + selection }  (888 lines)

Proposed: CursorState (position + selection state, ~200 lines)
           +-- NavigationStrategy
           |     +-- BodyNavigation      body text movement
           |     +-- CellNavigation      intra/inter-cell movement
           |     +-- TextBoxNavigation   textbox movement
```

---

### 3.3 P2: `EventBus` Type Safety Deficiency

**Symptom**: `EventBus` operates with `string` keys and `unknown[]` arguments -- event name typos or wrong argument types cannot be caught at compile time.

```typescript
// Current -- errors only discovered at runtime
eventBus.emit('cursor-format-changed', props);        // OK
eventBus.emit('cursor-fromat-changed', props);        // Typo but no error
eventBus.on('cursor-format-changed', (props) => { ... }); // props: unknown
```

**Recommendation**: TypedEventBus based on a type map

```typescript
interface EventMap {
  'cursor-format-changed': [CharProperties];
  'document-changed': [];
  'zoom-changed': [number];
  'current-page-changed': [number, number];
  'command-state-changed': [];
  // ...
}

class TypedEventBus {
  on<K extends keyof EventMap>(event: K, handler: (...args: EventMap[K]) => void): () => void;
  emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]): void;
}
```

**Effect**: Event name autocomplete + argument type validation + refactoring safety. **High expected impact since EventBus is used throughout the entire project.**

---

### 3.4 P2: UI Dialog Code Repetition (1,040 lines, 935 lines, 877 lines)

**Symptom**: `char-shape-dialog.ts` (1,040 lines), `table-cell-props-dialog.ts` (935 lines), `para-shape-dialog.ts` (877 lines) each repeat DOM creation, event binding, and value validation.

**Recommendation**: Declarative Dialog Builder pattern

```typescript
// Before -- imperative DOM creation (repetitive)
const label = document.createElement('label');
label.textContent = 'Font Size';
const input = document.createElement('input');
input.type = 'number';
input.min = '1';
container.append(label, input);

// After -- declarative composition
DialogBuilder.create('char-shape', 'Character Format')
  .tab('Basic', [
    field.select('fontFamily', 'Font', fontOptions),
    field.number('fontSize', 'Size', { min: 1, max: 4096 }),
    field.toggle('bold', 'Bold'),
    field.color('textColor', 'Text Color'),
  ])
  .tab('Border', [...])
  .onSubmit(applyCharShape)
  .build();
```

**Effect**: Expected 50~70% reduction in each dialog's code volume. New dialogs created by declaration only.

---

### 3.5 P2: `WasmBridge` (585 lines, 73 methods) -- Thin Wrapper Repetition

**Symptom**: Most methods are `this.doc!.xxx_native(JSON.stringify(...))` followed by JSON.parse -- many are simple 1-line delegation methods.

```typescript
insertText(sec, para, charOffset, text) {
  return JSON.parse(this.doc!.insert_text_native(sec, para, charOffset, text));
}
deleteText(sec, para, charOffset, count) {
  return JSON.parse(this.doc!.delete_text_native(sec, para, charOffset, count));
}
// ... 70+ repetitions
```

**Recommendation**: Introduce a generic call wrapper

```typescript
private call<T>(method: string, ...args: unknown[]): T {
  const fn = (this.doc as any)[method + '_native'];
  if (!fn) throw new Error(`WASM method not found: ${method}`);
  const raw = fn.call(this.doc, ...args);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// Usage
insertText(sec: number, para: number, offset: number, text: string) {
  return this.call<string>('insert_text', sec, para, offset, text);
}
```

**Effect**: Unified error handling, logging/performance instrumentation insertion point. ~40% code reduction.

---

### 3.6 P3: Korean Input (IME) Shortcut Handling -- Well Done

`shortcut-map.ts` handles both Korean/English keyboard states:
```typescript
[{ key: 'n', alt: true }, 'file:new-doc'],
[{ key: 'ㅜ', alt: true }, 'file:new-doc'],  // Also works in Korean mode
```
A **practical UX accommodation** considering the Korean IME environment -- good attention to detail.

---

### 3.7 P3: `main.ts` Dependency Assembly -- Has Improvement Points

**Symptom**: `main.ts` (290 lines) manages service instances as global variables:

```typescript
const wasm = new WasmBridge();
const eventBus = new EventBus();
let canvasView: CanvasView | null = null;
let inputHandler: InputHandler | null = null;
```

Manual assembly rather than a DI container, but appropriate for the project scale. However, the `let ... = null` pattern accumulates null check burden.

**Recommendation**: Bundle objects created after document loading into a single `EditorSession` class

```typescript
class EditorSession {
  readonly canvasView: CanvasView;
  readonly inputHandler: InputHandler;
  // ... objects that only exist after document loading

  static create(wasm, eventBus, container): EditorSession { ... }
  dispose(): void { ... }
}

// main.ts
let session: EditorSession | null = null;  // null check unified to 1 time
```

---

## 4. Quantitative Evaluation Summary

| Area | Score | Comment |
|---|---|---|
| **Architecture** | 9/10 | 6 layers, unidirectional dependencies. command/ independence excellent |
| **Design Patterns** | 9/10 | Command, Observer, Pool, Virtual Scroll appropriately applied |
| **File Size** | 6/10 | input-handler(1,148), cursor(888), UI dialogs(1,040/935/877) |
| **Type Safety** | 7/10 | TS strict enabled, but EventBus untyped. WasmBridge JSON exchange also weak |
| **Test Coverage** | 3/10 | No frontend test files exist |
| **Dependency Management** | 10/10 | Zero runtime dependencies -- highest level |
| **Extensibility** | 8/10 | Extension API design, CommandDef establishes extension foundation |
| **Overall** | **7.4/10** | Excellent architecture, implementation code quality has room for improvement |

---

## 5. Prioritized Action Items

| Priority | Item | Estimated Effort | Impact |
|---|---|---|---|
| **P0** | TypedEventBus adoption | 1 day | Project-wide compile-time safety |
| **P1** | InputHandler -> InputRouter separation | 2~3 days | engine/ maintainability |
| **P1** | CursorState navigation separation | 2 days | Bug fix ease |
| **P2** | UI dialog declarative conversion | 3~5 days | 50% UI code reduction |
| **P2** | WasmBridge generic wrapper | 1 day | WASM call unification |
| **P3** | EditorSession introduction | 0.5 days | Null check reduction |
| **P3** | Frontend test introduction | 1~2 weeks | Quality assurance |

---

## 6. Conclusion

rhwp-studio is **built on a very solid architectural foundation as a product-grade web editor**.

**Most impressive aspects:**
1. **Zero runtime dependencies** -- implementing a document editor with pure TS+DOM without React/Vue/Angular. Favorable for bundle size, security, and compatibility
2. **Dual command system** -- precise separation of UI commands (CommandDef) and editing commands (EditCommand)
3. **Pre-built customer extension API** -- essential functionality for Phase 1 productization

**Immediate start recommended:** TypedEventBus adoption (P0). A 1-day investment can raise the entire project's type safety by one level.
