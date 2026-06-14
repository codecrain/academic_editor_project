# Task 52 Implementation Plan: Format Changes (Font/Size/Bold/Italic)

## Context

Selection + clipboard were completed in Task 51. Now we build a formatting toolbar similar to Hancom WebGian and apply character formatting to the selection range.

**Key finding**: The WASM side already has fully implemented CharShape APIs:
- `getCharPropertiesAt(secIdx, paraIdx, charOffset)` → JSON
- `getCellCharPropertiesAt(secIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx, charOffset)` → JSON
- `applyCharFormat(secIdx, paraIdx, startOffset, endOffset, propsJson)` → apply body formatting
- `applyCharFormatInCell(secIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx, startOffset, endOffset, propsJson)` → same for cell
- `findOrCreateFontId(name)` → font ID

JSON format: `{"bold":true, "italic":true, "fontSize":2400, "fontId":5, "textColor":"#FF0000"}`

**Current UI**: Single-row `#toolbar` (file open + zoom + page info). No formatting tools.

---

## Step-by-Step Implementation Plan

### Step 1: Toolbar UI Construction (HTML + CSS)

**Goal**: Add a formatting toolbar (`#style-bar`) below the existing `#toolbar`, similar to Hancom WebGian's `style_bar`.

**`index.html` modification** — Add `#style-bar` below `#toolbar`:
```html
<div id="style-bar">
  <!-- Font selection -->
  <select id="font-name" title="Font">
    <option value="Malgun Gothic">Malgun Gothic</option>
    <option value="HamchoromDotum">HamchoromDotum</option>
    <option value="HamchoromBatang">HamchoromBatang</option>
    <option value="NanumGothic">NanumGothic</option>
    <option value="Batang">Batang</option>
    <option value="Dotum">Dotum</option>
    <option value="Gungseo">Gungseo</option>
  </select>
  <!-- Font size -->
  <input id="font-size" type="text" title="Font size" value="10" />
  <button id="btn-size-up" title="Increase size">▲</button>
  <button id="btn-size-down" title="Decrease size">▼</button>
  <span class="sep"></span>
  <!-- Character format toggles -->
  <button id="btn-bold" class="fmt-btn" title="Bold (Ctrl+B)"><b>B</b></button>
  <button id="btn-italic" class="fmt-btn" title="Italic (Ctrl+I)"><i>I</i></button>
  <button id="btn-underline" class="fmt-btn" title="Underline (Ctrl+U)"><u>U</u></button>
  <button id="btn-strike" class="fmt-btn" title="Strikethrough"><s>S</s></button>
  <span class="sep"></span>
  <!-- Text color -->
  <span class="color-wrap">
    <button id="btn-text-color" title="Text color">A<span id="color-bar"></span></button>
    <input id="text-color-picker" type="color" value="#000000" />
  </span>
  <span class="sep"></span>
  <!-- Paragraph alignment -->
  <button id="btn-align-left" class="fmt-btn" title="Align left">⫷</button>
  <button id="btn-align-center" class="fmt-btn" title="Center">⫿</button>
  <button id="btn-align-right" class="fmt-btn" title="Align right">⫸</button>
  <button id="btn-align-justify" class="fmt-btn" title="Justify">⫻</button>
</div>
```

**`style.css` additions** — borrowing webhwp style_bar pattern:
```css
#style-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 16px;
  background: #fff;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 13px;
}
#style-bar .sep { width:1px; height:20px; background:#ddd; margin:0 4px; }
#style-bar .fmt-btn {
  width: 28px; height: 28px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
#style-bar .fmt-btn:hover { background: #e8e8e8; }
#style-bar .fmt-btn.active { background: #d0d8e8; border-color: #a0b0c8; }
#font-name { width: 110px; height: 26px; font-size: 12px; }
#font-size { width: 40px; height: 26px; text-align: center; font-size: 12px; }
#btn-size-up, #btn-size-down { width:20px; height:13px; font-size:8px; padding:0; }
.color-wrap { position:relative; display:inline-flex; }
#text-color-picker { position:absolute; left:0; top:100%; opacity:0; width:0; height:0; }
#color-bar { display:block; width:16px; height:3px; background:#000; margin:1px auto 0; }
```

