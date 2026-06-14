# Hancom webhwp Text Measurement System Analysis

> Analysis target: `/webhwp/js/hwpApp.*.chunk.js` (minified webpack bundle, ~5MB)
> Analysis date: 2026-02-09

## 1. Overall Pipeline Overview

```
Character + Font + Size + Width Ratio
        |
    Cache Lookup (LRU 128)
    |- Hit: return cached value
    +- Miss: proceed with measurement
        |
    Character Type Classification (Korean/ASCII/Zero-width/Other)
    |- Zero-width: return 0
    +- Other: measure
        |
    Canvas Measurement (1000pt) or DOM Measurement (400pt)
    |- Korean (44032-55203): surrogate measurement with 'ga' (U+AC00)
    |- ASCII (<127): surrogate measurement with 'A'
    +- Other: direct character measurement
        |
    Normalize: width / 100 (Canvas) or / 40 (DOM)
        |
    Round to 2 decimal places
        |
    HWP Unit Conversion: ABt(value) = value x 7200 / 96
        |
    Font-specific Scaling: ZRt(u, iYt, 1000) = round(u x iYt / 1000)
        |
    Return Final Width (HWP units) + Cache Storage
```

## 2. Canvas-Based Measurement (Primary Method)

### 2.1 Core Code (Reconstructed)

```javascript
// Location: hwpApp chunk, offset ~3295900
gqt(char, fontName, sizeCode, variant, context) {
    // 1. Cache key generation and lookup
    const cacheKey = String(char) + fontName + String(4096 * sizeCode + variant);
    const cached = this.$yr(cacheKey);
    if (cached !== 0) return cached;

    // 2. Font property lookup
    const fontProps = Zt.Djt(fontName);       // { iYt, hYt, ... }
    const charType = $t.kjt(char.charCodeAt(0));  // Character type
    const resolvedFont = $t.Ojt(char, context, fontName, defaultType);

    // 3. Canvas font setup (only when changed)
    if (this._lastFont[0] !== fontName ||
        this._lastFont[1] !== charType ||
        this._lastFont[2] !== resolvedFont) {
        this.ctx.font = "1000pt " + $t.Ajt(fontName, charType, resolvedFont);
        this._lastFont = [fontName, charType, resolvedFont];
    }

    // 4. Type-specific measurement
    let measured;
    const code = char.charCodeAt(0);

    if (fontProps && (4 & fontProps.hYt || 8 & fontProps.hYt)
        && code >= 44032 && code <= 55203) {
        // Korean syllable -> surrogate measurement with 'ga' (U+AC00)
        measured = this.ctx.measureText("\uAC00").width / 100;
    } else if (fontProps && (4 & fontProps.hYt) && code < 127) {
        // ASCII -> surrogate measurement with 'A'
        measured = this.ctx.measureText("A").width / 100;
    } else if (isZeroWidth(code)) {
        measured = 0;
    } else {
        // Other characters -> direct measurement
        measured = this.ctx.measureText(char).width / 100;
    }

    // 5. Rounding (2 decimal places)
    measured = Math.round(100 * measured) / 100;

    // 6. HWP unit conversion
    let hwpWidth = ABt(measured);  // = measured x 7200 / 96

    // 7. Font-specific advance width scaling
    const advBase = fontProps ? fontProps.iYt : 1024;
    let scaled = ZRt(hwpWidth, advBase, 1000);  // = round(hwpWidth x advBase / 1000)

    // 8. Final calculation
    const quarterSize = parseInt(sizeCode / 4);
    let result;
    if (variant !== 100) {
        result = 4 * parseInt(scaled * quarterSize * variant / (100 * advBase));
    } else {
        result = 4 * ZRt(scaled, quarterSize, advBase);
    }

    // 9. Cache storage
    this.Zyr(cacheKey, result);
    return result;
}
```

### 2.2 Why 1000pt?

| Measurement Font Size | 'ga' measureText().width | Precision |
|---|---|---|
| 10pt | ~10px | Integer level, error +/-0.5px = +/-5% |
| 100pt | ~100px | 1 decimal place, error +/-0.05px = +/-0.05% |
| 1000pt | ~1000px | 2 decimal places, error +/-0.005px = +/-0.0005% |

Measuring at 1000pt then dividing by 100 achieves **2 decimal place precision**.

### 2.3 Korean Surrogate Measurement Principle

In most Korean fonts, **all Korean syllables (ga~hit, 11,172 characters) have identical advance widths**. This is due to the monospaced nature of Korean fonts.

Therefore:
- Measure Korean 'ga' once -> apply the same width to all Korean syllables
- ASCII 'A' single measurement is **not actually used** -> ASCII is proportional-width so each character must be individually measured
- Surrogate measurement is only applied for fonts with the `4 & hYt` flag (composite CJK fonts)

## 3. DOM-Based Measurement (Fallback Method)

### 3.1 Core Code (Reconstructed)

