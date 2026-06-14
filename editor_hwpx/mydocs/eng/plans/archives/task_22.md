# Task 22: Text Reflow and Paragraph Splitting (B-308)

## Execution Plan

### 1. Overview

Currently `insert_text_at()` / `delete_text_at()` only perform simple shifting of `line_segs.text_start` without recalculating line breaks. Since original line break information from HWP files is used as-is after editing, line breaks become inaccurate after text insertion/deletion.

Also, Enter key should perform **paragraph splitting** (creating a new Paragraph), not `\n` insertion, and Backspace at paragraph start should perform **paragraph merging** (combining with previous paragraph).

### 2. Goals

1. **Text reflow**: Recalculate `line_segs` based on column width after text editing
2. **Paragraph splitting (Enter)**: Split paragraph into two at caret position
3. **Paragraph merging (Backspace@start)**: Merge current paragraph into previous paragraph

### 3. Current Architecture Analysis

#### Core Pipeline
```
Text editing → insert_text_at()/delete_text_at()
            → compose_section() [line splitting based on line_segs]
            → paginate() [page splitting]
            → renderCurrentPage() [rendering]
```

### 4. Implementation Steps

#### Step 1: line_segs Recalculation (Reflow Engine)
#### Step 2: Paragraph Splitting (Enter → splitParagraph)
#### Step 3: Paragraph Merging (Backspace@start → mergeParagraph)
#### Step 4: Integration Testing and Build Verification

### 5. Impact Scope

| File | Changes |
|------|---------|
| `src/renderer/composer.rs` | Add `reflow_line_segs()` function |
| `src/model/paragraph.rs` | Add `split_at()`, `merge_from()` methods |
| `src/wasm_api.rs` | Add `splitParagraph`, `mergeParagraph` APIs, integrate reflow into insert/delete |
| `web/editor.js` | Enter → splitParagraph, Backspace@start → mergeParagraph |
