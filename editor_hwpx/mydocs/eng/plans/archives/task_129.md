# Task 129 Execution Plan -- Font Substitution Chain Completeness Verification

## Background

### Current Structure

Font substitution operates in 3 layers:

```
Rust style_resolver.rs (HFT->TTF substitution, 72 inputs -> 17 outputs)
  -> TypeScript font-substitution.ts (7 language-specific tables, 143 entries, multi-hop chains)
    -> CSS generic fallback (serif/sans-serif)
```

### Inspection Results -- Discovered Issues

#### Issue 1: Broken Chains (CRITICAL) -- 3 cases

Cases where TypeScript substitution resolves to a font **not registered** in font-loader.ts:

| Original Font | Substitution Result | Problem |
|---------------|-------------------|---------|
| `Gulimche` | `Haansoft Dotum` | Not registered in font-loader |
| `Ganeunsansuce` | `Ansangsu2006Ganeun` | Not registered in font-loader |
| `Gulgunsansuce` | `Ansangsu2006Gulgun` | Not registered in font-loader |

Browser cannot find the font and falls back to system default font for rendering.

#### Issue 2: Generic Fallback Mismatch (LOW)

| Keyword | Rust `generic_fallback()` | TS `fontFamilyWithFallback()` |
|---------|--------------------------|-------------------------------|
| palatino | serif | **sans-serif** (undetected) |
| georgia | serif | **sans-serif** (undetected) |
| batang (roman) | serif | **sans-serif** (undetected) |
| gungsuh (roman) | serif | **sans-serif** (undetected) |

Rust classifies `palatino`, `georgia`, `batang`, `gungsuh` keywords as serif, but TypeScript's regex `/[batangmyeongjo-gungseo]|hymjre|Times/i` does not include these patterns.

## Implementation Phases (3 Phases)

---

### Phase 1: Fix Broken Chains

**File**: `rhwp-studio/src/core/font-substitution.ts`

Connect 3 broken substitutions to registered fonts:

| Original | Current Substitution | After Fix |
|----------|---------------------|-----------|
| `Gulimche` | `Haansoft Dotum` | `Gulimche` (registered in font-loader) |
| `Ganeunsansuce` | `Ansangsu2006Ganeun` | `HamChoRom Dotum` (sans-serif fallback) |
| `Gulgunsansuce` | `Ansangsu2006Gulgun` | `HamChoRom Dotum` (sans-serif fallback) |

`Jungansansuce` -> `Ansangsu2006Jung` is also unregistered, fix together.

---

### Phase 2: Supplement Generic Fallback Regex

**File**: `rhwp-studio/src/core/font-substitution.ts`

Align `fontFamilyWithFallback()`'s serif detection regex with Rust's `generic_fallback()`:

```typescript
// [Current]
const isSerif = /[batangmyeongjo-gungseo]|hymjre|Times/i.test(fontName);

// [Changed]
const isSerif = /[batangmyeongjo-gungseo]|hymjre|times|palatino|georgia|batang|gungsuh/i.test(fontName);
```

---

### Phase 3: Integration Testing and Verification

| Item | Method |
|------|--------|
| 571 regression tests | `docker compose run --rm test` |
| WASM build | `docker compose run --rm wasm` |
| TypeScript type check | `npx tsc --noEmit` |
| Gulimche chain | resolveFont('Gulimche', 6) -> verify resolves to registered font |
| Ansangsu chain | resolveFont('Ganeunsansuce', 0) -> verify HamChoRom Dotum |
| Palatino fallback | fontFamilyWithFallback('Palatino Linotype') -> verify serif |

---

## Changed Files Summary

| File | Changes | Scope |
|------|---------|-------|
| `rhwp-studio/src/core/font-substitution.ts` | Fix 4 broken chains + supplement serif regex | ~5 lines |

## Expected Benefits

| Item | Current | After |
|------|---------|-------|
| Gulimche rendering | System default font | Gulimche (hamchod-r.woff2) |
| Ansangsu rendering | System default font | HamChoRom Dotum (hamchod-r.woff2) |
| Palatino/Georgia fallback | sans-serif (misclassified) | serif (matches Rust) |
| Change scope | -- | 1 file, ~5 lines |
