# Task 204: Multi-Page Grid View on Zoom Out

## Goal

Arrange pages in a horizontal N-column grid when zoom is below a certain level (Hancom/MS Word style).

## Current State

- Pages are arranged in a single vertical column at all zoom levels
- `VirtualScroll.setPageDimensions()`: vertical single-column offset calculation
- `CanvasView.renderPage()`: centered with CSS `left:50%; transform:translateX(-50%)`
- Zoom range: 25%~400%

## Behavior Specification

| Zoom Level | Layout | Note |
|------------|--------|------|
| Above 50% | 1 column (current) | Existing behavior maintained |
| 50% or below | N-column grid | Column count auto-calculated to fit viewport width |

### Column Count Calculation
- `columns = floor(viewportWidth / (pageWidth * zoom + gap))`
- Minimum 1 column, maximum page count

## Implementation Approach

### VirtualScroll Extension
- `setPageDimensions(pages, zoom, viewportWidth?)` — calculate grid layout when viewportWidth is provided
- In grid mode, `pageOffsets[i]` is Y offset based on row
- New field: `pageLefts[i]` — X offset per page (for grid layout)
- `getPageLeft(pageIdx)` method addition
- `columns` field — current column count (1 means single column mode)

### CanvasView Modification
- `renderPage()`: in grid mode, set CSS left to `pageLefts[i]` (instead of centering)
- `onZoomChanged()`: pass viewportWidth

### CSS Modification
- In grid mode, `transform:translateX(-50%)` must be removed

## Impact Scope

| File | Modification |
|------|-------------|
| `rhwp-studio/src/view/virtual-scroll.ts` | Grid layout logic, pageLefts array |
| `rhwp-studio/src/view/canvas-view.ts` | renderPage() X-coordinate, viewportWidth passing |
| `rhwp-studio/src/styles/editor.css` | Grid mode CSS branching |
| `rhwp-studio/src/engine/caret-renderer.ts` | pageLeft calculation grid support |
| `rhwp-studio/src/view/viewport-manager.ts` | viewportWidth passing |

## Out of Scope

- Page click/editing disabled in grid mode (read-only preview)
- Page number overlay → follow-up task