### Step 2: Toolbar TypeScript Module + EventBus Integration

**Goal**: Build DOM events → EventBus → InputHandler flow in `toolbar.ts` module.

**`rhwp-studio/src/ui/toolbar.ts` new file**:
```typescript
export class Toolbar {
  private fontName: HTMLSelectElement;
  private fontSize: HTMLInputElement;
  private btnBold: HTMLButtonElement;
  private btnItalic: HTMLButtonElement;
  private btnUnderline: HTMLButtonElement;
  private btnStrike: HTMLButtonElement;
  private btnTextColor: HTMLButtonElement;
  private colorPicker: HTMLInputElement;
  private colorBar: HTMLElement;

  constructor(
    private container: HTMLElement,
    private wasm: WasmBridge,
    private eventBus: EventBus,
  ) {
    // DOM element binding + event setup
    this.setupFormatButtons();   // B/I/U/S click → eventBus.emit('format-char', {...})
    this.setupFontControls();    // Font/size change → eventBus.emit('format-char', {...})
    this.setupColorPicker();     // Color → eventBus.emit('format-char', {textColor: '#FF0000'})

    // Receive formatting state on cursor move
    eventBus.on('cursor-format-changed', (props) => this.updateState(props));
  }

  /** Update button active state, font/size display */
  updateState(props: CharProperties): void { ... }

  /** Disable before document load / enable after */
  setEnabled(enabled: boolean): void { ... }
}
```

**`main.ts` modification** — Add Toolbar initialization:
```typescript
import { Toolbar } from '@/ui/toolbar';
// ...
const toolbar = new Toolbar(document.getElementById('style-bar')!, wasm, eventBus);
```

**EventBus event flow**:
```
[Toolbar button click] → eventBus.emit('format-char', props)
                       → InputHandler receives → executes applyCharFormat

[Cursor move/selection change] → InputHandler → eventBus.emit('cursor-format-changed', props)
                               → Toolbar receives → updates button state
```

### Step 3: WasmBridge Wrappers + ApplyCharFormatCommand

**Goal**: Connect WASM formatting APIs for TypeScript use and add Undo-supporting Command.

**`wasm-bridge.ts` additions** — 5 formatting API wrappers:
```typescript
getCharPropertiesAt(sec, para, offset): CharProperties
getCellCharPropertiesAt(sec, ppi, ci, cei, cpi, offset): CharProperties
applyCharFormat(sec, para, start, end, propsJson): string
applyCharFormatInCell(sec, ppi, ci, cei, cpi, start, end, propsJson): string
findOrCreateFontId(name): number
```

**`types.ts` additions** — CharProperties interface:
```typescript
export interface CharProperties {
  fontFamily?: string;
  fontSize?: number;       // HWPUNIT (1pt = 200)
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textColor?: string;      // '#RRGGBB'
  charShapeId?: number;
}
```

**`command.ts` addition** — `ApplyCharFormatCommand`:
```typescript
class ApplyCharFormatCommand implements EditCommand {
  type = 'applyCharFormat';
  // constructor: selection range (start, end), props to apply, list of previous formats (for undo)

  execute(wasm):
    // If multi-paragraph, call applyCharFormat for each paragraph
    // If single paragraph, call once
    // Before execution, preserve previous charShapeId per paragraph via getCharPropertiesAt

  undo(wasm):
    // Restore previous formatting per paragraph based on preserved charShapeId

  mergeWith: always null (format changes are not mergeable)
}
```

### Step 4: InputHandler Integration (Shortcuts + Format State Query)

**Goal**: Ctrl+B/I/U shortcuts, format application execution, cursor position format state query.

**`input-handler.ts` modifications**:

Add shortcuts to `handleCtrlKey()`:
```typescript
case 'b': e.preventDefault(); this.applyToggleFormat('bold'); break;
case 'i': e.preventDefault(); this.applyToggleFormat('italic'); break;
case 'u': e.preventDefault(); this.applyToggleFormat('underline'); break;
```

