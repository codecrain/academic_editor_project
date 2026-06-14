# rhwp Code Complexity Management Methodology Recommendations

> **Target**: rhwp codebase (78,463 lines, POC → productization stage)  
> **Purpose**: Proposal for introducing quantitative quality management frameworks beyond SOLID  
> **Date**: 2026-02-22  
> **Prior review**: [2nd Code Review](r-code-review-2nd.md) (5.4/10), [CQRS Analysis](cqrs-analysis.md)  

---

## Why SOLID Alone Is Not Enough

SOLID provides **design principles** (qualitative), not **measurement tools** (quantitative).

| Core Problem in rhwp | Does SOLID detect it? | Quantitatively measurable? |
|---|---|---|
| `build_render_tree()` 921 lines | Only diagnoses "SRP violation" | No numeric "how bad" metric |
| 10-level nested `if`/`match` | Cannot detect | No |
| wasm_api.rs → depends on 4 modules | "DIP violation" at best | No coupling strength metric |
| Do tests actually catch bugs? | Out of scope | No |

**Proposal**: Combine SOLID (qualitative) + the following 5 methodologies (quantitative) to build an **automated quality gating** system.

---

## 1. Cognitive Complexity — Top Priority for Adoption

### Overview

A metric proposed by SonarQube that quantifies "**how difficult is this code for a human to read**." It addresses limitations of traditional Cyclomatic Complexity:

| | Cyclomatic (CC) | Cognitive |
|---|---|---|
| Measures | Number of branch paths | Comprehension difficulty |
| Nesting handling | No weighting | **Weight increases with nesting** |
| `match` handling | +1 per branch | +1 per semantic unit |

```rust
// CC: 3, Cognitive: 3 — Same (sequential, easy to read)
if a { ... }
if b { ... }
if c { ... }

// CC: 3, Cognitive: 6 — Cognitive is higher (nested, harder to read)
if a {                    // +1
    if b {                // +2 (nesting depth 1)
        if c { ... }      // +3 (nesting depth 2)
    }
}
```

### Applied to rhwp

| Function | Lines | CC (est.) | Cognitive (est.) | Verdict |
|---|---|---|---|---|
| `build_render_tree()` | 921 | 80+ | **150+** | Immediate decomposition required |
| `paginate_with_measured()` | 1,456 | 100+ | **200+** | Immediate decomposition required |
| `layout_composed_paragraph()` | 421 | 40+ | **70+** | Decomposition recommended |
| `layout_table()` | 500+ | 50+ | **90+** | Decomposition recommended |
| Typical _native methods | ~50 | 5~10 | 5~15 | Acceptable |

### Adoption Criteria

```
Pass: All functions: Cognitive Complexity <= 15
Warning threshold: Cognitive Complexity > 10
Block threshold: Cognitive Complexity > 25 (not allowed in new code)
```

### Rust Tools

- **`rust-code-analysis`**: Developed by Mozilla, native Rust CC/Cognitive measurement
- **`cargo-sonar`**: For SonarQube integration
- **Custom CI**: Parse `rust-code-analysis-cli --metrics` output and fail builds when thresholds are exceeded

```bash
# Install
cargo install rust-code-analysis-cli

# Measure
rust-code-analysis-cli -m -p src/renderer/layout.rs -O json
```

---

## 2. Coupling & Cohesion — Architecture Health

### Overview

| Metric | Meaning | Goal |
|---|---|---|
| **Afferent Coupling (Ca)** | Number of external modules that **depend on** this module | OK if high for core modules |
| **Efferent Coupling (Ce)** | Number of external modules **this module depends on** | Lower is better |
| **Instability (I)** | Ce / (Ca + Ce) | Closer to 0 = more stable |
| **Cohesion** | Relatedness of elements within a module | Higher is better |

### Current State of rhwp

```
Module Coupling Analysis (estimated):

model/         Ca=4  Ce=0  I=0.00  Fully stable (pure data)
parser/        Ca=1  Ce=1  I=0.50  Appropriate
serializer/    Ca=1  Ce=1  I=0.50  Appropriate
renderer/      Ca=1  Ce=1  I=0.50  Appropriate
wasm_api.rs    Ca=0  Ce=4  I=1.00  Fully unstable (depends on all modules)
```

