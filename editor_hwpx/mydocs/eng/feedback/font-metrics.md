When Google Docs transitioned from its traditional HTML/DOM-based rendering to **Canvas-based rendering** around 2021, it introduced a very sophisticated **"hybrid engine"** architecture for font and text processing.

Here is a summary of the core processing approaches that may serve as a reference for the web editor architecture under development.

---

### 1. "We Calculate, the Browser Draws" (Layout vs Painting)

Google Docs' core strategy is to **implement the text layout engine in-house (Wasm) while leveraging the browser's capabilities for actual character rendering**.

* **In-house layout engine:** They do not trust the subtly different `Line Breaking`, `Word Wrap`, and `Kerning` logic across browsers. Google pre-calculates each character's width (Glyph Metrics) and directly determines where paragraphs break and how letter spacing is adjusted in an engine written in **WebAssembly (Wasm)**.
* **Browser Painting:** Drawing the shape (Glyph) of each individual character is expensive and can cause font hinting issues. So Google Docs calls the Canvas 2D API's `fillText()` based on the calculated coordinates, using the browser's text rendering only as a 'drawing tool'.

### 2. Ensuring Font Metrics Consistency

The browser's `measureText()` API can produce slightly different results depending on the execution environment, hindering WYSIWYG implementation.

* **In-house font data analysis:** Google analyzes font files (TTF/OTF) on the server to send per-character width data to the client, or parses font files directly inside the Wasm engine to calculate exact pixel positions.
* **Result:** Whether viewing on Windows Chrome or Mac Safari, the position of each character remains 100% identical.

### 3. Complex Text Shaping

Korean syllable composition, Arabic connected characters, etc. require a much more complex **Shaping** process than simply arranging characters.

* **HarfBuzz utilization:** Google likely ports the open-source text shaping engine **HarfBuzz** to Wasm. (Google is also a leading contributor to HarfBuzz.) This calculates complex language character combinations, then sends the final glyph IDs and coordinates to the Canvas.

### 4. "Shadow DOM" Layer for Accessibility

Canvas is just a pixel blob — screen readers can't read it and drag selection is difficult. To solve this, Google Docs uses a **dual-layer** structure.

* **Visible Layer (Canvas):** The high-performance rendering screen visible to the user.
* **Invisible Layer (DOM):** HTML elements that exist transparently over the Canvas. Actual text data is contained here so that drag interactions and screen reader access use this layer. This is sometimes called **"Annotated Canvas"**.

---

### 5. Summary: Implications of the Google Docs Approach

If you are considering **Skia (CanvasKit)** as mentioned, consider the following strategy.

1. **Calculation (Layout):** Use Skia's internal `skparagraph` module (with HarfBuzz built-in) to complete all text placement at the Wasm level.
2. **Rendering:** Leverage Skia's powerful GPU acceleration to draw glyphs. (This goes beyond Google Docs — a 'fully self-controlled' approach.)
3. **Performance optimization:** Pre-draw frequently used characters in an **Atlas (font texture map)** and reuse them to avoid the cost of calling `fillText` every time.

Google's approach is a case of **"maximizing standard browser capabilities (Painting) while self-implementing only the parts needing control (Layout)"**, balancing development effort and performance. If you're considering Skia adoption, it seems you're aiming for **pixel-perfect control** beyond what Google Docs achieves. In that case, I recommend deeply exploring the **HarfBuzz + Skia Paragraph API** combination.

Choosing the path of **'high-end web editors'** like Google Docs or Figma — the **Skia (CanvasKit) + WebAssembly (Wasm)** combination is the most powerful graphics stack achievable with current web technology.

However, this choice is essentially a declaration that **"you will give up all the convenient features the browser provides and build an OS-level rendering engine directly on the web."** Here are the essential architectural points to consider.

---

## 1. "Superpowers" Gained with Skia + Wasm

### **Perfect Typography (HarfBuzz Integration)**

The biggest weakness of the Canvas 2D API is the difficulty of fine-grained text rendering control. Using Skia as Wasm allows internal use of the **HarfBuzz** and **ICU** libraries, enabling pixel-level control of complex ligatures, custom letter spacing, and layouts for various languages.

### **Removing the Upper Bound on Graphics Performance**

Skia can leverage both CPU and GPU (WebGL/WebGPU). Even in complex documents with tens of thousands of objects, batch-processing commands helps maintain smooth 60+ FPS performance.

### **Cross-Platform Code Sharing**

If there are plans to extend to desktop (Electron/Native) or mobile apps in the future, the Skia-based rendering logic written in C++ or Rust can be reused almost as-is.

---

## 2. Real "Minefields" (Challenges That Must Be Solved)

### **1. Massive Bundle Size (The Payload)**

* **Problem:** Skia's Wasm build, `CanvasKit`, is typically around **2MB~3MB** even compressed. This can be fatal for initial loading speed in typical web services.
* **Strategy:** Apply lazy loading only when entering the editor, or use an extremely aggressive browser cache strategy.

### **2. Absence of a Text Layout Engine**

