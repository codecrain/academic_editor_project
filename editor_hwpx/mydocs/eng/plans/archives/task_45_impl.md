# Task 45 Implementation Plan: rhwp-studio Project Initial Setup + Canvas Viewer Prototype

> Written: 2026-02-12

## Phase 1: Project Scaffolding + WASM Integration

### 1.1 Project Creation

Manually set up the `rhwp-studio/` directory (minimal config instead of Vite template).

### 1.2-1.8 WASM Bridge, EventBus, Types, and Initial Verification

- WasmBridge class wraps HwpDocument WASM API (init, loadDocument, renderPageToCanvas)
- Note: `renderPageToCanvas()` auto-sets Canvas size inside WASM
- EventBus: simple pub/sub pattern
- Common types: DocumentInfo, PageInfo interfaces
- Verification: `npm run dev`, WASM init success, HWP upload shows pageCount

## Phase 2: Virtual Scroll + Canvas Pool

- VirtualScroll: page offsets/heights tracking, getVisiblePages based on scrollY
- CanvasPool: acquire/release pattern, max ~7-8 canvases
- ViewportManager: scroll/zoom state management
- HTML/CSS: scroll-container with absolute-positioned canvases, centered pages

## Phase 3: Page Rendering + Coordinate System

- PageRenderer: simple wrapper around WASM renderPageToCanvas
- CoordinateSystem: viewport/document/page coordinate conversions
- CanvasView: assembles all components, handles scroll events, prefetches +/-1 pages
- Image async load: 200ms delayed re-render for data URL image decoding

## Phase 4: UI + Zoom + Wrap-Up

- Basic UI: file open button, zoom controls, page indicator
- Zoom: CSS transform scale or canvas.style.width, range 25%-400%
- Shortcuts: Ctrl+/- for zoom, Ctrl+0 for reset
- Error handling for WASM init, file load, and render failures

Total 15 files: 12 TypeScript + 1 HTML + 1 CSS + 3 config
