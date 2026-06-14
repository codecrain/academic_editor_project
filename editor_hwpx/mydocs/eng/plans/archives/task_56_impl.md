# Task 56: Menu System Architecture Design - Implementation Plan

## Core Design

### Command ID Namespace

`category:action` format. Categories: `file`, `edit`, `view`, `format`, `insert`, `table`, `page`. Client extensions: `ext:`.

### Architecture Flow

```
[Menu click]    -+
[Toolbar click] -+-> CommandDispatcher.dispatch(cmdId) -> CommandDef.execute(services)
[Keyboard shortcut]-+                                          |
                                                    eventBus.emit('command-state-changed')
                                                          |
                                              MenuBar.updateMenuStates()
```

### Key Interfaces

- **EditorContext**: hasDocument, hasSelection, inTable, isEditable, canUndo, canRedo, zoom
- **CommandDef**: id, label, shortcutLabel?, icon?, canExecute?(ctx), execute(services, params?)
- **CommandServices**: eventBus, wasm, getContext(), getInputHandler(), getViewportManager()

---

## Phase 1: Command Infrastructure

### New Files

| File | Content |
|------|---------|
| `src/command/types.ts` | EditorContext, CommandDef, CommandServices interfaces |
| `src/command/registry.ts` | CommandRegistry (Map wrapper: register/get/getByCategory/unregister) |
| `src/command/dispatcher.ts` | CommandDispatcher (dispatch/isEnabled + command-state-changed) |
| `src/command/shortcut-map.ts` | ShortcutDef, defaultShortcuts mapping, matchShortcut() |

---

## Phase 2: Menu Bar Command Integration + Context Awareness

### New Files

| File | Content |
|------|---------|
| `src/command/commands/file.ts` | file:new-doc, file:open, file:save, etc. |
| `src/command/commands/edit.ts` | edit:undo, edit:redo, edit:cut, edit:copy, edit:paste, etc. |
| `src/command/commands/view.ts` | view:zoom-* |
| `src/command/commands/format.ts` | format:bold/italic/underline, format:align-* |
| `src/command/commands/insert.ts` | insert:* (stubs) |
| `src/command/commands/table.ts` | table:* (stubs) |
| `src/command/commands/page.ts` | page:* (stubs) |

### Completion Criteria
- Menu clicks go through command system
- Edit menu disabled when no document loaded
- Cut/copy disabled when no selection

---

## Phase 3: Keyboard/Toolbar Integration + Extension API

### New File

| File | Content |
|------|---------|
| `src/command/extension-api.ts` | StudioExtensionAPI (registerCommand, addMenuItem, addMenu) |

### Completion Criteria
- Ctrl+Z/B/I/U etc. go through command system
- Toolbar B/I/U buttons go through command system
- Custom commands registrable via extension API
- Build successful, all existing functionality maintained