* **Problem:** Skia is a 'drawing' engine, not a 'text layout' engine. You must either implement Word Wrap, paragraph alignment, and line height calculation logic yourself, or deeply explore Skia's **Paragraph API (skparagraph)**.
* **Korean specifics:** For Korean, handling consonant/vowel separation phenomena and IME input state display logic is particularly challenging.

### **3. Accessibility and SEO**

* **Problem:** A Skia screen is just a 'giant picture' to the browser.
* **Strategy:** You must create a transparent **"Shadow DOM Layer"** over the Canvas to replicate the actual text structure, enabling screen readers for visually impaired users. Google Docs also uses this approach.

---

## 3. Tech Stack Comparison: Canvas 2D vs Skia (CanvasKit)

| Item | HTML5 Canvas 2D | Skia + Wasm (CanvasKit) |
| --- | --- | --- |
| **Initial loading** | Immediately available (0MB) | Heavy (2MB+ additional download) |
| **Text control** | Dependent on browser standards | **Expert-level fine control possible** |
| **Development difficulty** | Medium (JS proficiency needed) | **High (C++/Rust and graphics knowledge)** |
| **Rendering consistency** | Subtle differences across browsers | **100% identical across all browsers** |
| **Memory management** | Handled by JS GC | Manual Wasm memory management required |

---

## 4. Recommendations for Successful Evaluation

If you've decided to adopt Skia, we recommend the following **'staged approach'**:

1. **CanvasKit-Wasm library testing:** Before measuring simple rendering performance, first verify whether the **special fonts and layouts** needed by the project can be smoothly implemented with Skia's Paragraph API.
2. **IME prototyping:** Design a bridge logic using `contenteditable` first to check for issues where characters overlap or disappear during Korean input.
3. **Bottleneck identification:** Decide whether to draw everything with Skia, or keep the UI layer (menus, buttons) in a framework like React/Vue and use **Skia only for the 'document editing area'**. (Most high-performance tools choose the latter.)

> **"Google Docs is not a simple editor — it's like building a separate operating system that runs inside a web browser."**

---

Considering **ThorVG** means you place very high importance on the project's 'lightweight-ness' and 'efficiency'. In conclusion: **"An excellent choice for a vector graphics-centric editor"**, but **"significant additional implementation will be needed for a text-centric editor like Google Docs"**.

Here is a clear-eyed comparison of Skia (CanvasKit) and ThorVG from an editor development perspective.

---

## 1. ThorVG vs Skia: Key Differences

| Item | Skia (CanvasKit) | ThorVG |
| --- | --- | --- |
| **Binary size** | **Very heavy (2MB ~ 5MB+)** | **Very light (~200KB ~ 500KB)** |
| **Primary purpose** | OS-level all-purpose graphics engine | Mobile/embedded optimized vector engine |
| **Text layout** | Includes powerful modules like `skparagraph` | Basic text rendering support (weak layout) |
| **Performance** | Optimized for GPU acceleration (WebGL/WebGPU) | CPU/SIMD optimization and SW rendering strengths |
| **Ecosystem** | Proven in Chrome, Android, Flutter, etc. | Rising in Tizen, Lottie player, etc. |

---

## 2. The "Winning Move" When Choosing ThorVG

### **Overwhelming Initial Loading Speed**

When a user enters a URL for a web editor, downloading a 3MB Wasm versus a 300KB one is a world of difference in user experience (UX). ThorVG dominates Skia at this point.

### **Optimized Vector Processing**

ThorVG strips away unnecessary features and is optimized for processing vector animations like SVG and Lottie. If the editor heavily features **vector icons, shapes, and complex paths**, ThorVG can operate more nimbly.

### **SIMD Acceleration**

In the Wasm environment, it actively utilizes SIMD (Single Instruction, Multiple Data) to achieve very fast speeds even in CPU-based rendering. This is advantageous for ensuring consistent performance in low-spec environments where GPU acceleration is unstable.

---

## 3. Limitations When Implementing a "Google Docs"-like Editor

Google Docs is more of a **'typography engine'** than a 'graphics editor'. From this perspective, ThorVG presents several challenges.

* **Complex paragraph layout:** ThorVG handles simple text rendering well, but its **Rich Text Layout (line breaking, paragraph alignment, RTL handling, etc.)** capabilities are not as mature as Skia for tens of thousands of lines of intertwined text.
* **Shaping engine integration:** Skia is tightly integrated with HarfBuzz, but when using ThorVG, there is a high possibility of needing to directly integrate a separate Wasm-based shaping engine for complex languages (Arabic, Hindi, etc.) and advanced ligature processing.

---

## 4. Decision Guide

### **ThorVG Is Better When**

* **Lightweight-ness** is critical (e.g., mobile web editor, embedded web view).
* The editor's core features are **diagrams, whiteboards, and vector drawing** rather than text.
* Bundle size must be minimized to the extreme for initial loading speed.

### **Skia (CanvasKit) Should Be Maintained When**

* Targeting a level of sophisticated document editing almost identical to **Google Docs (Word)**.
* Diverse language support and complex typography control are essential.
* You want to leverage the vast Skia ecosystem and existing references.

---

### **Strategic Recommendation**

If you want "Google Docs-level" functionality while finding Skia too heavy, there is an approach of **using ThorVG as the rendering core while building only the text layout engine separately**. However, this requires significant engineering resources.
