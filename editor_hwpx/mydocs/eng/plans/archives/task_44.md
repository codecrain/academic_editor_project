# Task 44 Execution Plan: Editing Engine Architecture Design

## Background

Task 43 analysis concluded that rhwp needs an **editing engine layer** to replace the web document authoring system.

Current fundamental limitations:
- **Batch pipeline**: entire section recomposition + full re-pagination for single character edit
- **No cursor/selection system**: only coordinate-based APIs, no interactive editing
- **No text/page flow engine**: no incremental reflow, table splitting, widow/orphan control
- **Single page view**: renders one page at a time, no continuous scroll view

## Project Separation

The editor is a separate sub-project from the existing viewer (`web/`).

| Project | Directory | Purpose |
|---------|-----------|---------|
| rhwp core | `src/` | Rust/WASM parser, document model, layout engine (shared) |
| rhwp viewer | `web/` | Existing viewer/simple editor (maintained) |
| **rhwp-studio** | `rhwp-studio/` | Web document authoring replacement editor (new) |

## Goal

Write an **editing engine architecture design document** for transitioning rhwp from viewer to editor. This design document serves as the blueprint for rhwp-studio implementation, covering:

1. Current architecture analysis and reusable scope identification
2. rhwp-studio project structure design
3. Editing engine layer structure design (TextFlow, BlockFlow, PageFlow)
4. Incremental layout engine design
5. Continuous scroll canvas view design (virtual scroll, viewport-based rendering)
6. Cursor model design (line-level processing, paragraph control identification)
7. Selection/input system design
8. Command history (Undo/Redo) design
9. WASM core extension plan (new APIs needed for editor)
10. Existing code refactoring plan

## Deliverables

| Document | Path |
|----------|------|
| Execution Plan | `mydocs/plans/task_44.md` |
| Implementation Plan | `mydocs/plans/task_44_impl.md` |
| Editing Engine Architecture Design | `mydocs/plans/task_44_architecture.md` |
| Step-by-Step Completion Reports | `mydocs/working/task_44_step{N}.md` |
| Final Report | `mydocs/report/task_44_final.md` |
