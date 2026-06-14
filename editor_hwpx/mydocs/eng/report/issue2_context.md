# Issue #2 Context Document — Editing Pipeline Derived Gap Fixes

> Date: 2026-04-01
> Related issue: [#2](https://github.com/edwardkim/rhwp/issues/2)

---

## 1. Current Project Position

### v0.5.0 Achievements (Rendering Accuracy)

Through v0.5.0, the following was achieved with the goal of matching Hancom's rendering:

| Area | Achievement |
|------|------------|
| Typesetting accuracy | LINE_SEG match rate 87.7%, line count 100% match (#1) |
| HWPX parsing | TabDef, textbox, underline, tab code unit mapping (#13~#17) |
| IR comparison tool | ir-diff CLI command for automatic HWPX-HWP difference detection (#18) |
| Pagination | Floating-point cumulative error tolerance (#14) |
| Rendering | Tab leader fill patterns (12 types), underline/strikethrough (13 types), wave lines |

### Issue #2 Goal: Natural Editing

Even with accurate rendering, layout breaks or jumps occur during editing. Issue #2 aims to fix derived gaps in the editing pipeline so that keystrokes -> re-typesetting -> rendering flows smoothly.

---

## 2. Prior Work Summary

### Issue #1: baseline/line_height/line_spacing Reverse Engineering (Complete)

The fundamental task of reverse engineering Hancom's LINE_SEG generation logic.

| Item | Result |
|------|--------|
| line_height | `font_size_to_line_height(max_font_size in line)` — calculated independently per line |
| baseline_distance | `line_height * 0.85` — confirmed as Hancom's actual rule |
| Verification method | rhwp-generated -> Hancom save -> LINE_SEG 1:1 comparison |
| Accuracy | 100% match on 3 multi-size ground truths, 6/6 controlled samples at 100% |

Prior tasks (3/28-29):
- Task 398: LINE_SEG match rate measurement infrastructure
- Task 399: Line breaking algorithm reverse engineering (TTC parsing, font metrics)
- Task 400: Text width measurement accuracy (HWPUNIT integer accumulation)
- Task 403: Auto-generation of reverse engineering HWP samples (65 samples)
- Task 404: English width measurement reverse engineering (break point, font aliases, Times substitution)

### 3/31 Completed Tasks (HWPX Parsing + Rendering)

| Issue | Description | Key Fix |
|-------|-------------|---------|
| #13 | HWPX table of contents tab leader | TabDef `<hp:switch>` parsing, 2x scale, fill_type mapping, 12 fill patterns |
| #14 | Pagination bottom margin | Floating-point cumulative error 0.5px tolerance |
| #15 | HWPX textbox parsing | curSz width=0 fallback, fillBrush, lineShape style |
| #16 | 13 underline type rendering | underline/strikeout shape parsing, wave lines, pattern_type fix |
| #17 | HWPX tab line wrapping | Tab character UTF-16 8 code unit mapping |
| #18 | IR comparison tool | ir-diff CLI, ParaShape lineSpacing 2x scale fix |

---

## 3. Currently Implemented Incremental Processing Mechanisms

rhwp already has a substantial level of incremental layout:

### Dirty Flag System

| Mechanism | Location | Role |
|-----------|----------|------|
| `dirty_sections` | document.rs | Section-level dirty flags |
| `dirty_paragraphs` | document.rs | Paragraph-level dirty bitmap |
| `mark_section_dirty()` | rendering.rs | Mark only a section as dirty |
| `mark_paragraph_dirty()` | rendering.rs | Mark only a specific paragraph as dirty |

### Incremental Recomposition/Measurement

| Mechanism | Role |
|-----------|------|
| `recompose_paragraph()` | Recompose a single paragraph only |
| `insert/remove_composed_paragraph()` | Insert/remove entries on paragraph split/merge |
| `measure_section_selective()` | Re-measure only dirty paragraphs, reuse cache for rest |

### Convergence Loop

| Mechanism | Role |
|-----------|------|
| `para_column_map` comparison | Detect multi-column re-placement and iterate |
| Max 3 iterations | Cascade stabilization |

---

## 4. Remaining 8 Gaps (Fix Targets)

### Gap 1: Convergence Loop Monitors Only the Edited Paragraph
- **Location**: `text_editing.rs:57-70`
- **Symptom**: Only checks the edited paragraph's column, not detecting adjacent paragraph cascades
- **Impact**: Adjacent paragraph layout breaks in multi-column documents after editing

### Gap 2: New Paragraph Column Not Monitored After Split
- **Location**: `text_editing.rs:715-727`
- **Symptom**: After split, only checks `para_idx`, not `new_para_idx`
- **Impact**: Split new paragraph layout mismatch in different columns

### Gap 3: Insufficient Convergence Loop After Merge
- **Location**: `text_editing.rs:946-956`
- **Symptom**: After merge, only checks `prev_idx`, not detecting subsequent paragraphs
- **Impact**: Subsequent paragraph position misalignment after merge

### Gap 4: Only First Line of Original LINE_SEG Preserved *(Resolved in #1)*
- Resolved in Issue #1 by switching to per-line independent calculation

### Gap 5: baseline_distance 0.85 Heuristic *(Resolved in #1)*
- Confirmed as Hancom's rule (`line_height * 0.85`) in Issue #1

### Gap 6: Composed Not Updated on Cell Edit
- **Location**: `text_editing.rs:1005-1007`
- **Symptom**: On paragraph split/merge within cells, only `mark_section_dirty()` called, `recompose_paragraph()` not called
- **Impact**: Temporary cursor position and rendering inaccuracy after cell editing

### Gap 7: Unnecessary Full Recomposition on Page/Column Break
- **Location**: `text_editing.rs:777, 824`
- **Symptom**: `recompose_section()` called -> full section recomposition
- **Impact**: ~100x unnecessary work in a 200-paragraph section

### Gap 8: Adjacent Paragraph Reflow Not Executed After vpos Cascade
- **Location**: `line_breaking.rs:722-740`
- **Symptom**: line_segs not updated after subsequent paragraph vpos adjustment
- **Impact**: Column overflow not detected in multi-column documents

---

## 5. Technical Background (Incremental Layout Architecture Research)

Investigated incremental layout patterns from 5 systems (`incremental_layout_research.md`):

| System | Core Strategy | rhwp Applicability |
|--------|-------------|-------------------|
| LibreOffice | Per-frame dirty flags + idle layout | High (similar to current dirty system) |
| Typst | Constraint-based memoization (comemo) | Medium (excellent cache efficiency, complex implementation) |
| ProseMirror | Immutable document + diff | Medium (useful for editing model) |
| Google Docs | Custom Canvas engine, line-level updates | Reference |
| xi-editor | Per-paragraph independent caching + delta propagation | High (matches HWP paragraph independence) |

### Pagination Stabilization Strategy

- Re-layout from the changed paragraph **until page boundaries stabilize**
- If the last item on page N matches the pre-change state -> reuse page N+1 onwards
- Detecting the "stabilization point" is key

### Table Edit Optimization Propagation Path

```
Cell text change
 -> Cell paragraph re-layout
 -> Cell height changed?
    +-- No -> Done (re-render cell internals only)
    +-- Yes -> Row height recalculation -> Total table height changed? -> Check page overflow
```

---

## 6. Strategy: Hancom-Identical Typesetting Implementation (Strategy C)

After comparing 3 strategies in `incremental_relayout_design.md`, **Strategy C** (Hancom-identical implementation) was selected:

| | Strategy A (Preserve original) | Strategy B (Custom typesetting) | **Strategy C (Hancom-identical)** |
|---|---|---|---|
| Viewer accuracy | High | Differences occur | Identical to Hancom |
| Editing smoothness | Discontinuous | Smooth | Smooth |
| Key challenge | Original/custom mismatch management | Accept Hancom differences | Hancom algorithm reverse engineering |

- **Phase 1 Complete**: Reverse engineering-based typesetting accuracy (Issue #1)
- **Phase 2 In Progress**: Derived gap fixes (Issue #2) <- **Current position**

---

## 7. Issue #2 Scope

### 3 Major Areas

| Area | Core | Related Gaps |
|------|------|-------------|
| **Paragraph add/delete** | IR consistency + before/after layout/pagination cascade | Gap 2,3,7 |
| **Text editing** | Layout/pagination propagation on line break occurrence | Gap 1,8 |
| **Control placement** | Dynamic layout changes based on image/textbox/shape/table placement attributes | Gap 6 |

#### Area 1: Paragraph Add/Delete

- Enter to split paragraph -> new paragraph IR creation + subsequent paragraph index/vpos update
- Backspace to merge paragraph -> IR integration + subsequent paragraph position recalculation
- Page/column break insertion -> incremental recomposition (currently full recomposition, Gap 7)
- Column re-placement detection on split/merge in multi-column documents (Gap 2,3)

#### Area 2: Text Editing

- Text add/delete within paragraph -> line break position change -> paragraph height change
- Paragraph height change -> subsequent paragraph vpos cascade -> page overflow check
- Convergence loop detection when adjacent paragraphs move columns in multi-column documents (Gap 1)
- Column boundary detection after vpos cascade (Gap 8)

#### Area 3: Control Placement

- treat_as_char (inline) tables/images: inline placement within paragraph, affects line height
- Top-and-bottom placement tables/images: occupy space between paragraphs, shift subsequent paragraph positions
- Non-space-occupying placement (in front of/behind text): floating without layout impact
- Immediate composed update on cell edit (Gap 6)
- Text editing in textbox -> textbox size change -> host paragraph re-typesetting

### Gap Mapping

| Gap | Area | Fix Direction |
|-----|------|-------------|
| 1 | Text editing | Expand convergence loop monitoring range: edited paragraph +/- N |
| 2 | Paragraph add | Add new paragraph column monitoring on split |
| 3 | Paragraph delete | Add subsequent paragraph monitoring on merge |
| 4 | *(Resolved in #1)* | -- |
| 5 | *(Resolved in #1)* | -- |
| 6 | Control placement | Immediate composed update on cell edit |
| 7 | Paragraph add | Incremental recomposition for page/column breaks |
| 8 | Text editing | Column boundary detection on vpos cascade |

### Verification: CDP E2E Tests

Editing scenarios are automatically executed and verified in a Chrome CDP (port 9222) + rhwp-studio (Vite:7700) environment.

| Area | E2E Test Scenario |
|------|------------------|
| Paragraph add/delete | Enter in mid-paragraph -> verify page count/paragraph positions |
| Text editing | Add text at line end -> verify line break + subsequent paragraph positions |
| Control placement | Enter in table cell -> verify rendering accuracy after cell split |
