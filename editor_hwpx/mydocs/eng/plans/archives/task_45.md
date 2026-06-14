# Task 45 Execution Plan: rhwp-studio Project Initial Setup + Canvas Viewer Prototype

> Written: 2026-02-12

## Goal

Build the initial **rhwp-studio** project based on the architecture designed in Task 44, and implement a **viewer prototype** that displays HWP documents in a continuous scroll canvas view.

## Scope

### Included

- Vite + TypeScript project initial setup
- WASM integration (`pkg/` -> rhwp-studio import)
- Continuous scroll canvas view (VirtualScroll + CanvasPool)
- 3-level coordinate system (Document / Page / Viewport)
- File upload -> rendering basic UI
- Zoom (scale in/out) basic support

### Excluded (Future Tasks)

- Editing engine (cursor, selection, input, commands)
- HwpCtrl compatibility layer
- Docker build system (local development first)

## Phase Structure (4 Phases)

### Phase 1: Project Scaffolding + WASM Integration

- Vite + TypeScript project creation
- `WasmBridge` class: WASM initialization, document loading, rendering wrapping
- `EventBus` class: simple publish/subscribe events
- Common type definitions (`types.ts`)
- Verification: WASM load -> HWP file open -> `console.log(pageCount)` success

### Phase 2: Virtual Scroll + Canvas Pool

- `VirtualScroll`: Page Y offset calculation, visible page list
- `CanvasPool`: Canvas allocation/release/reuse, DOM add/remove
- `ViewportManager`: Scroll event handling, zoom state
- Scroll container HTML/CSS layout

### Phase 3: Page Rendering + Coordinate System

- `PageRenderer`: WASM `renderPageToCanvas()` calls, page decoration (shadow, border)
- `CoordinateSystem`: Viewport <-> Document <-> Page coordinate conversion
- `CanvasView`: Full view assembly
- Auto-render visible pages on scroll, release off-screen pages
- Prefetch: pre-render 1-2 adjacent pages

### Phase 4: UI + Zoom + Finalization

- Basic UI: file open button, zoom controls (+/-/100%), page display (current/total)
- Zoom handling: Canvas size adjustment + page height recalculation + scroll position correction
- Current page display: page number update based on scroll position
- Keyboard shortcuts: Ctrl+/Ctrl- (zoom), Ctrl+0 (100%)

## Performance Targets

| Metric | Target |
|--------|--------|
| WASM initialization | < 100ms |
| Document load (10 pages) | < 500ms |
| Page rendering | < 50ms/page |
| Scroll response | 60fps (16ms frame) |
| Canvas pool size | Max 5-7 |
