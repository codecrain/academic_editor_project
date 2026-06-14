# Task 130 Execution Plan -- Document-Specific Dynamic Web Font Loading

## Background

### Current Problem

Currently, `font-loader.ts` loads **88 font names x 31 woff2 files (~31MB)** regardless of document content. Since most HWP documents use only 2~5 fonts, 70~90% of bandwidth is wasted.

### Current Loading Flow

```
main.ts: loadWebFonts()           <- called before document load
  +-- Step 1: Register 88 CSS @font-face entries (no network)
  +-- Step 2: Immediately load 2 CRITICAL_FONTS (HamChoRom Batang/Dotum)
  +-- Step 3: Background batch load remaining 86 (4 at a time)
```

Since we cannot know which fonts a document uses, all fonts must be loaded.

### Solution Direction

Add a list of fonts used by the document to WASM `getDocumentInfo()`, and change `font-loader.ts` to selectively load only those fonts.

## Core Data Flow

```
HWP file -> WASM parser -> document.font_faces[0..6] (7 language categories)
  -> getDocumentInfo() -> { ..., fontsUsed: ["HamChoRom Batang", "Calibri", ...] }
    -> font-loader.ts -> selectively load only matching woff2 files
```

### font_faces Structure (Rust)

```rust
// document.doc_info.font_faces: Vec<Vec<Font>>
// [0]=Korean, [1]=English, ..., [6]=User
// Font { name: "HamChoRom Batang", alt_type: 2, alt_name: Some("Hanyang Shin Myeongjo"), ... }
```

## Implementation Phases (3 Phases)

---

### Phase 1: WASM API Extension -- Add fontsUsed

**File**: `src/wasm_api.rs` (line 253)

Add `fontsUsed` field to `get_document_info()`. Collect unique font names from the document's `font_faces` across 7 categories, and return the final names after applying substitution (`resolve_font_substitution`).

```rust
pub fn get_document_info(&self) -> String {
    // Existing fields (version, sectionCount, pageCount, encrypted, fallbackFont)
    // + fontsUsed: list of unique font names used in the document
    let mut fonts = std::collections::BTreeSet::new();
    for (lang_idx, lang_fonts) in self.document.doc_info.font_faces.iter().enumerate() {
        for font in lang_fonts {
            let resolved = resolve_font_substitution(&font.name, font.alt_type, lang_idx)
                .unwrap_or(&font.name);
            fonts.insert(resolved.to_string());
        }
    }
    // Serialize as JSON array
}
```

**File**: `rhwp-studio/src/core/types.ts`

```typescript
export interface DocumentInfo {
  // ... existing fields ...
  fontsUsed: string[];  // List of font names used in the document
}
```

---

### Phase 2: font-loader Dynamic Loading + Status Bar Progress

**File 1**: `rhwp-studio/src/core/font-loader.ts`

Change current `loadWebFonts()` to accept a document font list:

```typescript
export async function loadWebFonts(
  docFonts?: string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ backgroundDone: Promise<void> }> {
  // 1) Register all CSS @font-face (no network, same as before)
  // 2) If docFonts provided, load only those fonts + CRITICAL_FONTS
  //    If docFonts not provided, load all as before (compatibility)
  const usedFiles = docFonts
    ? FONT_LIST.filter(f => docFonts.includes(f.name) || CRITICAL_FONTS.has(f.name))
    : FONT_LIST;
  // 3) Immediate load + background load (progress via onProgress callback)
}
```

Key: CSS @font-face registration remains complete (zero cost). **Only actual network loads are selective**.

**Status bar progress**: Display progress in `#sb-message` area via `onProgress` callback:

```
Loading fonts... (3/5)   ->   Font loading complete (5)   ->   (auto-dismiss after 2s)
```

---

### Phase 3: main.ts Integration + Testing

**File**: `rhwp-studio/src/main.ts`

Pass `fontsUsed` to `loadWebFonts` after document load:

```typescript
// [Current] Load fonts before document load
await loadWebFonts();

// [Changed] Initially load CRITICAL only, load additional fonts after document load
await loadWebFonts();  // CRITICAL only (no docFonts)
// ... loadDocument() ...
loadWebFonts(docInfo.fontsUsed);  // Load document fonts additionally
```

Or more simply: call once right after document load:

```typescript
const docInfo = wasm.loadDocument(data);
await loadWebFonts(docInfo.fontsUsed);  // Load only document fonts
```

**Testing**:

| Item | Method |
|------|--------|
| 571 regression tests | `docker compose run --rm test` |
| WASM build | `docker compose run --rm wasm` |
| TypeScript type check | `npx tsc --noEmit` |
| fontsUsed return verification | Sample HWP -> getDocumentInfo -> verify fontsUsed array |
| Selective load verification | Document using only HamChoRom Batang -> only hamchob-r.woff2 loaded |

---

## Changed Files Summary

| File | Changes | Scope |
|------|---------|-------|
| `src/wasm_api.rs` | Add fontsUsed to `get_document_info()` | ~15 lines |
| `rhwp-studio/src/core/types.ts` | fontsUsed field in DocumentInfo | 1 line |
| `rhwp-studio/src/core/font-loader.ts` | docFonts selective loading + onProgress callback | ~20 lines |
| `rhwp-studio/src/main.ts` | Pass fontsUsed after document load + status bar progress | ~10 lines |

## Design Decision Rationale

| Decision | Reason |
|----------|--------|
| Keep all CSS @font-face | Zero cost (no network), immediately available for font editing |
| Selective network loads only | Actual bandwidth savings target |
| Apply resolve_font_substitution | Match final font names used by Rust renderer |
| Load all if docFonts absent | Backward compatibility (web/editor.html, etc.) |

## Expected Benefits

| Item | Current | After |
|------|---------|-------|
| Typical document (2~5 fonts) | 31MB full load | 2~8MB selective load |
| Bandwidth savings | 0% | 70~90% |
| Initial rendering speed | Background load 86 fonts | Immediate load only needed fonts |
| Change scope | -- | 4 files, ~35 lines |
