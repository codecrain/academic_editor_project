# Task 204 Implementation Plan: Multi-Page Grid View on Zoom Out

## Step 1: VirtualScroll Grid Layout Logic

- Extend `setPageDimensions(pages, zoom, viewportWidth?)`
- Calculate grid layout when zoom ≤ 50% + viewportWidth provided
- Add `pageLefts[]` array, `columns` field
- Add `getPageLeft(pageIdx)` method
- Add `isGridMode()` method

## Step 2: CanvasView Grid Rendering

- `renderPage()`: in grid mode, set canvas.style.left to pageLeft
- `onZoomChanged()`, `loadDocument()`, `refreshPages()`: pass viewportWidth
- Add `grid-mode` class to canvas in grid mode (CSS branching)

## Step 3: CSS + CaretRenderer Support

- `editor.css`: `.grid-mode` canvas removes `transform:translateX(-50%)`
- `caret-renderer.ts`: use VirtualScroll.getPageLeft() for pageLeft calculation
