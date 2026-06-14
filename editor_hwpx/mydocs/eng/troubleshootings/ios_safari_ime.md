# iOS Safari/Chrome Korean IME Composition Issue

> 2026-04-01 | Discovered during Task #22 Mobile Support

---

## Symptoms

When typing Korean on iOS Safari/Chrome, jamo (consonants/vowels) are entered separately.
- Expected: "가나다"
- Actual: "ㄱㅏㄴㅏㄷㅏ" or "ㄱ가간가나낟나다"

Desktop (Windows/Mac Chrome) works correctly.

## Cause

### 1. iOS WebKit Does Not Fire Composition Events on Hidden Textareas

```
Desktop: compositionstart -> compositionupdate -> compositionend (normal)
iOS:     No composition events, only input(insertText) fired
```

- When a `<textarea>` is hidden with `opacity:0`, `width:1px`, `position:fixed;left:-9999px`, etc.,
  iOS WebKit considers the element as "virtual keyboard not needed" and disables IME composition
- `compositionstart`, `compositionupdate`, `compositionend` events are simply never fired
- Korean jamo are delivered as individual `insertText` events, preventing composition

### 2. iOS's Actual Korean Composition Pattern

iOS handles Korean composition in `<div contentEditable>` using **deleteContentBackward + insertText pairs**:

```
Events fired by iOS when typing "가나다":
  insertText "ㄱ"      -> value="ㄱ"
  deleteBackward       -> value=""
  insertText "가"      -> value="가"
  deleteBackward       -> value=""
  insertText "간"      -> value="간"
  deleteBackward       -> value=""
  insertText "가나"    -> value="가나"    <- "간"->"가"+"나" decomposition
  deleteBackward       -> value="가"
  insertText "낟"      -> value="가낟"
  deleteBackward       -> value="가"
  insertText "나다"    -> value="가나다"  <- "낟"->"나"+"다" decomposition
```

Key insight: iOS **manages the div's textContent entirely on its own**.
We just need to reflect the div's value into the document on each input event.

## Solution

### Step 1: Use contentEditable div on iOS

A `<div contentEditable>` must be used instead of `<textarea>` for IME to work on iOS.

```typescript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (isIOS) {
  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.style.cssText =
    'position:absolute;left:0;top:0;width:2em;height:1.5em;' +
    'color:transparent;background:transparent;caret-color:transparent;' +
    'border:none;outline:none;overflow:hidden;white-space:nowrap;' +
    'z-index:10;font-size:16px;padding:0;margin:0;';
  // value proxy for textarea interface compatibility
  Object.defineProperty(div, 'value', {
    get() { return div.textContent || ''; },
    set(v: string) { div.textContent = v; },
  });
  this.textarea = div as unknown as HTMLTextAreaElement;
} else {
  // Desktop: keep existing hidden textarea
  this.textarea = document.createElement('textarea');
  this.textarea.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
}
```

### Step 2: iOS Fallback Composition Handling (Core)

Since `isComposing` is always `false` on iOS, we use an **anchor + length** approach to replace previous insertions:

```typescript
if (this._isIOS && !this.isComposing) {
  // Set anchor (on first input)
  if (!this._iosAnchor) {
    this._iosAnchor = this.cursor.getPosition();
    this._iosLength = 0;
  }

  // Delete previous insertion
  if (this._iosLength > 0) {
    this.deleteTextAt(this._iosAnchor, this._iosLength);
  }

  // Re-insert the entire current value
  const text = this.textarea.value;
  if (text) {
    this.insertTextAtRaw(this._iosAnchor, text);
    this._iosLength = text.length;
  } else {
    this._iosLength = 0;
  }

  // Render debounce (important!)
  clearTimeout(this._iosInputTimer);
  this._iosInputTimer = setTimeout(() => {
    this.afterEdit();
    this.textarea.focus();
  }, 100);
  return;
}
```

### Step 3: afterEdit() Debounce (Most Important)

**`afterEdit()` must not be called on every input.** `afterEdit()` fires a `document-changed` event that re-renders the Canvas, which disrupts the contentEditable div's focus/textContent.

iOS fires `deleteBackward + insertText` within 10ms, so any rendering in between breaks the div state.

```
Wrong approach:
  input("ㄱ") -> afterEdit() -> Canvas re-render -> div disrupted
  input("가") -> afterEdit() -> Canvas re-render -> div disrupted
  -> Result: "ㄱ가"

Correct approach (100ms debounce):
  input("ㄱ") -> update document only (no rendering)
  input("가") -> update document only (no rendering)
  ... 100ms later ...
  afterEdit() -> 1 Canvas render
  -> Result: "가"
```

## Trial and Error Log

| Attempt | Result | Reason |
|---------|--------|--------|
| textarea left:-9999px -> left:0 | Failed | iOS still doesn't fire composition |
| textarea opacity:0 -> color:transparent | Failed | textarea itself doesn't support iOS IME |
| contentEditable div | Partial success | Composition fires but value gets disrupted |
| Reset div value on each input | Failed | iOS treats reset as new composition |
| Don't touch div value | Partial success | afterEdit() disrupts the div |
| **afterEdit() debounce 100ms** | **Success** | Doesn't interfere with iOS's rapid event sequence |

## Notes

- Google Docs uses the same "Shadow Input + debounce" pattern
- iOS Safari is more stable with `<div contentEditable>` than `<textarea>` for IME
- `font-size:16px` is required -- below this, iOS auto-zooms the page
- Set `inputmode="text"` to ensure the Korean keyboard is shown
- After 1 second of no input, reset div + anchor (next input starts at a new position)
