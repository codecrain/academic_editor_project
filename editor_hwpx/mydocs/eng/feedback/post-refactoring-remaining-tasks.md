# rhwp Remaining Tasks After Refactoring

> **Baseline**: After Task 142 completion (2026-02-22)  
> **Prior work**: 6-phase file split refactoring based on 1,200-line cap rule  
> **Tests**: All 582 tests passing, 0 Clippy warnings  

---

## Refactoring Results Summary

| Metric | Before | After | Change |
|---|---|---|---|
| Max file size (excl. test/auto-generated) | 24,586 lines | 1,482 lines | 94% reduction |
| wasm_api.rs | 24,586 lines single file | 1,839 lines + 12 modules | Done |
| layout.rs | 8,709 lines single file | 1,128 lines + 10 modules | Done |
| pagination.rs | 2,265 lines | engine.rs(1,482) + tests.rs | Done |
| ShapeObject pattern matching | 61 times | 24 times | 61% reduction (`common()` added) |
| `common()` method usage | 0 | 13 times | Done |
| Test count | 488 | 582 | +94 |
| Clippy warnings | Unmeasured | 0 | Done |
| Overall score (estimated) | 5.4/10 | **~7.0/10** | +1.6 |

---

## Remaining Tasks

### P0 -- Quick Wins (1~2 days each, no API changes)

#### 1. Lazy Pagination (CQRS Stage 1)

**Current state**: `self.paginate()` **45 times**, `raw_stream = None` **55 times** scattered across modules.

| Module | paginate() | raw_stream=None |
|---|---|---|
| `text_editing.rs` | 14 | 9 |
| `table_ops.rs` | 13 | 13 |
| `html_import.rs` | 5 | 2 |
| `object_ops.rs` | 4 | 6 |
| `clipboard.rs` | 4 | 2 |
| `rendering.rs` | 2 | 1 |
| `document.rs` | 2 | 0 |
| `formatting.rs` | 0 | 4 |
| `wasm_api.rs` (entry point) | 1 | 0 |
| **Total** | **45** | **55** (including 18 in tests) |

**Proposal**: Introduce `mark_dirty()` + `ensure_paginated()`.
- Remove `paginate()` calls from Commands -> unify to a single `mark_dirty(section_idx)` line
- Lazy execution of `ensure_paginated()` at Query time
- **Effect**: AI Agent batch editing reduces paginate from Nx to 1x

**Details**: See [CQRS Analysis](cqrs-analysis.md) Stage 1.

---

#### 2. JSON Utility Consolidation

**Current state**: Manual JSON parsing functions like `parse_u32()`, `parse_bool()` are still scattered.

| Module | Parser function usage | `format!("{{` usage |
|---|---|---|
| `rendering.rs` | 13 | 4 |
| `table_ops.rs` | 8 | 9 |
| `text_editing.rs` | -- | 10 |
| `cursor_rect.rs` | -- | 4 |
| `clipboard.rs` | -- | 3 |
| `object_ops.rs` | -- | 2 |
| Other | -- | 7 |
| **Total** | **21** | **39** |

**Proposal**:
- Consolidate JSON parsing/generation utilities into `helpers.rs`
- Consider `serde_json` adoption mid-term (WASM binary size tradeoff)
- At minimum, extract the `format!("{{\"ok\":true}}")` pattern into a macro or helper

---

#### 3. Expand ShapeObject::common() Coverage

**Current state**: The `common()` method was added and is used in 13 places, but 8-variant matching still remains **24 times**.

| Location | Pattern match count | `.common()` usage |
|---|---|---|
| `shape_layout.rs` | 21 | 2 |
| `table_cell_content.rs` | 3 | 0 |
| `layout.rs` (entry point) | 0 | 1 |
| Other layout modules | 0 | 10 |

**Proposal**: Analyze the 21 matches in `shape_layout.rs` -> consider adding separate trait methods (`fn shape_points()`, `fn fill_style()`, etc.) for shape-specific property access beyond `common()`.

---

### P1 -- Mid-term Improvements (3~5 days)

#### 4. Large Function Decomposition

File splitting is complete, but **function-level complexity** is still unresolved:

| Function | File | Current Lines | Target | Notes |
|---|---|---|---|---|
| `build_render_tree()` | `layout.rs` | ~900 lines | <=100 lines | Decompose into 7~10 sub-functions |
| `paginate_with_measured()` | `pagination/engine.rs` | ~1,450 lines | <=100 lines | Separate table splitting, multi-column, headers, etc. |
| `layout_composed_paragraph()` | `paragraph_layout.rs` | ~400 lines | <=100 lines | Separate text runs, inline elements, alignment |
| `layout_table()` | `table_layout.rs` | ~1,191 lines | <=200 lines | Separate column/row calc, cell rendering, borders |

