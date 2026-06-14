# Hancom WebGian Font System Source Analysis

Written: 2026-02-21
Analysis target: `webgian/hancomgian_files/main-hwpapp.js.download` (4.7MB)

## 1. Overview

Hancom WebGian's font handling system consists of three core components:

1. **Embedded font metrics (.hft)** -- 387 modules, glyph width tables for 342 fonts
2. **Font family mapping** -- HWP font name -> CSS font-family string conversion
3. **Dynamic web font loading** -- woff2 font loading via FontFace API

## 2. Embedded Font Metrics (.hft)

### 2.1 Scale

| Item | Count |
|------|------|
| .hft module count | 387 (hc_fj ~ hc_mr) |
| Font name entries | 342 |
| Language/script types | 7 (Hangul, Latin, Hanja, Japanese, Old Hangul, Simplified Chinese, Special) |

### 2.2 Data Structure

Each .hft module is defined as an AMD module and returns the following structure:

```javascript
{
  fileName: "enbaskvl.hft",   // Original .hft filename
  v73: 1,                      // Language/script type index
  emsize: 1000,                // em unit (design units/em)
  _73: [                       // Width data array per code range
    {
      type: 0 | 1 | 2,        // Lookup type
      y73: 32768,              // Start code point (HWP internal encoding)
      I73: 65535,              // End code point
      D73: [...]               // Width value array
    }
  ]
}
```

### 2.3 Three Lookup Types

#### type: 0 -- Uniform Width

All characters have the same width:
```javascript
{ type: 0, y73: 32768, I73: 65535, D73: [880] }
// -> All characters in this range have width = 880 (emsize basis)
```

**Example use**: System fixed-width Hangul font (hgsys.hft)

#### type: 1 -- Per-Character Width

Individual width array per code point:
```javascript
{
  type: 1, y73: 32, I73: 126,
  D73: [274, 301, 331, 769, 549, 798, ...]
  // D73[charCode - y73] = width of that character
}
```

**Example use**: Latin proportional font (enbaskvl.hft -- Baskerville)
- `D73[0]` = 274 -> Space (U+0020)
- `D73[1]` = 301 -> Exclamation mark (U+0021)
- Total 95 values (ASCII 32~126)

#### type: 2 -- Hangul Syllable Decomposition

A compressed method that calculates width from initial/medial/final consonant combinations:
```javascript
{
  type: 2, y73: 32768, I73: 65535,
  g73: [2, 4, 1],        // [initial groups, medial groups, final groups]
  m73: [0,0,1,0,...],    // 32 entries: initial consonant -> group index
  E73: [0,0,3,0,...],    // 32 entries: medial vowel -> group index
  H73: [0,0,0,0,...],    // 32 entries: final consonant -> group index
  D73: [900, 850, 590, 950, 900, 850, 635, 950]
  // D73[cho_group * jung_groups * jong_groups + jung_group * jong_groups + jong_group]
}
```

**Key idea**: Storing all 11,172 Hangul syllables individually would require 11,172 values, but classifying initial/medial/final consonants into shape groups allows representation with only `2x4x1 = 8` values.

**Example use**: Peach font (hgpeach.hft)
- 2 initial groups: narrow consonants vs. wide consonants
- 4 medial groups: vertical vowels / horizontal vowels / compound / other
- 1 final group: no difference

### 2.4 Language/Script Type (v73)

| v73 Value | Language/Script | Module Count |
|--------|-------------|---------|
| 0 | Hangul | 110 |
| 1 | Latin | 172 |
| 2 | Hanja (Chinese characters) | 37 |
| 3 | Japanese | 28 |
| 4 | Old Hangul | 3 |
| 5 | Simplified Chinese | 35 |
| 6 | Special | 2 |

### 2.5 emsize Distribution

| emsize | Module Count | Representative Fonts |
|--------|---------|-----------|
| 1000 | 295 | Most Hangul/Latin fonts |
| 1200 | 34 | Myungjo, Gothic, and other legacy HWP fonts |
| 512 | 48 | Japanese/Chinese/Special fonts |
| 1024 | 8 | Some special fonts |

### 2.6 Font Mapping Table (R.data)

Composed of 7 sub-arrays, where each entry is:

