# Task 142 Execution Plan: Codebase Refactoring (SOLID + CQRS + Complexity Management)

> **Created**: 2026-02-22
> **Goal**: All files under 1,200 lines, SOLID 5.2→9.2 score, Cognitive Complexity ≤15
> **Principle**: Maintain all 488 tests passing, ensure external API (WASM/JS) compatibility

---

## 1. Current Status Analysis

### 1.1 Rust — Files Exceeding 1,200 Lines (12 files)

| # | File | Lines | Notes |
|---|------|------:|-------|
| 1 | wasm_api.rs | 24,585 | Code 12,024 + Tests 12,561 (31% of total) |
| 2 | renderer/layout.rs | 8,708 | Text/table/shape layout mixed |
| 3 | renderer/pagination.rs | 2,264 | Includes paginate_with_measured 1,456 lines |
| 4 | renderer/composer.rs | 2,026 | Paragraph composition |
| 5 | model/table.rs | 1,767 | Table model |
| 6 | parser/control.rs | 1,744 | Control parser |
| 7 | serializer/control.rs | 1,520 | Control serialization |
| 8 | serializer/cfb_writer.rs | 1,516 | CFB writing |
| 9 | parser/body_text.rs | 1,429 | Body text parser |
| 10 | model/paragraph.rs | 1,367 | Paragraph model |
| 11 | renderer/svg.rs | 1,292 | SVG renderer |
| 12 | serializer/doc_info.rs | 1,248 | Document info serialization |

※ `font_metrics_data.rs` (9,818 lines) is auto-generated data, excluded

### 1.2 TypeScript/CSS — Files Exceeding 1,200 Lines (3 files)

| # | File | Lines | Notes |
|---|------|------:|-------|
| 1 | engine/input-handler.ts | 3,106 | Keyboard/mouse/IME/table/picture handlers mixed |
| 2 | style.css | 1,588 | All styles in single file |
| 3 | ui/para-shape-dialog.ts | 1,496 | 4-tab dialog |

### 1.3 wasm_api.rs Detailed Analysis

| Item | Count |
|------|------:|
| `#[wasm_bindgen]` methods | 116 |
| `_native` implementations | 87 |
| `#[test]` functions | 112 |
| `mod tests` lines | 12,561 (51%) |
| Business logic code | 12,024 (49%) |

---

## 2. Refactoring Scope and Exclusions

### Included

- Module splitting of 15 files exceeding 1,200 lines
- Separation of wasm_api.rs into role-based impl blocks
- Decomposition of giant functions (paginate_with_measured, etc.)
- rhwp-studio TS/CSS file splitting
- Introduction of quantitative code quality measurement system

### Excluded

- Trait abstraction (Phase 3) — to be considered as separate task
- CLI clap introduction (Phase 4) — to be considered as separate task
- font_metrics_data.rs — auto-generated data
- New features, bug fixes

### Rationale

Phase 1~2 (file/function splitting) alone involves very large change volume. Proceeding with trait abstraction and CLI framework after splitting is complete reduces risk.

---

## 3. Implementation Strategy

### 3.1 Rust: wasm_api.rs Split (24,585 lines → ≤1,200 lines per module)

Leveraging Rust's distributed `impl` blocks: define `HwpDocument` struct in one place and separate methods into role-based files.

```
src/
├── wasm_api.rs              ← #[wasm_bindgen] wrappers only (≤1,200 lines)
├── wasm_api/
│   ├── mod.rs               ← HwpDocument struct + common helpers
│   ├── viewer.rs            ← Rendering, page info, DPI
│   ├── text_editor.rs       ← Text insert/delete/split/merge
│   ├── table_editor.rs      ← Table row/column CRUD, cell merge/split
│   ├── formatting.rs        ← Character/paragraph formatting changes
│   ├── clipboard.rs         ← Copy/paste
│   ├── html_converter.rs    ← HTML export/import
│   ├── serializer.rs        ← HWP save, blank document creation
│   ├── cursor.rs            ← Cursor movement, hit testing
│   ├── picture.rs           ← Picture insert/select/move/resize
│   └── diagnostics.rs       ← Document info, debug
├── wasm_api/tests/
│   ├── mod.rs
│   ├── viewer_tests.rs
│   ├── text_editor_tests.rs
│   ├── table_editor_tests.rs
│   ├── formatting_tests.rs
│   ├── clipboard_tests.rs
│   ├── html_converter_tests.rs
│   ├── serializer_tests.rs
│   └── picture_tests.rs
```

