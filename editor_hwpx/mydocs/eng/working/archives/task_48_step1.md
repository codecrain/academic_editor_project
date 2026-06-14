# Task 48 Step 1 Completion Report

## Step: WASM API Addition -- getCursorRect, hitTest (Rust)

## Work Performed

Implemented 2 Phase 2 cursor/hit test APIs in `wasm_api.rs` for both WASM + Native.

### Added WASM Methods (2)

| No | API | WASM Signature | Return JSON |
|----|-----|---------------|-------------|
| 1 | `getCursorRect` | `(sec, para, charOffset) -> String` | `{pageIndex, x, y, height}` |
| 2 | `hitTest` | `(page, x, y) -> String` | `{sectionIndex, paragraphIndex, charOffset}` |

### Added Helper Methods

| Method | Purpose |
|--------|---------|
| `find_pages_for_paragraph(sec, para) -> Vec<u32>` | Global page number list containing the paragraph |
| `find_char_at_x(positions, x) -> usize` | X coordinate -> character index in character position array |

### Implementation Algorithms

**getCursorRect:**
1. Find pages containing the paragraph via `find_pages_for_paragraph()`
2. Build render tree for each candidate page (`build_page_tree()`)
3. Recursive traversal of TextRunNode -> (sec, para, charOffset) matching
4. `compute_char_positions()` for precise x coordinate interpolation within run
5. Empty paragraph fallback: return first TextRun bbox coordinates

**hitTest:**
1. Build render tree for the page
2. Collect all body TextRunNodes (pre-compute character positions)
3. 3-stage hit check:
   - (1) Exact bbox hit -> `find_char_at_x()` for character index
   - (2) Same-line (y range) snap -> line start/end handling
   - (3) Nearest line (y distance) -> x coordinate matching
4. Empty page fallback: return section's first paragraph start

## Verification Results

| Item | Result |
|------|--------|
| `cargo test` (Docker) | **474 tests passed** (0 failed) |
| `wasm-pack build` (Docker) | **Succeeded** (26.98s, release optimization) |
| `pkg/rhwp.d.ts` | 2 API signatures included confirmed |
| Existing API compatibility | No changes |

### TypeScript Signatures (Auto-generated)

```typescript
getCursorRect(section_idx: number, para_idx: number, char_offset: number): string;
hitTest(page_num: number, x: number, y: number): string;
```

## Changed Files

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | Phase 2 WASM methods (2) + Native methods (3) + helper function (1) added |