`wasm_api.rs` having Instability = 1.0 means **"this module is affected by every change"**. The God Object problem is confirmed numerically.

### Cohesion Perspective

`wasm_api.rs`'s `HwpDocument` includes 9 roles (text editing, table editing, rendering, serialization...), so **cohesion is extremely low**. This provides quantitative evidence for the principle that "classes with low cohesion should be split."

### Adoption Criteria

```
Pass: All modules: Efferent Coupling (Ce) <= 3
Pass: Stable modules (model, parser): Instability (I) <= 0.3
Warning: A single file depends on 4+ modules
```

### Rust Tools

```bash
# Dependency graph visualization
cargo install cargo-depgraph
cargo depgraph | dot -Tpng > deps.png

# Module dependency analysis
cargo install cargo-modules
cargo modules dependencies
```

---

## 3. Hexagonal Architecture — Multi-target Design

### Why It's Needed

rhwp targets **3 deployment paths**:

| Deployment | Interface | Current State |
|---|---|---|
| WASM (npm) | `#[wasm_bindgen]` | Implemented |
| Python (PyPI) | PyO3 bindings | Not implemented |
| MCP Server | JSON-RPC over stdio | Not implemented |

Since business logic is currently implemented directly in `wasm_api.rs`, there is a risk of **duplicating the same logic** for PyO3 and MCP.

### Target Architecture

```
                    +-----------------------------+
                    |      Core Domain             |
                    |      (Pure Rust, 0 deps)     |
                    |                              |
                    |  HwpEngine                    |
                    |  +-- TextEditor              |
                    |  +-- TableEditor             |
                    |  +-- Formatter               |
                    |  +-- Renderer                |
                    |  +-- Serializer              |
                    +------+-------+-------+-------+
                           |       |       |
              +------------v--+ +--v----+ +v----------+
              | WASM Adapter  | | PyO3  | | MCP Server|
              | (extracted    | |Adapter| | Adapter   |
              |  from current | |(new)  | | (new)     |
              |  wasm_api.rs) | |       | |           |
              +---------------+ +-------+ +-----------+
```

### Separation Criteria

| Layer | Includes | Excludes |
|---|---|---|
| **Core** | Document model operations, editing logic, layout, rendering | `#[wasm_bindgen]`, JSON conversion, JsValue |
| **Adapter** | Binding conversion, error mapping, JSON serialization | Business logic |

### Current Violation Example

```rust
// wasm_api.rs — Core and Adapter are mixed
pub fn insert_text_native(&mut self, ...) -> Result<String, HwpError> {
    // (1) Core logic (extraction target)
    let para = &mut self.document.sections[si].paragraphs[pi];
    para.text.insert_str(offset, text);
    self.reflow_paragraph(si, pi);

    // (2) Adapter logic (WASM-specific)
    self.sections[si].raw_stream = None;
    self.paginate();
    Ok(format!("{{\"ok\":true,\"offset\":{}}}", new_offset))  // JSON generation
}
```

**After extraction to Core**:

```rust
// core/text_editor.rs
impl HwpEngine {
    pub fn insert_text(&mut self, si: usize, pi: usize, offset: usize, text: &str)
        -> Result<InsertResult, HwpError>
    {
        let para = &mut self.document.sections[si].paragraphs[pi];
        para.text.insert_str(offset, text);
        self.reflow_paragraph(si, pi);
        Ok(InsertResult { para_idx: pi, offset: new_offset })
    }
}

// adapters/wasm.rs — Thin wrapper
#[wasm_bindgen]
pub fn insert_text(&mut self, ...) -> Result<String, JsValue> {
    let result = self.engine.insert_text(si, pi, offset, text)?;
    self.mark_dirty(si);
    Ok(serde_json::to_string(&result)?)
}

// adapters/mcp.rs — Uses the same Core
fn handle_insert_text(&mut self, params: Value) -> Result<Value, McpError> {
    let result = self.engine.insert_text(si, pi, offset, text)?;
    Ok(json!(result))
}
```

---

## 4. Test Quality Metrics — Mutation Testing + Coverage

