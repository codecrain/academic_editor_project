# Task 52 Step-by-Step Completion Report: Format Change (Font/Size/Bold/Italic)

## Step 1: Toolbar UI Construction -- Hancom WebGian 3-Row Structure (Complete)

### Implementation Details

Full overhaul to the same 3-row structure as Hancom WebGian:

**Row 1: Menu Bar `#menu-bar`**
- File, Edit, View, Insert, Format, Page, Table -- 7 menu items
- Hover: blue underline + background highlight
- "File" click -> file open dialog connected

**Row 2: Icon Toolbar `#icon-toolbar`**
- 6 groups (separated by vertical dividers):
  - Cut, Copy, Paste, Format Paint
  - Control Marks, Paragraph Marks, Grid View
  - Character Shape, Paragraph Shape
  - Table, Shape, Image
  - Object Properties, Character Map, Hyperlink
  - Footnote, Endnote, Header, Footer, Find
- Each button: icon + bottom text label, hover background highlight
- Status bar right-aligned

**Row 3: Style Bar `#style-bar`** -- Hancom WebGian style_bar pattern:
- Style dropdown (`Default`)
- Font dropdown (`HCR Batang`, 110px)
- Size input + `pt` unit + up/down arrows
- Format buttons: **B**(bold), *I*(italic), <u>U</u>(underline), S(strikethrough) -- Korean character representations
- Text color: character + color bar + dropdown
- Highlighter pen
- 4 alignment buttons: CSS line pattern icons
- Line spacing dropdown
- Zoom: number + % + left/right arrows

### Build Result
- Vite(tsc) build: Succeeded (HTML 7.78KB, CSS 5.22KB, JS 76.28KB)

---

## Step 2: Toolbar TypeScript Module + EventBus Integration -- Complete

### Implementation Details

**`ui/toolbar.ts` new file**:
- `Toolbar` class -- style-bar DOM element binding + EventBus integration
- `setupFormatButtons()`: B/I/U/S mousedown -> `eventBus.emit('format-toggle', prop)`
- `setupFontControls()`: Font change -> `findOrCreateFontId` -> `format-char`, Size Enter -> `format-char`, increment -> `format-char`
- `setupColorPicker()`: Button click -> open color picker, input -> `format-char`
- `setupAlignButtons()`: Alignment buttons -> `eventBus.emit('format-para', {align})`
- `updateState(props)`: Receives `cursor-format-changed` -> updates B/I/U/S active state, font/size/color
- `setEnabled(bool)`: Disabled before document load

**`main.ts` modifications**:
- `Toolbar` import + initialization
- Menu bar "File" click -> file open connection
- Initially disabled, enabled on successful loadFile
- zoom-level display format adjustment (% in separate span)

---

## Step 3: WasmBridge Wrappers + ApplyCharFormatCommand -- Complete

### Implementation Details

**`types.ts` additions** -- `CharProperties` interface:
- `fontFamily?`, `fontSize?` (HWPUNIT), `bold?`, `italic?`, `underline?`, `strikethrough?`, `textColor?`, `charShapeId?`, `fontId?`

**`wasm-bridge.ts` additions** -- 8 formatting API wrappers:
- `getCharPropertiesAt` / `getCellCharPropertiesAt`
- `applyCharFormat` / `applyCharFormatInCell`
- `findOrCreateFontId`
- `getParaPropertiesAt` / `applyParaFormat` / `applyParaFormatInCell`

**`command.ts` additions** -- `ApplyCharFormatCommand`:
- `execute()`: Calls `applyCharFormat` for each paragraph in selection range, preserves previous charShapeId
- `undo()`: Restores from preserved charShapeId
- `mergeWith`: Always null

---

## Step 4: InputHandler Integration (Shortcuts + Format State Query) -- Complete

### Implementation Details

**`input-handler.ts` modifications**:

Shortcuts (`handleCtrlKey`):
- `Ctrl+B`: `applyToggleFormat('bold')`
- `Ctrl+I`: `applyToggleFormat('italic')`
- `Ctrl+U`: `applyToggleFormat('underline')`

Format application:
- `applyCharFormat(props)`: Selection range -> `ApplyCharFormatCommand` -> `executeCommand`
- `applyToggleFormat(prop)`: Query format of character before cursor -> toggle
- `applyParaFormat(props)`: Paragraph alignment (all paragraphs in selection range)

Format state query:
- `getCharPropertiesAtCursor()`: Based on offset-1 (character before cursor)
- `emitCursorFormatState()`: Called from updateCaret, onClick, activateWithCaretPosition

EventBus reception:
- `format-toggle`, `format-char`, `format-para`

Click ignore range expanded:
- `#menu-bar`, `#icon-toolbar`, `#style-bar`

---

## Step 5: Font List + Color Picker + Alignment -- Complete

### Implementation Details

