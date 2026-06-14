# Task #30 Completion Report: Fix Excessive Page Count Increase After Paragraph Insert/Delete

## Results

### Stage 1: Bug Fix

**File**: `src/document_core/queries/rendering.rs` (L601-L631)

Changed `dirty_paragraphs` bitmap manipulation in `insert_composed_paragraph` and `remove_composed_paragraph` to `None` setting:

```rust
// Before (bug): bitmap insert/remove -> index mismatch with prev_measured
if let Some(bits) = &mut self.dirty_paragraphs[section_idx] {
    bits.insert(para_idx, true);
}

// After (fix): force full re-measurement -> eliminates index mismatch entirely
self.dirty_paragraphs[section_idx] = None;
```

### Stage 2: Regression Test

Added `test_split_paragraph_page_count_stability` test (`src/wasm_api/tests.rs`):
- Load kps-ai.hwp -> `splitParagraph(0, 199, 0)` -> verify page count increase <= 2
- Before fix: 78 -> 86 (delta = +8) **FAIL**
- After fix: 78 -> 78 (delta = 0) **PASS**

### Stage 3: Existing Test Pass Confirmation

778 tests all passed, 0 failures.