### 3.2 Rust: renderer/ Split

```
src/renderer/
├── layout.rs (8,708 lines) → split:
│   ├── layout.rs            ← Entry point + common (≤1,200 lines)
│   ├── text_layout.rs       ← Text position/line breaking
│   ├── table_layout.rs      ← Table layout
│   ├── shape_layout.rs      ← Shape/image/textbox
│   ├── numbering_layout.rs  ← Paragraph numbering/bullets
│   ├── footnote_layout.rs   ← Footnote/endnote layout
│   └── header_footer_layout.rs ← Header/footer
│
├── pagination.rs (2,264 lines) → split:
│   ├── pagination.rs        ← Entry point (≤1,200 lines)
│   └── page_break.rs        ← Page boundary/table split logic
│
├── composer.rs (2,026 lines) → split:
│   ├── composer.rs           ← Entry point (≤1,200 lines)
│   └── composer_table.rs     ← Table composition only
```

### 3.3 Rust: Other Files Exceeding 1,200 Lines

| File | Lines | Split Strategy |
|------|------:|---------------|
| model/table.rs | 1,767 | table.rs + table_cell.rs |
| parser/control.rs | 1,744 | control.rs + control_shape.rs |
| serializer/control.rs | 1,520 | control.rs + control_shape.rs |
| serializer/cfb_writer.rs | 1,516 | cfb_writer.rs + cfb_storage.rs |
| parser/body_text.rs | 1,429 | body_text.rs + char_shape_reader.rs |
| model/paragraph.rs | 1,367 | paragraph.rs + paragraph_ops.rs |
| renderer/svg.rs | 1,292 | svg.rs + svg_shape.rs |
| serializer/doc_info.rs | 1,248 | doc_info.rs + doc_info_style.rs |

### 3.4 TypeScript/CSS: rhwp-studio Split

```
rhwp-studio/src/engine/
├── input-handler.ts (3,106 lines) → split:
│   ├── input-handler.ts      ← Entry point + event binding
│   ├── keyboard-handler.ts   ← Keyboard events
│   ├── mouse-handler.ts      ← Mouse events
│   ├── ime-handler.ts        ← IME input
│   └── object-handler.ts     ← Table/picture object interaction

rhwp-studio/src/ui/
├── para-shape-dialog.ts (1,496 lines) → split:
│   ├── para-shape-dialog.ts  ← Dialog frame + tab switching
│   ├── para-indent-tab.ts    ← Indent/spacing tab
│   └── para-line-tab.ts      ← Line spacing/alignment tab

rhwp-studio/src/
├── style.css (1,588 lines) → split:
│   ├── style.css             ← Common/layout
│   ├── toolbar.css           ← Toolbar/formatting bar
│   └── dialog.css            ← Dialog common
```

---

## 4. Risk Management

| Risk | Impact | Mitigation |
|------|--------|-----------|
| WASM API compatibility breakage | High | Keep `#[wasm_bindgen]` wrappers with unchanged signatures |
| Test regression | High | Run `cargo test` after each module move |
| `pub(crate)` visibility issues | Medium | Set HwpDocument fields to `pub(crate)` |
| Circular dependencies | Medium | Place common helpers in mod.rs |
| TS import path changes | Low | Bulk update imports after file splitting + `npx tsc --noEmit` verification |

---

## 5. Quantitative Code Quality Measurement System Introduction

### 5.1 Tool Status and Adoption Plan

| # | Tool | Purpose | Installed | Adoption Timing |
|---|------|------|----------|----------------|
| 1 | **Clippy** (v0.1.93) | Static analysis + code style | Installed | Before refactoring start — achieve 0 warnings + ruleset config |
| 2 | **rust-code-analysis-cli** (v0.0.25) | Cognitive Complexity measurement | Not installed → install | Before/after refactoring comparison — giant function decomposition benchmark |
| 3 | **cargo-modules** (v0.25.0) | Module dependency analysis | Not installed → install | Before/after splitting coupling visualization |
| 4 | **cargo-tarpaulin** (v0.35.2) | Line coverage | Not installed → install | After refactoring completion — baseline measurement |
| 5 | **cargo-mutants** (v26.2.0) | Mutation testing | Not installed | Lower priority — separate task |

