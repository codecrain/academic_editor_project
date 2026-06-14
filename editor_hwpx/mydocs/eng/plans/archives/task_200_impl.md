# Task 200 Implementation Plan: Paragraph Marks — Space (∨) and Tab (→) Display

## Step Configuration (3 Steps)

### Step 1: SVG Renderer Space/Tab Symbol Implementation

**src/renderer/svg.rs modifications:**
- When rendering TextRun with `show_paragraph_marks` true:
  - Overlay ∨ (U+2228) symbol in blue (#4A90D9) at each space (' ') position in text
  - Display → (U+2192) symbol at each tab ('\t') position in text
- Space symbol position: center of each space character's x-coordinate, near baseline
- Helper needed for measuring character widths (individual character position calculation)

**Verification:** cargo test + visual confirmation via SVG export

### Step 2: HTML/Canvas Renderer Space/Tab Symbol Implementation

**src/renderer/html.rs modifications:**
- Output space/tab symbol `<span>` using same logic as SVG

**src/renderer/web_canvas.rs modifications:**
- Draw space/tab symbols via Canvas fillText
- Calculate individual character x-coordinates then overlay symbols

**Verification:** WASM build + web editor confirmation

### Step 3: Test + WASM Build + Final Verification

- SVG export test for text containing spaces and tabs
- All cargo test passes
- Docker WASM build
- Confirm paragraph marks display in web editor