**Criteria**: [Code Complexity Recommendations](code-complexity-recommendations.md) Cognitive Complexity <= 15.

---

#### 5. Command/Query File Separation (CQRS Stage 2)

**Reclassify** the current 12 wasm_api modules into **Command/Query**:

```
Current:                           CQRS Reclassification:
wasm_api/                       wasm_api/
+-- text_editing.rs             +-- commands/
+-- table_ops.rs                |   +-- text_editing.rs    (C)
+-- formatting.rs               |   +-- table_ops.rs       (C)
+-- clipboard.rs                |   +-- formatting.rs      (C)
+-- object_ops.rs               |   +-- clipboard.rs       (C)
+-- html_import.rs              |   +-- object_ops.rs      (C)
+-- html_table_import.rs        |   +-- html_import.rs     (C)
+-- cursor_nav.rs               |   +-- html_table_import.rs(C)
+-- cursor_rect.rs              +-- queries/
+-- rendering.rs                |   +-- cursor_nav.rs      (Q)
+-- document.rs                 |   +-- cursor_rect.rs     (Q)
+-- helpers.rs                  |   +-- rendering.rs       (Q)
                                |   +-- document_info.rs   (Q)
                                +-- document.rs            (mixed->separate)
                                +-- helpers.rs
```

**Details**: See [CQRS Analysis](cqrs-analysis.md) Stage 2.

---

#### 6. Table Layout Code Consolidation

`table_layout.rs` (1,191 lines) and `table_partial.rs` (1,102 lines) still contain similar cell layout logic patterns. Extracting a common cell rendering helper could eliminate ~200 lines of duplication.

---

### P2 -- Long-term Improvements (1~3 weeks)

#### 7. Hexagonal Architecture Application

Core/Adapter separation for 3 deployment paths (WASM, PyO3, MCP):

```
Core Domain (Pure Rust)          Adapters (External Bindings)
+---------------------+         +-----------------+
| HwpEngine            | <------ | WASM Adapter    |
| +-- TextEditor       |         +-----------------+
| +-- TableEditor      | <------ | PyO3 Adapter    |
| +-- Renderer         |         +-----------------+
| +-- Serializer       | <------ | MCP Server      |
+---------------------+         +-----------------+
```

**Prerequisite**: Start after P1-5 (Command/Query separation) is complete.

---

#### 8. Parser/Serializer Trait Abstraction

Currently `parser::parse_hwp()` and `serializer::serialize_hwp()` are concrete functions. Abstracting as traits enables:
- Mocking in tests
- OCP compliance when adding new formats (HWPX)
- DIP score improvement

---

#### 9. Event Sourcing + Batch Command (CQRS Stage 3)

Event-based architecture for MCP Server Batch Tool support:
- Command -> Event emission -> Projection (paginate) rebuild
- Natural implementation of edit history (Undo/Redo)
- Incremental pagination (recalculate only changed sections)

**Details**: See [CQRS Analysis](cqrs-analysis.md) Stage 3.

---

#### 10. Test Coverage Expansion

582 tests pass, but the following areas lack test coverage:

| Area | Current | Needed |
|---|---|---|
| Shape layout (shape_layout) | None | Basic shapes + groups + rotation |
| Textbox content | None | Overflow, inline elements |
| Footnote layout | None | Bottom-of-page placement |
| Multi-column layout | None | 2-column/3-column placement, column separators |
| Caption layout | None | Table top/bottom/left/right captions |
| Table page splitting | Minimal | Intra-row, header row repetition |

**Target**: Line coverage >= 70% (currently unmeasured, recommend measuring with `cargo-tarpaulin`).

---

## Expected Score Roadmap

| Stage | Task | Overall Score |
|---|---|---|
| Current (Task 142 complete) | File split + common() + 94 tests added | **~7.0/10** |
| P0 complete | Lazy Pagination + JSON consolidation + common() expansion | **~7.8/10** |
| P1 complete | Large function decomposition + CQRS separation + table consolidation | **~8.5/10** |
| P2 complete | Hexagonal + Trait abstraction + Event Sourcing | **~9.2/10** |

---

## Reference Documents

| Document | Content |
|---|---|
| [2nd Code Review](r-code-review-2nd.md) | Overall diagnosis and Top 5 issues |
| [CQRS Analysis](cqrs-analysis.md) | Lazy Pagination to Event Sourcing 3-stage plan |
| [Code Complexity Recommendations](code-complexity-recommendations.md) | Cognitive Complexity, Hexagonal, Mutation Testing |
| [Refactoring Strategy](code-refactoring-strategy.md) | 4-Phase strategy (aligned with P0~P2) |
