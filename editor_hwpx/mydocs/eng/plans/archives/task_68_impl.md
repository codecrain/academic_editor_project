# Task 68 Implementation Plan: Auto Re-rendering After Async Web Font Loading

## Step 1: font-loader.ts — Return background Promise

**Modified file**: `rhwp-studio/src/core/font-loader.ts`

- `loadWebFonts()` return type: `Promise<void>` → `Promise<{ backgroundDone: Promise<void> }>`
- Save existing `fire-and-forget` call to variable and return it

```typescript
// Before
export async function loadWebFonts(): Promise<void> {
  // ...
  loadFontsInBackground(rest); // fire-and-forget
}

// After
export async function loadWebFonts(): Promise<{ backgroundDone: Promise<void> }> {
  // ...
  const backgroundDone = loadFontsInBackground(rest);
  return { backgroundDone };
}
```

## Step 2: main.ts — Auto re-render on phase 2 completion

**Modified file**: `rhwp-studio/src/main.ts`

- Save `backgroundDone` Promise from `loadWebFonts()` result
- On `backgroundDone` completion, call `canvasView.refreshPages()` if document is open

```typescript
const { backgroundDone } = await loadWebFonts();

// Auto re-render on phase 2 font loading completion
backgroundDone.then(() => {
  if (canvasView && wasm.pageCount > 0) {
    console.log('[main] Background font loading complete → page re-render');
    canvasView.refreshPages();
  }
});
```

## Step 3: Build Verification

- `cd rhwp-studio && npx vite build` — TS build success confirmation
- Console log message confirms re-rendering trigger behavior

## Modified Files Summary

| File | Changes |
|------|---------|
| `rhwp-studio/src/core/font-loader.ts` | Include `backgroundDone` Promise in return type |
| `rhwp-studio/src/main.ts` | Call `refreshPages()` on `backgroundDone` completion |
