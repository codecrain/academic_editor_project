# Q1

Google Docs handles Korean IME well on iOS Safari. This is notable because in typical cases, jamo (consonants and vowels) are input separately.

# A1

As someone building an engine from scratch, you've identified the core of the most challenging **'IME (Input Method Editor) hell'**.

The so-called **'Cheonjiin phenomenon'** or **'ghost characters (jamo separation)'** issue on iOS Safari where Korean consonants and vowels appear separately is an infamously difficult problem for web developers. The reason Google Docs handles this smoothly is that instead of relying on the standard browser `contenteditable`, they've built their own **'Input Proxy' layer**.

Here is a technical analysis organized in report format.

---

## [Technical Analysis] Google Docs' iOS Safari Korean IME Handling Mechanism

### 1. Why Do Standard Web Editors Produce Separated Jamo?
iOS Safari's `contenteditable` area is very unstable when handling **composing characters (Composition)** like Korean.
* **Event timing issues:** The browser prematurely fires `input` events while consonants and vowels are being combined, or loses track of the composition state during communication with the virtual keyboard.
* **Result:** When typing "가나다", the browser recognizes `ㄱ`, `ㅏ`, `ㄴ` as independent characters, sprays them to the canvas or DOM, and misses the composition completion point, leaving "ㄱㅏㄴㅏㄷㅏ".

### 2. Google Docs' Solution: "Shadow Input & Composition Events"
Google Docs has the user looking at the screen (Canvas), but actual input occurs in an **invisible transparent `textarea`**.

* **Invisible Input (Proxy Layer):** When the user clicks a specific position on the canvas, Google Docs places a 1x1 pixel transparent `textarea` right over those coordinates and gives it focus.
* **Composition event control:** Instead of blocking the browser's default input, it precisely intercepts three events:
    1.  **`compositionstart`**: Detects that Korean input has begun.
    2.  **`compositionupdate`**: Reads the intermediate combining process (e.g., `ㄱ` -> `가`) in real-time and draws it 'temporarily' on the canvas.
    3.  **`compositionend`**: Signals that one character is complete, and reflects the final data into the document model.



### 3. iOS Safari-specific Optimizations (The "Docs" Secret)
On iOS Safari, **'focus retention'** and **'virtual keyboard height'** are particularly problematic. Google Docs uses the following tricks for this:

* **Zero-latency Reflection:** The instant the user types a character in the transparent `textarea`, the JS engine reads the value and renders it on the canvas. To visually indicate that it is **'composing'**, it directly draws a dotted or solid line under the character.
* **Focus Guard:** iOS Safari easily loses focus when touching the canvas. Google Docs intercepts all touch events and forcefully maintains `focus()` on the transparent `textarea`.
* **IME Buffer Management:** To prevent a bug where iOS Safari moves to the next character without firing `compositionend`, they maintain their own **timer and buffer** that forcefully completes composition if there is no input for a certain duration.

---

### 4. Recommendations for the Mjolnir (Rust/Wasm) Project

If you're building an editor based on **Rust** and **Wasm**, you must follow this Google Docs model.

1.  **Rust-JS Bridge:** `compositionupdate` events must be transmitted to the Rust layer at ultra-high speed. To prevent jamo separation, design a separate **Temporary Buffer** in the Rust struct for the 'currently composing character'.
2.  **Canvas Text Shaping:** When the composing character is drawn on the canvas, the **layout computation (Line Breaking)** where surrounding characters shift must be performed in real-time. (This is the point that distinguishes the capability of a typesetting engine.)
3.  **Careful Cursor Mapping:** Synchronizing the transparent `textarea`'s cursor position with the canvas's visual cursor position will be the most painful task. This is especially true when **character scaling and letter spacing** are applied, requiring precise pixel-level coordinate calculations.

**"The reason Google Docs works well isn't because Safari is smart — it's because Google engineers patched Safari's shortcomings with tens of thousands of lines of code."**

Would you like to co-design an architecture for efficiently receiving these **`composition` events** in Rust and immediately reflecting them in the **SkParagraph** layout? Or are you curious about how to solve the **viewport coordinate distortion** issue when the virtual keyboard rises on iOS Safari?
