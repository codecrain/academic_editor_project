# Task 71 Implementation Plan

## NewNumber Start + Auto-numbering System Completion

### Verification Target: `samples/k-water-rfp.hwp` (contains AutoNumber), other samples

---

## Step 1: AutoNumber/PageNumberPos Model + Parser + Serializer Modification (Data Layer)

**Modified files**: `src/model/control.rs`, `src/parser/control.rs`, `src/serializer/control.rs`

### Changes

#### model/control.rs — Field Additions

Add missing fields to AutoNumber struct per HWP spec table 144:
- `number: u16` — UINT16 number per spec
- `user_symbol: char` — WCHAR user symbol
- `prefix_char: char` — WCHAR prefix decoration character
- `suffix_char: char` — WCHAR suffix decoration character

Add missing fields to PageNumberPos struct per HWP spec table 149:
- `user_symbol: char`, `prefix_char: char`, `suffix_char: char`, `dash_char: char`

#### parser/control.rs — Bit Offset Fix + Field Parsing

`parse_auto_number()`:
- format: `(attr >> 4) & 0x0F` → `(attr >> 4) & 0xFF` (extend to 8 bits)
- superscript: `attr & 0x100` → `attr & 0x1000` (fix to bit 12)
- Add UINT16 number + 3 WCHAR reads

`parse_page_num_pos()`:
- Add 4 WCHAR reads

#### serializer/control.rs — Symmetric Fix with Parser

`serialize_auto_number()`:
- format: `& 0x0F` → `& 0xFF`, superscript: `0x100` → `0x1000`
- Add number + decoration character output

`serialize_page_num_pos()`:
- `(format & 0x0F) | (position << 4)` → `(format & 0xFF) | (position << 8)` (match parser)
- Add decoration character output

---

## Step 2: NewNumber → Auto-numbering Integration + Page Number Integration

**Modified files**: `src/parser/mod.rs`, `src/renderer/pagination.rs`

### Changes

#### parser/mod.rs — assign_auto_numbers() Modification

1. Add `Control::NewNumber` handling to `assign_auto_numbers_in_controls()`:
   - `counters[idx] = nn.number.saturating_sub(1)` → next increment returns `nn.number`

2. Set `assign_auto_numbers()` counter initial values to `DocProperties` start numbers

#### pagination.rs — Add page_number Field to PageContent

- Add `pub page_number: u32` field to `PageContent`
- Collect NewNumber(Page) controls → assign actual page number per page

---

## Step 3: Rendering — Apply AutoNumber Format/Decoration + Fix Page Number

**Modified file**: `src/renderer/layout.rs`

### Changes

1. `apply_auto_numbers_to_composed()`: `NumFmt::Digit` → `NumFmt::from_hwp_format(an.format)` + apply decoration characters
2. `format_page_number()`: Remove duplicate function, reuse `mod.rs`'s `format_number()`
3. `build_render_tree()` page numbers: `page_index + 1` → `page_number`

---

## Step 4: Build Verification and WASM Compatibility

1. Check/fix `wasm_api.rs` references
2. `docker compose --env-file /dev/null run --rm test` — all tests pass
3. `docker compose --env-file /dev/null run --rm wasm` — WASM build
4. `cd rhwp-studio && npx vite build` — Vite build
5. SVG export visual confirmation

---

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/model/control.rs` | AutoNumber/PageNumberPos field additions | ~10 lines |
| `src/parser/control.rs` | Bit offset fixes + field parsing additions | ~20 lines |
| `src/serializer/control.rs` | Bit offset fixes + field serialization additions | ~20 lines |
| `src/parser/mod.rs` | NewNumber integration + DocProperties initial values | ~15 lines |
| `src/renderer/pagination.rs` | page_number field + NewNumber(Page) handling | ~30 lines |
| `src/renderer/layout.rs` | AutoNumber format/decoration + page number refactoring | ~30 lines |
