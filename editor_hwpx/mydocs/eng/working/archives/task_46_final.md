# Task 46 Final Report

## Task: rhwp-studio Viewer Runtime Verification + Bug Fixes

## Overview

Verified the runtime behavior of the rhwp-studio viewer prototype (15 files, 712 lines) implemented in Task 45, and fixed a total of 5 bugs: 4 from code review + 1 from browser testing.

## Steps Performed

| Step | Work Content | Result |
|------|-------------|--------|
| **1** | Vite dev server launch and build verification | tsc passed, vite build succeeded, dev server 140ms startup |
| **2** | Code review-based 4 bug fixes | All 4 fixed |
| **3** | Browser runtime test + 1 additional bug fix | `measureTextWidth` missing fix, all items verified passing |

## Fixed Bug List

| No | File | Problem | Severity | Discovery Method |
|----|------|---------|----------|------------------|
| 1 | `wasm-bridge.ts` | `globalThis.measureTextWidth` not registered -> WASM rendering total failure | **Critical** | Browser test |
| 2 | `viewport-manager.ts` | `setScrollTop()` internal scrollY not updated -> wrong page rendering on zoom change | High | Code review |
| 3 | `canvas-view.ts` | `loadDocument()` getPageInfo loop has no try-catch -> partial failure causes total abort | Medium | Code review |
| 4 | `canvas-view.ts` | `renderPage()` WASM rendering exception leaves empty canvas in DOM | Medium | Code review |
| 5 | `canvas-pool.ts` | `releaseAll()` modifies Map during iteration -> explicit key array copy for safety | Low | Code review |

## Fix Details

### 1. WasmBridge `measureTextWidth` Registration (Critical)

**Problem:** The WASM renderer (`renderPageToCanvas`) calls `globalThis.measureTextWidth(font, text)` for text layout. While the existing `web/index.html` had it registered via `<script>` tag, it was missing in rhwp-studio, causing total rendering failure.

**Fix:** Register a Canvas 2D API-based `measureTextWidth` function on `globalThis` before WASM initialization in `WasmBridge.initialize()`.

```typescript
private installMeasureTextWidth(): void {
  if ((globalThis as Record<string, unknown>).measureTextWidth) return;
  let ctx: CanvasRenderingContext2D | null = null;
  let lastFont = '';
  (globalThis as Record<string, unknown>).measureTextWidth = (font: string, text: string): number => {
    if (!ctx) {
      ctx = document.createElement('canvas').getContext('2d');
    }
    if (font !== lastFont) {
      ctx!.font = font;
      lastFont = font;
    }
    return ctx!.measureText(text).width;
  };
}
```

### 2. ViewportManager `setScrollTop()` State Synchronization

```typescript
// Before
setScrollTop(y: number): void {
  if (this.container) {
    this.container.scrollTop = y;
  }
}

// After
setScrollTop(y: number): void {
  if (this.container) {
    this.container.scrollTop = y;
    this.scrollY = this.container.scrollTop;  // Reflect browser-clamped value
  }
}
```

### 3. CanvasView `loadDocument()` Error Handling

- Wrapped individual `getPageInfo()` calls in try-catch to skip failed pages
- Early return when 0 pages loaded
- Log shows success/total ratio

### 4. CanvasView `renderPage()` Error Handling

- Returns canvas to pool on WASM rendering exception and early returns
- Prevents empty canvas DOM residue

### 5. CanvasPool `releaseAll()` Safety

```typescript
// Before
releaseAll(): void {
  for (const [pageIdx] of this.inUse) { this.release(pageIdx); }
}

// After
releaseAll(): void {
  const pages = Array.from(this.inUse.keys());
  for (const pageIdx of pages) { this.release(pageIdx); }
}
```

## Browser Runtime Verification Results

| Verification Item | Result |
|-------------------|--------|
| WASM initialization success (status bar message) | Normal |
| HWP file load and page rendering | Normal |
| Canvas pooling during continuous scroll | Normal |
| Scroll position maintained on zoom change | Normal |
| Drag-and-drop visual feedback | Normal |

## Build Verification

| Item | Before Fix | After Fix |
|------|-----------|-----------|
| `tsc --noEmit` | Passed | Passed |
| `vite build` | Succeeded (240ms) | Succeeded (99ms) |
| JS bundle | 28.19 kB | 28.82 kB (+630B) |
| CSS | 1.38 kB | No change |
| WASM | 874.62 kB | No change |

## Changed Files

| File | Changes |
|------|---------|
| `rhwp-studio/src/core/wasm-bridge.ts` | Added `installMeasureTextWidth()` method |
| `rhwp-studio/src/view/viewport-manager.ts` | Added scrollY sync in `setScrollTop()` |
| `rhwp-studio/src/view/canvas-view.ts` | Added error handling for `loadDocument()`, `renderPage()` |
| `rhwp-studio/src/view/canvas-pool.ts` | Changed `releaseAll()` to iterate over copied key array |

## Deliverables

| Document | Path |
|----------|------|
| Execution Plan | `mydocs/plans/task_46.md` |
| Step 1 Report | `mydocs/working/task_46_step1.md` |
| Step 2 Report | `mydocs/working/task_46_step2.md` |
| Final Report | `mydocs/working/task_46_final.md` |