```javascript
// Location: hwpApp chunk, offset ~3296362
// Create offscreen <span> element
const dom = document.createElement("span");
dom.id = "DomForMeasureElement";
dom.style.cssText = "margin:0;padding:0;white-space:nowrap;" +
                    "position:absolute;left:-10000px;";
document.body.appendChild(dom);

// Measurement
dom.style.fontFamily = resolvedFontFamily;
dom.style.fontSize = "400pt";
dom.textContent = char;

const width = dom.getBoundingClientRect().width / 40;
```

### 3.2 Canvas vs DOM Comparison

| Item | Canvas | DOM |
|---|---|---|
| Font Size | 1000pt | 400pt |
| Normalization | /100 | /40 |
| API | `measureText().width` | `getBoundingClientRect().width` |
| Cache Key | `char + font + (4096*size + variant)` | `char_font_size_variant` |
| Usage | Primary method (Chrome) | Fallback (when Canvas is unstable) |

## 4. Unit Conversion System

### 4.1 Core Constants

```javascript
const DPI = 96;              // Screen DPI
const HWP_PER_INCH = 7200;   // 1 inch = 7200 HWPUNIT
const ROTATION_DIV = 4;       // Rotation divisor
```

### 4.2 Conversion Functions

| Function | Formula | Purpose |
|---|---|---|
| `ABt(px)` | `px x 7200 / 96` (= px x 75) | Pixels -> HWP units |
| `Pjt(hwp)` | `hwp x 96 / 7200` (= hwp / 75) | HWP units -> Pixels |
| `Fjt(hwp)` | `hwp / 7200` | HWP units -> Inches |
| `ZRt(t, i, n)` | `round((t x i) / n)` | Scaling + rounding |

### 4.3 Final Width Calculation Formula

```
quarterSize = parseInt(fontSize / 4)

variant == 100 (default width ratio):
  result = 4 x ZRt(scaled, quarterSize, advBase)
         = 4 x round(scaled x quarterSize / advBase)

variant != 100 (non-standard width ratio):
  result = 4 x parseInt(scaled x quarterSize x variant / (100 x advBase))
```

## 5. Font Metadata

### 5.1 Font Property Structure (Xt.tYt[fontName])

```javascript
{
    iYt: 1024,    // advance width base (default 1024)
    hYt: 0,       // font flags
                   //   bit 2 (4): composite CJK font
                   //   bit 3 (8): vertical CJK font
    eYt: ...,     // additional properties
    rYt: ...      // reserved properties
}
```

### 5.2 `iYt` (advance width base)

- The **reference advance width** value for each font
- Usually 1024 (abbreviation of typical TrueType units per em)
- Measured value is scaled by this: `round(hwpWidth x iYt / 1000)`
- Can vary per font, looked up via `Djt(fontName)`

### 5.3 Bundled Web Font List

| Filename | Font Name | Path |
|---|---|---|
| `h2hdrm.woff2` | HCR Dotum | `commonFrame/font/` |
| `hygtre.woff2` | HY Headline M / HY Gwanggo Ding | `commonFrame/font/` |
| `hygprm.woff2` | HY Graphic | `commonFrame/font/` |
| `hymjre.woff2` | HY Gwangmyeongjo | `commonFrame/font/` |
| `MalgunGothicW35-Regular.woff2` | Malgun Gothic | `commonFrame/font/` |
| `SpoqaHanSans-Regular.woff2` | Spoqa Han Sans | `commonFrame/font/` |
| `TimesNewRomanW05-Regular.woff2` | Times New Roman | `commonFrame/font/` |
| `ArialW05-Regular.woff2` | Arial | `commonFrame/font/` |
| `CourierNewW05-Regular.woff2` | Courier New | `commonFrame/font/` |
| `Calibri.woff2` | Calibri | `commonFrame/font/` |
| `TahomaW05-Regular.woff2` | Tahoma | `commonFrame/font/` |
| `VerdanaW05-Regular.woff2` | Verdana | `commonFrame/font/` |

### 5.4 Font Loading Method

```javascript
// Lazy loading via FontFace API
new FontFace(fontName, "url(" + fontUrl + ")").load().then(() => {
    // Trigger document re-render on loading complete
    fontInfo.loaded = true;
    document.fEe();  // re-render
});
```

- Web font loading applied only on Chrome (`isChrome` check)
- Cached measurement values are not used before font is loaded (`tIr()` guard)
- Full document re-render after loading completes

## 6. Caching System

### 6.1 LRU Cache Implementation (Vo class)

```javascript
class LRUCache {
    constructor(maxCapacity = 128) {
        this.maxCapacity = maxCapacity;
        this.evictThreshold = parseInt(75 * maxCapacity / 100);  // 75%
        this.count = 0;
        this.buffer = {};        // key -> node hashmap
        this.head = sentinel;    // doubly linked list (LRU)
        this.end = sentinel;     // doubly linked list (MRU)
    }

    set(key, value) {
        // Evict oldest 25% when capacity exceeded
        if (this.count >= this.maxCapacity) {
            const toDelete = Math.round(this.maxCapacity - this.evictThreshold);
            // Delete toDelete nodes from head
        }
        // Insert new node at end (MRU)
    }

    get(key) {
        return this.buffer[key].value;  // O(1) lookup
    }

    contains(key) {
        return !!this.buffer[key];
    }
}
```

