# Task 116 Execution Plan

## Subject
Fix bug where Malgun Gothic maps to HamChoRom Dotum

## Background

The font substitution table (`SUBST_TABLES`) contains the rule `['Malgun Gothic',1,'HamChoRom Dotum',1]` in all 7 language tables. However, "Malgun Gothic" is already registered as a web font (`MalgunGothicW35-Regular.woff2`) in `font-loader.ts`, so it should be used as-is without substitution.

## Bug Cause

```
"Malgun Gothic" (font specified in document)
  ↓ resolveFont() called
  ↓ Matched in SUBST_TABLES: ['Malgun Gothic',1,'HamChoRom Dotum',1]
  ↓ Substitution applied
"HamChoRom Dotum" ← Sans-serif (Gothic) changed to Serif (Dotum)!
```

`resolveFont()` follows the substitution chain while checking `REGISTERED_FONTS`, but since "Malgun Gothic" is registered as a source in the substitution table, the chain starts.

## Files to Modify

| File | Changes | Lines Changed |
|------|---------|--------------|
| `rhwp-studio/src/core/font-substitution.ts` | Delete `['Malgun Gothic',1,'HamChoRom Dotum',1]` rule from 7 language tables | 7 lines deleted |
| `web/font_substitution.js` | Similarly delete the rule from 7 language tables | 7 lines deleted |

Total 14 lines deleted.

## Implementation Plan (3 Phases)

### Phase 1: Delete Substitution Rules

Delete `['Malgun Gothic',1,'HamChoRom Dotum',1]` rules from both files.

### Phase 2: Build Verification

- Docker native build
- WASM build
- rhwp-studio TypeScript compilation check

### Phase 3: Final Report + Daily Task Status Update

## Key Reference Files

| File | Reference Reason |
|------|-----------------|
| `rhwp-studio/src/core/font-substitution.ts` | TypeScript font substitution table |
| `web/font_substitution.js` | JavaScript font substitution table (for web demo) |
| `rhwp-studio/src/core/font-loader.ts` | Web font registration list (confirm "Malgun Gothic" registration) |
| `rhwp-studio/src/core/wasm-bridge.ts` | resolveFont() call point |

## Risks

| Risk | Mitigation |
|------|-----------|
| Other fonts may have similar issues | Cross-check registered web font list against substitution table for additional conflicts |
