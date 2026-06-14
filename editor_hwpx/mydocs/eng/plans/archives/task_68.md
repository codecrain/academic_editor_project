# Task 68: Auto Re-rendering Trigger After Async Web Font Phase 2 Loading

## Background

In Task 64, we implemented web font 2-phase loading:
- **Phase 1 (sync)**: `await` load core fonts (HamchoromBatang/Dotum)
- **Phase 2 (async)**: Background load remaining 86 fonts as `fire-and-forget`

## Problem

When an HWP document is opened before phase 2 font loading completes:
1. `measureTextWidth()` uses browser default fallback metrics for unloaded fonts
2. Character widths differ from actual fonts, causing character overlap/spacing mismatch
3. Even after fonts load, **there is no auto re-rendering**, so the incorrect layout persists

## Solution

Modify `loadWebFonts()` to return a phase 2 completion Promise,
and in `main.ts`, auto re-render visible pages when that Promise completes.

## Modification Scope

| File | Action | Scale |
|------|--------|-------|
| `rhwp-studio/src/core/font-loader.ts` | Include background Promise in `loadWebFonts()` return type | ~5 lines |
| `rhwp-studio/src/main.ts` | Call `refreshPages()` on background Promise completion | ~8 lines |

## Verification

- Vite build success
- Confirm auto re-rendering log on phase 2 font loading completion immediately after document load
