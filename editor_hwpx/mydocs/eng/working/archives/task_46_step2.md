# Task 46 Step 2 Completion Report

## Step: Identified Bug Fixes

## Fixes

### 2-1. ViewportManager `setScrollTop()` State Synchronization (Severity: High)

**File:** `rhwp-studio/src/view/viewport-manager.ts`

**Problem:** When `setScrollTop(y)` is called, only the DOM's `scrollTop` is changed without updating the internal `scrollY` field. On zoom change, when `onZoomChanged()` calls `setScrollTop()` followed by `updateVisiblePages()`, `getScrollY()` returns the old scroll value, causing wrong pages to be rendered.

**Fix:** Added `this.scrollY = this.container.scrollTop` synchronization inside `setScrollTop()`. Reads `container.scrollTop` back to reflect the actual browser-clamped value.

### 2-2. CanvasView `loadDocument()` Error Handling (Severity: Medium)

**File:** `rhwp-studio/src/view/canvas-view.ts`

**Problem:** No try-catch in `getPageInfo()` loop. If a specific page info query fails, the entire load is aborted.

**Fix:**
- Wrapped individual `getPageInfo()` calls in try-catch to skip failed pages
- Early return for safety when 0 pages are loaded
- Log displays success/total page count ratio (`3/5 pages loaded`)

### 2-3. CanvasPool `releaseAll()` Safety Improvement (Severity: Low)

**File:** `rhwp-studio/src/view/canvas-pool.ts`

**Problem:** `for...of` iterates the `inUse` Map while `release()` calls `inUse.delete()`. While this works per ES6 spec, intent is unclear.

**Fix:** Copy key array first with `Array.from(this.inUse.keys())` before iterating.

### 2-4. CanvasView `renderPage()` WASM Rendering Error Handling (Severity: Medium)

**File:** `rhwp-studio/src/view/canvas-view.ts`

**Problem:** When `pageRenderer.renderPage()` fails (WASM rendering exception), the canvas remains in DOM in an empty state and is not reclaimed by the pool.

**Fix:**
- Catch WASM rendering exceptions with try-catch
- Return canvas to pool on failure and early return

## Verification

| Item | Result |
|------|--------|
| `tsc --noEmit` | Passed |
| `vite build` | Succeeded (242ms, 13 modules) |
| JS bundle | 28.57 kB (before fix 28.19 kB -> +380B) |