**Font**: 7 default fonts + `findOrCreateFontId` integration
**Size**: pt input + up/down increment (+/-1pt), HWPUNIT conversion (x200)
**Color**: color picker + `#color-bar` synchronization
**Alignment**: `applyParaFormat` / `applyParaFormatInCell` WASM API wrappers + 4-direction buttons

---

## Step 6: Hancom SVG Sprite Icon Application -- Complete

### Implementation Details

**Icon resource application**:
- webhwp `commonFrame/skins/images/icon_small_ko.svg` (470KB) -> copied to `rhwp-studio/public/images/`
- Uses same SVG sprite icons as Hancom WebGian

**Sprite system** (`style.css`):
- `.tb-sprite` base class: 18x18px, `background-image: url(/images/icon_small_ko.svg)`
- 40px grid-based `background-position: calc(-40px * col) calc(-40px * row)` -- same method as Hancom CSS
- 20 icon class mappings:
  - `icon-cut(2,1)`, `icon-copy(3,1)`, `icon-paste(4,1)`, `icon-format-copy(0,10)`
  - `icon-ctrl-mark(7,7)`, `icon-para-mark(8,7)`, `icon-grid(13,2)`
  - `icon-char-shape(12,8)`, `icon-para-shape(13,8)`
  - `icon-table(2,3)`, `icon-shape(0,3)`, `icon-image(1,3)`
  - `icon-obj-props(17,1)`, `icon-symbols(4,3)`, `icon-hyperlink(5,3)`
  - `icon-footnote(4,4)`, `icon-endnote(5,4)`, `icon-header(1,4)`, `icon-footer(2,4)`
  - `icon-find(15,1)`

**HTML changes** (`index.html`):
- All Unicode text icons in row 2 icon toolbar -> replaced with `<span class="tb-sprite icon-xxx">`

### Build Result
- Vite(tsc) build: Succeeded (HTML 8.00KB, CSS 6.16KB, JS 76.28KB)

---

## Step 7: Web Font Loading + Font Substitution System Porting -- Complete

### Implementation Details

**`core/font-loader.ts` (new)** -- TypeScript port of web/editor.html font loading system:
- `FONT_LIST`: 66 font entries (HY, HCR, system, English, Pretendard, etc.)
- `REGISTERED_FONTS`: @font-face registered font Set
- `loadWebFonts()`: Dynamic CSS @font-face rule generation + FontFace API immediate load
- Canvas 2D compatibility guaranteed (Chrome may not recognize Canvas fonts with FontFace API alone)

**`core/font-substitution.ts` (new)** -- TypeScript port of web/font_substitution.js:
- `SUBST_TABLES`: webhwp g_SubstFonts substitution table (7 languages)
- `resolveFont(fontName, altType, langId)`: 3-tier font resolution (registered -> chain tracking -> fallback)
- `fontFamilyWithFallback(fontName)`: CSS font-family fallback chain generation
- Rust WASM side also has `resolve_font_substitution` implemented as dual safety net

**`main.ts` modifications**:
- Added `loadWebFonts()` call (before WASM initialization)
- Status display: "Loading web fonts..." -> "Loading WASM..." -> "Please select an HWP file."

**Font file connection**:
- `rhwp-studio/public/fonts` -> `../../web/fonts` symlink (31MB, 31 woff2 files)
- Confirmed auto-copy to `dist/fonts/` during Vite build

### Build Result
- Vite(tsc) build: Succeeded (21 modules, HTML 8.00KB, CSS 6.16KB, JS 80.56KB)

---

## Changed Files Summary

| File | Changes | Size |
|------|---------|------|
| `rhwp-studio/index.html` | 3-row structure + sprite icon application | +95 lines (full overhaul) |
| `rhwp-studio/src/style.css` | Full UI styles + sprite system | +250 lines (full overhaul) |
| `rhwp-studio/public/images/icon_small_ko.svg` | Hancom SVG sprite (new) | 470KB |
| `rhwp-studio/src/ui/toolbar.ts` | Toolbar class (new) | +178 lines |
| `rhwp-studio/src/core/types.ts` | CharProperties interface | +12 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | Format/paragraph API wrappers (8) | +50 lines |
| `rhwp-studio/src/engine/command.ts` | ApplyCharFormatCommand | +75 lines |
| `rhwp-studio/src/engine/input-handler.ts` | Ctrl+B/I/U, format application, format state, alignment | +85 lines |
| `rhwp-studio/src/main.ts` | Toolbar initialization + menu bar connection + web font loading | +12 lines |
| `rhwp-studio/src/core/font-loader.ts` | Web font loader (new) -- 66 fonts | +100 lines |
| `rhwp-studio/src/core/font-substitution.ts` | Font substitution (new) -- 7 languages | +200 lines |
| `rhwp-studio/public/fonts` | web/fonts symlink (31 woff2 files, 31MB) | symlink |
