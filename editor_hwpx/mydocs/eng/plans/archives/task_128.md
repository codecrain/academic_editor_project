# Task 128 Execution Plan -- Bold/Italic Font Width Correction

## Background

### Current Status

Bold/Italic coverage of the 582 font metrics generated in Task 125:

| Category | Metric Count | Ratio |
|----------|-------------|-------|
| Regular (bold=false, italic=false) | 366 | 62.9% |
| Bold only (bold=true, italic=false) | 39 | 6.7% |
| Italic only (bold=false, italic=true) | 30 | 5.2% |
| BoldItalic (bold=true, italic=true) | 49 | 8.4% |
| **Total** | **582** | |

- All 4 variants (R/B/I/BI): 46 fonts (mostly English: Arial, Times New Roman, Calibri, etc.)
- Only 1 variant: 283 fonts (mostly Regular only)

### Problem Scenario

`find_metric()` (font_metrics_data.rs:63) fallback logic:

```
1st: Exact match (name + bold + italic)
2nd: Bold-only match (ignore italic)
3rd: Regular fallback <- Width error occurs here
```

When Bold is requested for a font that only has Regular:
- `find_metric("Haansoft Batang", bold=true, italic=false)` -> returns Regular
- Rendering with CSS `font-weight: bold` causes browser to apply Faux Bold (synthetic Bold)
- Faux Bold widens glyphs due to stroke thickness increase -> **layout width != rendering width**

### Hancom webhwp Approach

Hancom applies hardcoded width correction for Bold:

```javascript
if (isBold) width += parseInt((emsize + 10) / 20);
```

That is, when Bold, it adds **em_size/20** to the width (~50 em units for 1000em).

### Actual Impact Scope

| Font Type | Bold Metric Exists | Width Correction Needed |
|-----------|-------------------|------------------------|
| Major English (Arial, Calibri, etc.) | Yes (separate TTF) | No -- uses measured values |
| Major Korean (HamChoRom, Malgun Gothic, Nanum) | Yes (separate TTF) | No -- uses measured values |
| Single-weight fonts (283) | No | **Yes** -- Faux Bold correction needed |
| Korean font Italic | No TTF | No -- Korean has no Italic |

## Solution Direction

Detect when `find_metric()` **falls back to Regular after exact match failure** and apply Hancom-style width correction.

## Implementation Phases (3 Phases)

---

### Phase 1: Add Fallback Info to find_metric Return

**File**: `src/renderer/font_metrics_data.rs`

Add information about **whether the actually returned variant matches the request** to `find_metric()`'s return value.

```rust
pub struct MetricMatch {
    pub metric: &'static FontMetric,
    pub bold_fallback: bool,   // Bold requested but fell back to Regular
}

pub fn find_metric(name: &str, bold: bool, italic: bool) -> Option<MetricMatch> {
    // 1st: Exact match
    if let Some(m) = FONT_METRICS.iter().find(|m| m.name == name && m.bold == bold && m.italic == italic) {
        return Some(MetricMatch { metric: m, bold_fallback: false });
    }
    // 2nd: Bold-only match
    if let Some(m) = FONT_METRICS.iter().find(|m| m.name == name && m.bold == bold && !m.italic) {
        return Some(MetricMatch { metric: m, bold_fallback: false });
    }
    // 3rd: Regular fallback
    FONT_METRICS.iter().find(|m| m.name == name)
        .map(|m| MetricMatch { metric: m, bold_fallback: bold })
}
```

---

### Phase 2: Apply Bold Correction to measure_char_width_embedded

**File**: `src/renderer/layout.rs`

Apply Hancom-style width correction when `bold_fallback` is true in `measure_char_width_embedded()`:

```rust
fn measure_char_width_embedded(font_family: &str, bold: bool, italic: bool, c: char, font_size: f64) -> Option<f64> {
    let mm = font_metrics_data::find_metric(font_family, bold, italic)?;
    let w = mm.metric.get_width(c)?;
    let mut actual_px = w as f64 * font_size / mm.metric.em_size as f64;

    // Bold fallback correction: Faux Bold widens glyphs due to stroke thickness increase
    // Hancom webhwp approach: += (em_size + 10) / 20 (em units)
    if mm.bold_fallback {
        actual_px += (mm.metric.em_size as f64 + 10.0) / 20.0 * font_size / mm.metric.em_size as f64;
    }

    let hwp = (actual_px * 75.0).round() as i32;
    Some(hwp as f64 / 75.0)
}
```

---

### Phase 3: Integration Testing and Verification

| Item | Method |
|------|--------|
| 571 regression tests | `docker compose run --rm test` |
| WASM build | `docker compose run --rm wasm` |
| Font with Bold metric | Arial Bold, etc. -> same as before (bold_fallback=false) |
| Font without Bold metric | Haansoft Batang Bold -> verify correction applied |

---

## Changed Files Summary

| File | Changes | Scope |
|------|---------|-------|
| `src/renderer/font_metrics_data.rs` | `MetricMatch` struct, `find_metric` return value change | ~15 lines |
| `src/renderer/layout.rs` | bold_fallback correction in `measure_char_width_embedded` | ~5 lines |

## Design Decision Rationale

| Decision | Reason |
|----------|--------|
| find_metric return value change (Option<MetricMatch>) | Allows caller to determine fallback status |
| em_size/20 correction (Hancom approach) | Competitor-validated heuristic, addresses Faux Bold stroke thickness increase |
| No Italic correction | Korean fonts have no Italic, English Italic width change is negligible |

## Expected Benefits

| Item | Current | After |
|------|---------|-------|
| Layout precision for fonts without Bold metric | Uses Regular width (Faux Bold width mismatch) | Approximated with em_size/20 correction |
| Fonts with Bold metric | No impact (bold_fallback=false) | Same |
| WASM binary size | No change | Same |
| Change scope | -- | 2 files, ~20 lines |
