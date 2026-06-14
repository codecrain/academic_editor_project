# Task 131 Execution Plan — Text Transformation Rendering (Outline/Shadow/Emboss/Engrave)

## Background

### Current Problem

HWP documents can apply text transformation effects such as outline, shadow, emboss, and engrave to characters. Currently in rhwp:

1. **Parser**: Parses outline_type, shadow_type, etc. from CharShape but **bit positions are incorrect**
2. **Model**: No dedicated fields for emboss/engrave (only exists in attr bits)
3. **Style pipeline**: Text transformation attributes are not passed from ResolvedCharStyle to TextStyle
4. **Canvas rendering**: Only calls `fillText` — strokeText, shadow, 3D effects are unimplemented

### Bit Parsing Bug (hwplib reference verification)

Current parser (`src/parser/doc_info.rs:536-537`):
```rust
let outline_type = ((attr >> 4) & 0x07) as u8;  // ← incorrect
let shadow_type = ((attr >> 7) & 0x03) as u8;   // ← incorrect
```

Correct bit positions per hwplib:
| Bit | Field |
|-----|-------|
| 0 | italic |
| 1 | bold |
| 2-3 | underline_type |
| 4-7 | underline_shape |
| **8-10** | **outline_type** (currently read as 4-6) |
| **11-12** | **shadow_type** (currently read as 7-8) |
| **13** | **emboss** (not parsed) |
| **14** | **engrave** (not parsed) |
| 15 | superscript |
| 16 | subscript |
| 18-20 | strikethrough |

HWPX parser has the same bug: emboss → `1 << 9` (correct: `1 << 13`), engrave → `1 << 10` (correct: `1 << 14`)

### Style Pipeline Gap

```
CharShape (model/style.rs:22)
  → outline_type, shadow_type, shadow_color, shadow_offset_x/y present
  → emboss, engrave fields missing (only exists in attr bits)
    ↓
ResolvedCharStyle (style_resolver.rs:19)
  → no outline/shadow/emboss/engrave fields at all
    ↓
TextStyle (renderer/mod.rs:48)
  → no outline/shadow/emboss/engrave fields at all
    ↓
Canvas draw_text (web_canvas.rs:564)
  → only calls fillText, no transformation rendering
```

### Hancom Rendering Approach (Reference)

| Effect | Rendering Method |
|--------|-----------------|
| Outline | fillText(background color) + strokeText(text color), lineWidth ≈ fontSize/25 |
| Shadow | fillText with shadow_color at offset(±dx, ±dy) then original fillText |
| Emboss | 3-pass: ↗bright color → ↘dark color → original |
| Engrave | 3-pass: ↗dark color → ↘bright color → original |

## Implementation Steps (4 Steps)

---

### Step 1: Fix Bit Parsing + Extend Model

**Purpose**: Parse from correct bit positions + add emboss/engrave fields

**File 1**: `src/parser/doc_info.rs` (line 536-537)
```rust
// [Current]
let outline_type = ((attr >> 4) & 0x07) as u8;
let shadow_type = ((attr >> 7) & 0x03) as u8;

// [Changed]
let outline_type = ((attr >> 8) & 0x07) as u8;
let shadow_type = ((attr >> 11) & 0x03) as u8;
let emboss = (attr & (1 << 13)) != 0;
let engrave = (attr & (1 << 14)) != 0;
```

**File 2**: `src/model/style.rs` — Add fields to CharShape struct
```rust
pub emboss: bool,
pub engrave: bool,
```

**File 3**: `src/serializer/doc_info.rs` (line 371-376) — Fix serialization bit positions
```rust
// [Current] bits 4-6, 7-8
// [Changed] bits 8-10, 11-12, 13, 14
```

**File 4**: `src/parser/hwpx/header.rs` (line 302-303) — Fix HWPX parser bits
```rust
// [Current]
b"emboss" => cs.attr |= 1 << 9,
b"engrave" => cs.attr |= 1 << 10,

// [Changed]
b"emboss" => { cs.attr |= 1 << 13; cs.emboss = true; }
b"engrave" => { cs.attr |= 1 << 14; cs.engrave = true; }
```