### 6.2 Cache Characteristics

| Item | Value |
|---|---|
| Max Capacity | 128 entries |
| Eviction Trigger | When 100% capacity reached |
| Eviction Amount | Oldest ~25% (= 128 - 96 = 32 entries) |
| Data Structure | Doubly linked list + hashmap |
| Lookup Complexity | O(1) |

### 6.3 Cache Key Format

**Canvas method:**
```
key = String(char) + fontName + String(4096 x sizeCode + variant)
e.g.: "gaHCR Dotum40960"
```

**DOM method:**
```
key = char + "_" + fontName + "_" + size + "_" + variant
e.g.: "ga_HCR Dotum_10_100"
```

## 7. Text Rendering

### 7.1 Rendering Method

Hancom webhwp **renders individual characters with Canvas `fillText()`**.

```javascript
for (let w = 0; w < charCount; w++) {
    if (chars[w].char === " ") continue;  // skip spaces

    const pixelSize = Pjt(chars[w].mqt * scale);  // font size -> px
    const charWidth = Pjt(chars[w].dx) * scale;   // character width -> px
    const xPos = Pjt(chars[w].dt) * scale;        // X position -> px

    ctx.save();
    ctx.scale(chars[w].bqt, 1);      // apply width ratio
    ctx.translate(-(x - x / bqt), 0); // scale compensation
    ctx.font = fontString;
    ctx.fillText(chars[w].char, x + xPos, y + yPos);
    ctx.restore();
}
```

### 7.2 Key Points

- **Per-character rendering**: Each character is drawn with an individual `fillText()` call (not run-based)
- **HWP unit-based positioning**: Per-character position (`dt`) and width (`dx`) are all stored in HWP units
- **Pixel conversion right before rendering**: Convert HWP -> px with `Pjt()` then draw on Canvas
- **Width ratio applied via `ctx.scale()`**: Same approach as ours

## 8. Comparison with Our Implementation and Improvement Directions

### 8.1 Differences Summary

| Item | Hancom webhwp | Our (rhwp) |
|---|---|---|
| Measurement Unit | HWP units (integer) | px (floating point) |
| Measurement Precision | 1000pt -> /100 | Actual fontSize |
| Korean Handling | 'ga' surrogate (monospaced assumption) | Individual character measurement |
| Rendering Unit | Per-character `fillText()` | Per-run `fillText()` |
| Position Calculation | Accumulate in HWP units -> convert to px at render time | Accumulate directly in px |
| Font Files | woff2 bundle (deterministic) | System fonts (non-deterministic) |
| Caching | LRU 128 | None |

### 8.2 Biggest Sources of Mismatch

1. **Run-based vs per-character rendering**: We render an entire run with `fillText(text, x, y)` at once, while charX is measured using prefix-based `measureText()`. Due to Canvas kerning/ligature handling, `measureText("AB").width != measureText("A").width + measureText("B").width` can occur. Hancom draws per-character, so this issue doesn't arise.

2. **Font mismatch**: When the HWP file's fonts (HCR Dotum, etc.) are not on the system, fallback fonts are used. Even when the same fallback is applied in both measurement and rendering, subtle mismatches can occur due to kerning table differences.

3. **Precision**: Measuring at actual fontSize (10px) results in larger sub-pixel rounding errors.

### 8.3 Improvement Directions (Future Reference)

**Short-term (caret accuracy priority)**:
- Adopt Korean monospaced assumption: unify all Korean characters with a single 'ga' measurement
- Adopt 1000pt high-precision measurement
- Introduce caching

**Medium-term (rendering-measurement consistency)**:
- Switch to per-character `fillText()` rendering
- Or use individual character widths during measurement (instead of prefix method)

**Long-term (complete consistency)**:
- Bundle HWP fonts as woff2
- Switch to HWP unit-based position calculation system

## 9. Obfuscated Variable Name Mapping Reference

| Obfuscated Name | Original Meaning | Location (offset) |
|---|---|---|
| `Vo` | LRU Cache class | ~3293685 |
| `gqt` | Character width measurement function | ~3295900 |
| `$yr` | Cache lookup (get) | ~3295705 |
| `Zyr` | Cache store (set) | ~3295705 |
| `Qyr` | Cache instance | ~3295700 |
| `Jyr` | Last set font (cache) | ~3296000 |
| `qyr` | Canvas 2D context | ~3295850 |
| `Djt` | Font property lookup | ~2140052 |
| `Ajt` | CSS font-family string generation | ~3295900 |
| `kjt` | Character type classification | ~990628 |
| `Ojt` | Font substitution resolution | ~3295775 |
| `FDt` | Zero-width character detection | ~990226 |
| `ABt` | px -> HWP units | ~516676 |
| `Pjt` | HWP units -> px | ~516233 |
| `ZRt` | Scaling with rounding | ~516048 |
| `iYt` | Font advance width base | ~506568 |
| `hYt` | Font flags (CJK, etc.) | ~506568 |
| `tIr` | Font loading complete check | ~3300790 |
| `DomForMeasureElement` | Offscreen span for DOM measurement | ~3296362 |
