# Task 12: Auto Numbering - Implementation Plan

## Implementation Phases

### Phase 1: AutoNumberCounter Struct Implementation
**File**: `src/renderer/mod.rs`

- Add `AutoNumberCounter` struct
- Counter for each `AutoNumberType` (HashMap or individual fields)
- `increment()`: Increment number and return current value
- `format_number()`: Convert to string according to number format
- `reset()`: Reset counters

```rust
pub struct AutoNumberCounter {
    picture: u16,
    table: u16,
    equation: u16,
    footnote: u16,
    endnote: u16,
    page: u16,
}
```

---

### Phase 2: Number Format Conversion Function
**File**: `src/renderer/mod.rs`

Supported number formats:
- Arabic numerals: 1, 2, 3
- Lowercase Roman numerals: i, ii, iii
- Uppercase Roman numerals: I, II, III
- Lowercase letters: a, b, c
- Uppercase letters: A, B, C
- Korean Ganada: ga, na, da
- Korean numbers: il, i, sam
- Circled numbers: (1), (2), (3)

```rust
fn format_number(number: u16, format: u8) -> String
```

---

### Phase 3: AutoNumber Processing in Composer
**File**: `src/renderer/composer.rs`

- Pass AutoNumberCounter when calling `compose_paragraph()`
- Generate number string when inline control is found
- Include number text in `ComposedLine`

Changes:
- Add `&mut AutoNumberCounter` to `compose_paragraph()` signature
- Check AutoNumber when processing `ControlChar::Inline`

---

### Phase 4: Counter Management in Layout
**File**: `src/renderer/layout.rs`

- Add `AutoNumberCounter` field to `LayoutEngine`
- Initialize counter at the start of `build_render_tree()`
- Pass counter during paragraph composition

---

### Phase 5: Testing and Verification
**Work Items**:
- Verify all existing 219 tests pass
- Verify `samples/hwp-multi-002.hwp` SVG output
- Verify numbers displayed in captions ("Figure 1", "Table 2", etc.)

---

## Changed Files Summary

| File | Changes |
|------|---------|
| `src/renderer/mod.rs` | AutoNumberCounter struct, format_number function |
| `src/renderer/composer.rs` | Pass counter to compose_paragraph |
| `src/renderer/layout.rs` | Counter management, paragraph composition call modification |

---

## Verification Method

```bash
docker compose run --rm test
docker compose run --rm dev cargo run -- export-svg "samples/hwp-multi-002.hwp" --output output/
grep "Figure 1\|Table 1" output/hwp-multi-002_*.svg
```

---

*Created: 2026-02-06*