---

### Step 2: Extend Style Pipeline

**Purpose**: Pass transformation attributes from CharShape → ResolvedCharStyle → TextStyle

**File 1**: `src/renderer/style_resolver.rs`
- Add fields to `ResolvedCharStyle` (line 19-50):
```rust
pub outline_type: u8,     // 0=none, 1=solid, 2=dotted, 3=thick solid, 4=dash, 5=dash-dot, 6=dash-dot-dot
pub shadow_type: u8,      // 0=none, 1=discontinuous, 2=continuous
pub shadow_color: ColorRef,
pub shadow_offset_x: i8,
pub shadow_offset_y: i8,
pub emboss: bool,
pub engrave: bool,
```
- Map CharShape values in `resolve_single_char_style()` (line 238-283)

**File 2**: `src/renderer/mod.rs`
- Add fields to `TextStyle` (line 48-73):
```rust
pub outline_type: u8,
pub shadow_type: u8,
pub shadow_color: ColorRef,
pub shadow_offset_x: f64,  // px converted value
pub shadow_offset_y: f64,
pub emboss: bool,
pub engrave: bool,
```
- Update `Default` impl

**File 3**: `src/renderer/layout.rs`
- Add ResolvedCharStyle → TextStyle mapping in `resolved_to_text_style()` (line 6872-6891)

---

### Step 3: Canvas Multi-pass Rendering

**Purpose**: Render text transformation effects in draw_text

**File**: `src/renderer/web_canvas.rs` — `draw_text()` (line 564-626)

Apply each effect within the cluster rendering loop:

**Outline** (outline_type > 0):
```
1. fillText(background or white) — inner fill
2. strokeText(text color) — outline, lineWidth = fontSize / 25
```

**Shadow** (shadow_type > 0):
```
1. fillText(shadow_color, x+dx, y+dy) — shadow
2. fillText(text_color, x, y) — original
(dx, dy are shadow_offset_x/y converted to px)
```

**Emboss** (emboss):
```
1. fillText(bright color, x-1, y-1) — top-left highlight
2. fillText(dark color, x+1, y+1) — bottom-right shadow
3. fillText(original color, x, y) — original
```

**Engrave** (engrave):
```
1. fillText(dark color, x-1, y-1) — top-left shadow
2. fillText(bright color, x+1, y+1) — bottom-right highlight
3. fillText(original color, x, y) — original
```

**Priority**: emboss/engrave are mutually exclusive. outline + shadow can be combined.

---

### Step 4: Integration Testing and Verification

| Item | Method |
|------|--------|
| 571 regression tests | `docker compose run --rm test` |
| WASM build | `docker compose run --rm wasm` |
| Bit parsing verification | Confirm outline_type/shadow_type values are correctly parsed in existing tests |
| Rendering verification | Visual check with sample HWP documents that have text transformations applied |

---

## Changed Files Summary

| File | Change Description | Scale |
|------|-------------------|-------|
| `src/parser/doc_info.rs` | Fix outline/shadow bit positions, add emboss/engrave parsing | ~5 lines |
| `src/model/style.rs` | Add emboss/engrave fields to CharShape | ~5 lines |
| `src/serializer/doc_info.rs` | Fix serialization bit positions, add emboss/engrave serialization | ~10 lines |
| `src/parser/hwpx/header.rs` | Fix HWPX emboss/engrave bits | ~4 lines |
| `src/renderer/style_resolver.rs` | Extend ResolvedCharStyle + resolve mapping | ~15 lines |
| `src/renderer/mod.rs` | Extend TextStyle + Default update | ~15 lines |
| `src/renderer/layout.rs` | Add resolved_to_text_style mapping | ~10 lines |
| `src/renderer/web_canvas.rs` | Multi-pass rendering in draw_text | ~60 lines |
| **Total** | | **~125 lines** |

## Verification Methods

1. `docker compose run --rm test` — Confirm 571 regression tests pass
2. `docker compose run --rm wasm` — Confirm WASM build succeeds
3. Open HWP documents with text transformations in browser and visually verify outline/shadow/emboss/engrave effects