Format application methods:
```typescript
private applyCharFormat(props: Partial<CharProperties>): void {
  const sel = this.cursor.getSelectionOrdered();
  if (!sel) return;
  const cmd = new ApplyCharFormatCommand(sel.start, sel.end, props, this.wasm);
  this.executeCommand(cmd);
}

private applyToggleFormat(prop: 'bold' | 'italic' | 'underline'): void {
  if (!this.cursor.hasSelection()) return;
  const current = this.getCharPropertiesAtCursor();
  this.applyCharFormat({ [prop]: !current[prop] });
}
```

Cursor format state query:
```typescript
private getCharPropertiesAtCursor(): CharProperties {
  const pos = this.cursor.getPosition();
  if (isCell(pos))
    return this.wasm.getCellCharPropertiesAt(sec, ppi, ci, cei, cpi, offset);
  return this.wasm.getCharPropertiesAt(pos.sectionIndex, pos.paragraphIndex, pos.charOffset);
}
```

Add format state notification at end of `updateCaret()`:
```typescript
this.emitCursorFormatState();

private emitCursorFormatState(): void {
  if (!this.active) return;
  const props = this.getCharPropertiesAtCursor();
  this.eventBus.emit('cursor-format-changed', props);
}
```

EventBus reception (format change request from Toolbar):
```typescript
// Add to constructor:
this.eventBus.on('format-char', (props) => {
  if (this.cursor.hasSelection()) {
    this.applyCharFormat(props as CharProperties);
  }
});
```

Add `ApplyCharFormatCommand` to `executeCommand` signature.

### Step 5: Font List + Color Picker + Alignment

**Goal**: Dynamic font dropdown list, color picker completion, paragraph alignment integration.

**Fonts**:
- Default fonts: Malgun Gothic, HamchoromDotum, HamchoromBatang, NanumGothic, Batang, Dotum, Gungseo
- Font change: `findOrCreateFontId(name)` → `applyCharFormat({fontId: id})`

**Size**:
- `#font-size` input value change → convert pt to HWPUNIT (x 200) → `applyCharFormat({fontSize: N})`
- `#btn-size-up/down`: current size +/- 1pt

**Color**:
- `#btn-text-color` click → call `#text-color-picker.click()`
- Color selection → `applyCharFormat({textColor: '#RRGGBB'})`
- Update `#color-bar` background color to current color

**Alignment** (if WASM `applyParaFormat` exists):
- Left/center/right/justify buttons
- Disable if WASM API not available (future phase)

---

## Modified Files List

| File | Changes | Scale |
|------|---------|-------|
| `rhwp-studio/index.html` | `#style-bar` formatting toolbar HTML | +25 lines |
| `rhwp-studio/src/style.css` | style-bar styles | +60 lines |
| `rhwp-studio/src/ui/toolbar.ts` | Toolbar class (new) | +180 lines |
| `rhwp-studio/src/core/types.ts` | CharProperties interface | +15 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | 5 formatting API wrappers | +40 lines |
| `rhwp-studio/src/engine/command.ts` | ApplyCharFormatCommand | +80 lines |
| `rhwp-studio/src/engine/input-handler.ts` | Ctrl+B/I/U, format application, format state query | +60 lines |
| `rhwp-studio/src/main.ts` | Toolbar initialization | +5 lines |

## Verification

1. Vite build: `cd rhwp-studio && npm run build`
2. Runtime testing:
   - Load document → style-bar displayed, cursor position font/size reflected
   - Select text → Ctrl+B → bold applied → re-rendering confirmed
   - Ctrl+I (italic), Ctrl+U (underline) same confirmation
   - Toolbar B/I/U/S button click for same behavior
   - Font dropdown change → selection font changed
   - Size input/increment → selection size changed
   - Color change → selection text color changed
   - Cursor move → toolbar state auto-update (B active, font name displayed, etc.)
   - Ctrl+Z to undo format change confirmed
   - Same behavior confirmed for text inside cells
