# Task 196 Implementation Plan — Web Editor Text Flow Processing

## Step 1: E2E Test Infrastructure + Basic Operation Verification

### Goal
- Build Puppeteer-based E2E test framework
- WASM build → Vite dev server → headless Chrome automation pipeline
- Verify blank document load and basic text input

### Implementation
- Create `rhwp-studio/e2e/` directory
- `e2e/helpers.ts`: Puppeteer connection, page load, editor area focus utilities
- `e2e/text-flow.test.ts`: Basic test cases (load blank document, click editor, input text, verify rendering)
- Add `"e2e"` script to `package.json`

## Step 2: Line Breaking and Line Spacing Verification

### Goal
- Confirm auto line breaking with long text input
- Verify correct line spacing application

### Test Scenarios
- Input text exceeding one line → verify auto line breaking
- Verify two-line rendering after break (check line count via WASM API)
- Verify line spacing values reflected in layout

## Step 3: Enter (Paragraph Split) and Backspace (Paragraph Merge) Verification

### Goal
- Confirm Enter key correctly splits paragraphs
- Confirm Backspace at paragraph start merges with previous paragraph

### Test Scenarios
- Text input → Enter → more text → verify 2 paragraphs
- Backspace at second paragraph start → verify merge
- Verify cursor position correctly updated

## Step 4: Page Overflow Verification and Bug Fixes

### Goal
- Confirm page 2 creation when enough text/Enter fills page 1
- Confirm scroll area updates with page count changes
- Fix any discovered bugs

### Test Scenarios
- Repeated Enter to cause page overflow
- Verify page 2 creation (`wasm.pageCount` change)
- Scroll to verify page 2 content
- Backspace to return to 1 page