```javascript
{
  fontName: "Myungjo",
  fontData: [normalHft, boldHft, italicHft, boldItalicHft]
  // 4 slots: normal/bold/italic/bold-italic .hft references
}
```

**Style fallback order** (L73):
```
Normal      -> Normal, Italic, Bold, BoldItalic
Bold        -> Bold, Normal, BoldItalic, Italic
Italic      -> Italic, Normal, BoldItalic, Bold
BoldItalic  -> BoldItalic, Italic, Bold, Normal
```

### 2.7 Key Font Name <-> .hft File Mapping

| Font Name | Hangul .hft | Latin .hft |
|--------|-----------|-----------|
| Myungjo | hgmj.hft | enmj.hft |
| Gothic | hggt.hft | engt.hft |
| System | hgsys.hft | ensys.hft |
| Hanyang Shin Myungjo | hgsmj.hft | ensmj.hft |
| Hanyang Gyeon Myungjo | hggmj.hft | engmj.hft |
| Hanyang Jung Gothic | hgjgt.hft | enjgt.hft |
| Hanyang Gyeon Gothic | hgggt.hft | enggt.hft |
| Hanyang Graphic | hggrp.hft | engrp.hft |
| Hanyang Gungseo | hggs.hft | engs.hft |
| Human Myungjo | hmksm.hft | -- |
| Human Gothic | hmkmg.hft | -- |
| HY Round Gothic | hyhggl.hft | hyengl.hft |
| Munhwa Batang | hgbt.hft | -- |
| Munhwa Dotum | hgdu.hft | -- |
| #Se Myungjo | hchgsemj.hft | hcensemj.hft |
| #Shin Myungjo | hchgsmj.hft | hcensmj.hft |
| Shinmyeong Se Myungjo | tesemhg.hft | tesemen.hft |
| Yangjae Down Myungjo M | yjhgdnmj.hft | yjendnmj.hft |

**Filename prefix conventions**:

| Prefix | Meaning |
|--------|------|
| `hg` | Hangul glyph (standard fonts) |
| `en` | Latin glyph |
| `hchg` | Hangul glyph (#-prefixed fonts) |
| `hcen` | Latin glyph (#-prefixed fonts) |
| `te` | Shinmyeong fonts |
| `yj` | Yangjae fonts |
| `hme` | HCI flower name fonts |
| `hmk` | Humanist Hangul fonts |
| `han`/`khan` | Han/Gonghan fonts |
| `jp`/`sp` | Japanese/Simplified Chinese system fonts |
| `hy` | HY fonts |
| `fl` | Separated writing (Puleotseugi) fonts |

## 3. Font Family Mapping (CSS font-family Generation)

### 3.1 Mapping Function (XTt)

Converts HWP font names to CSS `font-family` strings:

```javascript
XTt: function(fontName, isSpecialChar, isSymbol) {
  var alias = qTt[fontName.toUpperCase()];  // Alias table lookup
  return alias
    ? "'" + fontName + "'," + alias + "," + fallbacks
    : "'" + fontName + "'," + fallbacks;
}
// Example result: "'HCR Batang','HCR Batang','serif'"
```

### 3.2 Font Alias Table (qTt)

Maps various name variants of Korean fonts:

```javascript
qTt: {
  "HY HeadLine M":  "'HYHeadLine M','HYHeadline medium','HYHeadline'",
  "HYHEADLINE M":   "'HY HeadLine M','HYHeadline medium','HYHeadline'",
  "HY GungSo B":    "'HYGungSo B','HYGungSo black','HYGungSo'",
  // ... many entries
}
```

### 3.3 Fallback Chain

```
Requested font -> Alias font -> Default Korean font -> System fallback
'HCR Batang' -> 'HCR Batang' -> 'Malgun Gothic' -> serif
```

## 4. Dynamic Web Font Loading

### 4.1 FontFace API (Chrome Only)

```javascript
// Registered web fonts
fontRegistry = {
  "HY HeadLine M":  { url: baseUrl + "/hygtre.woff2",  pending: false, loaded: false },
  "HY GyeonGoDic":  { url: baseUrl + "/hygtre.woff2",  pending: false, loaded: false },
  "HY Graphic":     { url: baseUrl + "/hygprm.woff2",  pending: false, loaded: false },
  "HY GyeonMyungjo":{ url: baseUrl + "/hymjre.woff2",  pending: false, loaded: false },
  "SpoqaHanSans":   { url: baseUrl + "/SpoqaHanSans-Regular.woff2", pending: false, loaded: false }
};

// Lazy loading flow
if (isChrome && fontRegistry[fontName] && !fontRegistry[fontName].loaded) {
  new FontFace(fontName, "url(" + fontRegistry[fontName].url + ")")
    .load()
    .then(function() {
      fontRegistry[fontName].loaded = true;
      triggerPageRerender();  // Re-render after font load
    });
  fontRegistry[fontName].pending = true;
}
```

**Note**: Only 5 web fonts are dynamically loaded. The rest depend on fonts installed on the user's system.

## 5. Font Metric Usage -- Text Width Measurement Pipeline

### 5.1 Two-Stage Measurement Strategy

```
┌─────────────────────────────────────────┐
│  1st: .hft metric-based measurement      │
│  (server-independent)                    │
│  lr3(char, fontName, style) -> true?     │
│    -> cr3(char, fontName, style)         │
│    -> width = D73[index] x fontSize      │
│       / emsize                           │
├─────────────────────────────────────────┤
│  2nd: Browser measurement (fallback)     │
│  lr3(char, fontName, style) -> false?    │
│    -> Canvas: ctx.font="1000pt font"     │
│      ctx.measureText(char).width / 100   │
│    -> or DOM: span.style.fontSize="400pt"│
│      span.getBoundingClientRect().width/40│
└─────────────────────────────────────────┘
```

### 5.2 .hft-Based Measurement Function (cr3)

```javascript
function cr3(charCode, fontName, styleFlags) {
  // 1. Determine language type: AAt(charCode) -> Hangul/Latin/Hanja/...
  var langType = AAt(charCode);

  // 2. Find font: search fontName in R.data[langType]
  var fontEntry = S73(fontName, langType);
  if (!fontEntry) return fallback;

  // 3. Style fallback: search normal/bold/italic/bolditalic via L73
  var hftData = U73(fontEntry, styleFlags);

  // 4. Width lookup: W73(charCode, hftData)
  var width = W73(charCode, hftData);

  // 5. Bold correction
  if (isBold) width += parseInt((emsize + 10) / 20);

  // 6. Superscript/subscript correction (64% reduction)
  if (isSuperOrSub) width = _2(width, 16, 25);

  // 7. Final pixel width = width x (fontSize/4) / (100 x emsize)
  return _2(width * (fontSize / 4), ratio, 100 * emsize);
}
```

### 5.3 type:2 Hangul Syllable Width Calculation (Inside W73)

```javascript
function W73(code, hftData) {
  for (var entry of hftData._73) {
    if (code < entry.y73 || code > entry.I73) continue;

    switch (entry.type) {
      case 0: return entry.D73[0];              // Uniform width
      case 1: return entry.D73[code - entry.y73]; // Per-character width
      case 2:
        // Hangul syllable decomposition
        var syllable = code - entry.y73;  // Based on HWP internal code
        var cho = getChoseong(syllable);  // Initial consonant index
        var jung = getJungseong(syllable); // Medial vowel index
        var jong = getJongseong(syllable); // Final consonant index
        var choGroup  = entry.m73[cho];
        var jungGroup = entry.E73[jung];
        var jongGroup = entry.H73[jong];
        var idx = choGroup * entry.g73[1] * entry.g73[2]
                + jungGroup * entry.g73[2]
                + jongGroup;
        return entry.D73[idx];
    }
  }
  return emsize; // Default: full-width
}
```

### 5.4 Measurement Value Caching

```javascript
// LRU cache (128 entries)
// Key: charString + fontName + (4096 * fontSize + ratio)
var cache = new LRUCache(128);
```

### 5.5 Font Substitution Chain (Fallback)

When the font is not found in .hft:

```
1. lr3(char, fontName, style) -> false
2. Search alternative font in VTt/YTt font substitution tables
3. Alternative font's .hft exists -> use cr3
4. No alternative either -> get default font name via MTt()
5. Final fallback: browser measureText/DOM measurement
```

## 6. Font Application in Canvas fillText

### 6.1 CSS Font String Composition (J13 Text Rendering)

```javascript
// Font style + size + family
var fontStr = fontStyle + " " + fontSize + "px " + fontFamily;
// Example: "bold 12px 'HCR Batang','HCR Batang','serif'"

ctx.font = fontStr;
ctx.fillText(char, x, y);
```

### 6.2 Font Size Calculation (GRt)

```javascript
GRt: function(baseHeight, scalePercent, isSpecial, isNarrow) {
  var height = baseHeight;
  if (isSpecial || isNarrow) height = 16 * height / 25;  // 0.64 ratio
  return height + height * ((scalePercent || 100) - 100) / 100;
}
```

### 6.3 Horizontal Scaling Application

```javascript
ctx.save();
ctx.scale(hScale, 1);              // hScale = horizontal scaling ratio (0.5~2.0)
ctx.translate(-(x - x / hScale), 0); // Position correction
ctx.fillText(char, x, y);
ctx.restore();
```

### 6.4 Font Style Composition (KRt)

```javascript
KRt: function(isItalic, isBold) {
  var style = "";
  if (isItalic) style += "italic";
  if (isBold) style += (style.length > 0 ? " " : "") + "bold";
  return style;  // "", "bold", "italic", "bold italic"
}
```

## 7. Comparison with rhwp

### 7.1 Current rhwp Font Measurement Approach

```rust
// layout.rs -- WASM environment
#[wasm_bindgen(js_namespace = globalThis, js_name = "measureTextWidth")]
fn js_measure_text_width(font: &str, text: &str) -> f64;

// Measurement pipeline:
// 1. Call Canvas measureText at 1000px size
// 2. Scale by font_size/1000
// 3. Quantize to HWP units (x75) -> round to integer -> convert to px
fn measure_char_width_hwp(font: &str, c: char, hangul_hwp: i32, font_size: f64) -> f64 {
    if c.is_hangul_syllable() {
        return hangul_hwp as f64 / 75.0;  // Reuse surrogate measurement of '가'
    }
    let raw_px = js_measure_text_width(font, &c.to_string());
    let actual_px = raw_px * font_size / 1000.0;
    let hwp = (actual_px * 75.0).round() as i32;
    hwp as f64 / 75.0
}
```

### 7.2 Comparison Table

| Item | Hancom WebGian | rhwp |
|------|-------------|------|
| Primary measurement | .hft embedded metrics (server-independent) | -- (none) |
| Secondary measurement | Canvas measureText / DOM span | Canvas measureText (WASM->JS) |
| Hangul optimization | type:2 syllable decomposition (initial/medial/final groups) | Surrogate measurement of '가' (same for all Hangul) |
| Measurement precision | Integer arithmetic in emsize units | HWPUNIT quantization (x75) |
| Caching | LRU 128 entries | None (JS bridge call every time) |
| Font coverage | 342 fonts | Depends on system fonts |
| Bold correction | emsize/20 additional width | None (depends on CSS bold) |
| Horizontal scaling correction | Applied to both measurement and rendering | Applied to rendering only |

### 7.3 Can We Utilize .hft in rhwp?

**Direct use: Not possible** -- Using .hft data extracted from Hancom's code would cause copyright issues.

**Indirect utilization possibilities**:

1. **Structure reference**: The type:2 Hangul syllable decomposition algorithm is based on publicly available Unicode Jamo decomposition principles. The same algorithm can be independently implemented.

2. **Independent metrics generation**: Glyph widths can be read from the `hmtx` table of actual font files (.ttf/.otf) to create our own metrics DB. This is possible without FreeType (only requires parsing OS/2 and hmtx headers).

3. **Measurement cache introduction**: Referencing Hancom's LRU 128 cache pattern, we can introduce a cache layer for our WASM->JS measureText calls. This could dramatically reduce the number of JS bridge calls.

4. **Hangul optimization**: Instead of the current approach of representing all Hangul syllable widths with a single '가' measurement, reflecting width differences by initial/medial/final consonant groups would improve precision.

### 7.4 Recommended Improvement Directions

| Priority | Improvement | Effect | Cost |
|---------|-----------|------|------|
| 1 | Introduce measureText cache | 50%+ reduction in JS bridge calls | Low |
| 2 | Independent metrics DB via TTF hmtx parsing | Server/offline measurement possible | Medium |
| 3 | Hangul syllable decomposition measurement | Proportional Hangul font precision | Medium |
| 4 | Bold/italic width correction | Bold text layout accuracy | Low |
