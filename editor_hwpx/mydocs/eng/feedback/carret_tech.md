**Caret/Cursor handling** may seem simple on the surface, but it is the most sophisticated point that proves the logical integrity of a typesetting engine. This is especially true for a DTP-level word processor where character scaling (width ratio) and letter spacing change in real time, rather than a simple text editor.

Considering the technological maturity of 2026 and Rust/AI capabilities, we propose a design strategy to solve this problem from the perspectives of **"Inverse Mapping"** and **"Virtual Caret Entity"**.

---

## 1. Hit Testing via Spatial Indexing (Quad-tree/R-tree)

When a user clicks a specific point on the screen or types on the keyboard, this is the process of finding "which character's front or back does this coordinate logically correspond to?"

* **Problem:** Characters with scaling and letter spacing applied do not have fixed widths.
* **Solution:** When the layout engine finalizes the position of every glyph, store the **Bounding Box** information of each character in a spatial indexing tree (e.g., the `rstar` crate).
* **Effect:** On mouse click, the character index at that position can be found at $O(\log n)$ speed, which combined with the Rust WASM approach delivers a very responsive experience.

## 2. Virtual Caret and Rendering Synchronization

The caret must be managed as an **independent entity** on the scene graph, not as a system cursor.

* **Logical Positioning:** The caret has a logical address such as "after the Nth character of the Mth paragraph."
* **Visual Transformation:** The layout engine calculates the **final baseline coordinates** with the character's scaling (Scale X) and letter spacing (Offset) applied, then passes them to the caret entity's global transform matrix.
* **Result:** When a character stretches horizontally (scaling), the caret moves precisely to match, fitting exactly between characters even on sub-pixel typesetting results.

## 3. Composition-aware Reflow During IME Input

During Korean input, the width of a character changes in real time as initial/medial/final consonants are combined.

* **State Separation:** Before fully inserting the composing character into the document structure (DOM), pre-layout it in the layout engine's **temporary buffer (Sandbox)**.
* **Real-time Feedback:** A variable flow algorithm designed with AI predicts in advance whether the composing character will cause line wrapping, implementing 'Live Reflow' where the entire paragraph naturally shifts as the user types.

---

## 4. 2026-era Design: Data-Oriented Caret System

Leveraging Rust's parallelism, the 'Hit Test' for finding the caret position can be performed in parallel across thousands of paragraphs on the CPU without GPU acceleration.

| Stage | Processing | Technology |
| --- | --- | --- |
| **Input Event** | Receive keyboard/mouse events | SDL2 / Web Event |
| **State Update** | Update logical cursor position (Cursor Index) | Rust Atomic/Immutable State |
| **Layout Sync** | Calculate physical coordinates for the changed index | Knuth-Plass based Solver |
| **Scene Commit** | Update caret position in ThorVG scene graph | ThorVG `Matrix` transform |
| **Draw** | Final rendering | ThorVG + SDL2/WASM |

---