### 5.2 Clippy Warning Status and Target

- **Current**: 271 warnings (44 categories), no config file
- **Auto-fixable**: 128 (`cargo clippy --fix`)
- **Manual fix required**: 143
- **Target**: **0 warnings** + `[lints.clippy]` ruleset in `Cargo.toml`

```toml
# Ruleset to add to Cargo.toml
[lints.clippy]
cognitive_complexity = "warn"
too_many_arguments = "warn"
too_many_lines = "warn"
large_enum_variant = "warn"
needless_pass_by_value = "warn"
```

### 5.3 Cognitive Complexity Benchmark

```
All functions: Cognitive Complexity ≤ 15
Warning threshold: Cognitive Complexity > 10
Block threshold: Cognitive Complexity > 25 (disallowed in new code)
```

Measure baseline before refactoring → re-measure after refactoring to **quantitatively verify improvement**.

### 5.4 Measurement Results Recording

Record before/after metrics in `mydocs/report/task_142_metrics.md`:
- File line count distribution
- Clippy warning count
- Top 20 Cognitive Complexity functions
- Module dependency graph
- (Optional) Line coverage

### 5.5 Code Quality Dashboard

Implement an HTML dashboard for visual status overview.

**Measurement script** (`scripts/metrics.sh`):
- `cargo clippy` → Clippy warning count
- `rust-code-analysis-cli -m -p src/ -O json` → Cognitive Complexity
- `wc -l src/**/*.rs` → Lines per file
- `cargo test` → Test pass/fail count
- Aggregate results to `output/metrics.json` as JSON

**Dashboard** (`output/dashboard.html`) — Static HTML + Chart.js:

| Panel | Visualization | Data Source |
|-------|--------------|-------------|
| File size distribution | Horizontal bar chart (1,200 line baseline shown) | wc -l |
| Cognitive Complexity Top 20 | Horizontal bar (15/25 threshold lines) | rust-code-analysis |
| Clippy warnings | Number card (current/target) | cargo clippy |
| Test status | Pie chart (pass/fail) | cargo test |
| Module dependencies | Table (Ce/Ca/Instability) | cargo-modules |
| Before/After refactoring comparison | Before/After pair charts | Recorded data |

**Execution**:
```bash
./scripts/metrics.sh          # Run measurement → output/metrics.json
open output/dashboard.html    # Open dashboard in browser
```

No external server needed. Visualized with Chart.js CDN; `output/` is in `.gitignore` so not included in repository.

---

## 6. Verification Plan

At each step completion:

```bash
# Rust
cargo test                    # All 488 tests pass
cargo clippy                  # 0 warnings
docker compose --env-file .env.docker run --rm wasm  # WASM build

# TypeScript
npx tsc --noEmit              # Type check
npx vite build                # Frontend build

# Quantitative measurement (from step 1 completion)
rust-code-analysis-cli -m -p src/ -O json  # Cognitive Complexity
cargo modules dependencies                  # Module dependencies
```

---

## 7. Implementation Steps (Proposed)

| Step | Content | Expected Changed Files |
|------|---------|----------------------|
| Step 0 | Quantitative measurement baseline + Clippy 0 warnings + Dashboard build | Cargo.toml, all sources, scripts/metrics.sh, output/dashboard.html |
| Step 1 | wasm_api.rs struct separation + common helper migration | wasm_api.rs, wasm_api/mod.rs |
| Step 2 | wasm_api.rs _native method role-based migration (10 modules) | wasm_api/*.rs |
| Step 3 | wasm_api.rs test separation (8 test files) | wasm_api/tests/*.rs |
| Step 4 | renderer/ splitting (layout, pagination, composer, svg) | renderer/*.rs |
| Step 5 | Other Rust file splitting (model, parser, serializer) | 8 files |
| Step 6 | rhwp-studio TS/CSS splitting + final quantitative measurement + Dashboard Before/After comparison | engine/*.ts, ui/*.ts, *.css |

> Details for each step to be finalized in implementation plan.
