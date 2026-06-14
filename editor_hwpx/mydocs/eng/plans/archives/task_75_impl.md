# Task 75: Fix Text Before Table Rendering Below Table

## Background

On page 2 of `samples/hwp-multi-001.hwp`, text paragraphs (paragraphs 22-27) located before table 8 (paragraph 28) are rendered below the table, and the first row is hidden behind the table.

### Document Structure

```
Paragraph 21: Table 7 (4 rows x 6 cols) — page 1
Paragraphs 22~27: Text only (detailed statistics of 2024 overseas direct investment...)
Paragraph 28: Table 8 (2 rows x 6 cols) — page 2
Paragraph 29: Group (group images)
Paragraph 30: Table 9 (1 row x 3 cols) — page 3
```

### Current Rendering (incorrect)

```
[Table 8] <- y~109 (page top)
[Text paragraphs 22~27] <- y~568 (below table, first row hidden)
[Image group]
```

### Expected Rendering

```
[Text paragraphs 22~27] <- positioned above table
[Table 8]
[Image group]
```

### Problem Analysis

| Location | Problem |
|----------|---------|
| `pagination.rs:370-372` | `has_table` paragraphs are skipped in initial loop — but text-only paragraphs (22~27) can also be affected |
| `pagination.rs:527-598` | Table-containing paragraph processing creates only Table items, text before table (line 0) not processed |
| `layout.rs:260-274` | For FullParagraph with table, only spacing_before is applied then skip |

---

## Implementation Plan

### Step 1: Problem Reproduction and Precise Root Cause Analysis

**Goal**: Debug pagination to check how paragraphs 22~27 are ordered in page items

- Debug output pagination item list and order for page 2
- Compare timing of paragraphs 22~27 registration as FullParagraph with table 8 (paragraph 28) Table item order
- Identify precise cause (pagination order vs layout y-coordinate calculation)

### Step 2: Pagination/Layout Fix

**Goal**: Ensure text paragraphs before table render in correct order

Fix direction per possible cause:
- **Pagination order issue**: Text paragraphs placed after Table → fix item insertion order
- **Layout y-coordinate issue**: Items in correct order but y calculation wrong → fix para_start_y calculation
- **Mixed text+table paragraph issue**: Paragraph 28 has both text and table, line 0 text missing → add PartialParagraph(line 0)

### Step 3: Build and Verification

1. `docker compose --env-file /dev/null run --rm test` — all tests pass
2. `samples/hwp-multi-001.hwp` SVG export → confirm text renders above table on page 2
3. Existing document SVG export → confirm no regression

---

## Expected Modified Files

| File | Changes | Scale |
|------|---------|-------|
| `src/renderer/pagination.rs` | Fix page item order or handle text before table | ~10-20 lines |
| `src/renderer/layout.rs` | Fix y-coordinate calculation (if needed) | ~5-10 lines |