### Limitations of Current Testing

| Area | Test Count | Issue |
|---|---|---|
| wasm_api.rs | 112 | Adequate but lacking error cases |
| layout.rs | 22 | No tests for shapes/textboxes/footnotes/multi-column |
| pagination.rs | -- | Edge cases for table splitting unverified |

"488 tests passing" is **not evidence that the code is correct**. We must verify that tests actually catch bugs.

### 4.1 Line Coverage

```bash
# Install and run
cargo install cargo-tarpaulin
cargo tarpaulin --out Html --output-dir coverage/
```

Adoption criteria:
```
Pass: Overall line coverage: >= 70%
Pass: Core modules (model, parser, renderer): >= 80%
Warning: New code coverage < 80%
```

### 4.2 Mutation Testing

**Intentionally break** the code, then check if tests detect it:

```bash
cargo install cargo-mutants
cargo mutants --in-place  # Generate mutations -> run tests -> report results
```

| Mutation Type | Example | Tests should catch |
|---|---|---|
| Inequality inversion | `width > 0` -> `width < 0` | Yes |
| Constant modification | `7200` -> `7201` (HWPUNIT) | Yes |
| Condition removal | `if merged { ... }` -> removed | Yes |
| Return value change | `Ok(result)` -> `Ok(default)` | Yes |

**Mutation Score** = caught mutations / total mutations. Target: **>= 60%**

---

## 5. Enhanced Static Analysis — Extended Clippy Ruleset

### Current State

`#[allow(clippy::too_many_arguments)]` is used **2 times** — Clippy warnings are being **suppressed**.

### Recommended Clippy Ruleset

```toml
# Cargo.toml or .clippy.toml
[lints.clippy]
cognitive_complexity = "warn"     # Cognitive Complexity threshold
too_many_arguments = "warn"       # Warn on 7+ parameters
too_many_lines = "warn"           # Warn on 100+ line functions
large_enum_variant = "warn"       # Enum variant size imbalance
needless_pass_by_value = "warn"   # Unnecessary ownership transfer
```

**`#[allow]` policy**: Prohibit `#[allow(clippy::too_many_arguments)]` in new code. Remove from existing code during refactoring.

---

## Summary: Proposed rhwp Quality Dashboard

| Category | Methodology | Tool | Threshold | CI Automated |
|---|---|---|---|---|
| Design Principles | SOLID | Manual review | Overall >= 8.0/10 | No |
| **Function Complexity** | **Cognitive Complexity** | `rust-code-analysis` | **Per function <= 15** | Yes |
| Module Health | Coupling/Cohesion | `cargo-modules` | Ce <= 3, I <= 0.5 | Yes |
| Architecture | Hexagonal | Manual design | Core/Adapter separation | No |
| Test Quality | Mutation Testing + Coverage | `cargo-mutants`, `cargo-tarpaulin` | Coverage >= 70%, Mutation >= 60% | Yes |
| Linting | Extended Clippy | `cargo clippy` | 0 warnings | Yes |

### Adoption Priority

| Priority | Methodology | Reason | Adoption Cost |
|---|---|---|---|
| 1 | **Cognitive Complexity** | Objective criteria for large function decomposition, CI-automatable | Low |
| 2 | **Hexagonal Architecture** | Prerequisite for supporting 3 deployment paths (WASM/PyO3/MCP) | Medium |
| 3 | **Line Coverage** | Quantifying layout.rs test blind spots | Low |
| 4 | **Extended Clippy Ruleset** | Automatic quality gating for new code | Low |
| 5 | **Coupling Analysis** | Measuring effectiveness of module splitting | Low |
| 6 | **Mutation Testing** | Ultimate verification of test quality | Medium |

---

## Conclusion

SOLID answers **"is this code well-designed?"** but cannot answer **"how bad is it?"** or **"is it improving?"**

At rhwp's productization stage, **automated tracking of quantitative metrics** is essential. By establishing criteria for function decomposition with Cognitive Complexity, designing multi-target deployment with Hexagonal Architecture, and verifying test quality with mutation testing, code quality **improves measurably over time**.

> *"If you can't measure it, you can't manage it." — Peter Drucker*
