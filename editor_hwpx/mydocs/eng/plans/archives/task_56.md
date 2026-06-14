# Task 56: Menu System Architecture Design - Execution Plan

## Overview

Apply a command system architecture to the 7 menu dropdowns implemented in Task 55. Unify the currently independent routing paths for menus/toolbar/keyboard shortcuts into an integrated command dispatcher, provide dynamic menu item enable/disable based on document state, and offer a custom menu extension API for clients.

## Current Problems

1. **Distributed command routing**: Menu (`menu-command` event) / Toolbar (`format-toggle`/`format-char` events) / Keyboard (InputHandler.handleCtrlKey direct calls) -- 3 independent paths
2. **Context ignored**: Menu item disabled/enabled is HTML hardcoded. No dynamic state update based on document load status, selection presence, table context
3. **Not extensible**: No means for client custom menu additions
4. **Unsystematic command IDs**: Flat strings like `cut`, `zoom-in`, `insert-table` without namespaces

## Goal

- Command registry + unified dispatcher + context-aware state + extension API
- Full integration of menu/toolbar/keyboard 3 paths
- Zero change guarantee for existing behavior (incremental migration)

## Reference

- Hancom WebGian command system: Action ID-based Run()/CreateAction() pattern
- Our adoption: `category:action` format (e.g., `edit:copy`, `view:zoom-in`)

## Deliverables

- 4 command infrastructure files (types, registry, dispatcher, shortcut-map)
- 7 command definition files (file, edit, view, format, insert, table, page)
- 1 extension API file
- 5 existing files modified (main.ts, menu-bar.ts, toolbar.ts, input-handler.ts, index.html)
- ~610 new lines total

## Implementation Phases

| Phase | Content | Scale |
|-------|---------|-------|
| Phase 1 | Command infrastructure (types, registry, dispatcher, shortcut-map) | ~220 new lines |
| Phase 2 | Menu bar command integration + context awareness (commands/*, index.html, menu-bar.ts) | ~330 new lines |
| Phase 3 | Keyboard/toolbar integration + extension API | ~60 new lines |
