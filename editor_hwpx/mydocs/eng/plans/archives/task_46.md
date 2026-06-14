# Task 46 Execution Plan

## Task: rhwp-studio Viewer Runtime Verification + Bug Fixes

## Goal

Verify the runtime behavior of the rhwp-studio viewer prototype implemented in Task 45, and fix bugs identified through code review.

## Current State Analysis

### Project Current State
- 15 files, TypeScript 712 lines (9 TS files)
- Build verification complete (`tsc --noEmit` passed, `vite build` successful)
- Actual runtime behavior not verified (browser execution testing not performed)

### Issues Identified from Code Review

| Category | Issue | Location | Severity |
|----------|-------|----------|----------|
| State sync | `setScrollTop()` doesn't update internal scrollY -> wrong page rendering on zoom change | viewport-manager.ts:75-78 | High |
| Rendering | CSS zoom applied after WASM rendering -- possible mismatch between WASM canvas size and PageInfo size | canvas-view.ts:103-122 | Medium |
| Rendering | When zoom goes 1.0->changed->1.0, existing canvas CSS zoom may not be cleared | canvas-view.ts:115-121 | Low |
| Stability | No try-catch in `loadDocument()` -> entire load fails if getPageInfo fails | canvas-view.ts:44-62 | Medium |
| Stability | Only `!` assertions for DOM element access -> runtime crash on structure change | main.ts throughout | Low |
| Memory | Map iteration during deletion in `releaseAll()` -- safe per ES6 spec but unclear intent | canvas-pool.ts:36-39 | Low |

## Execution Phases

### Phase 1: Vite Dev Server Startup and Build Verification

### Phase 2: Identified Bug Fixes

### Phase 3: Final Verification and Report

## Deliverables

| Document | Path |
|----------|------|
| Execution plan | `mydocs/plans/task_46.md` |
| Phase completion reports | `mydocs/working/task_46_step{N}.md` |
| Final result report | `mydocs/working/task_46_final.md` |
