# Task 32: Style Toolbar Implementation — Implementation Plan

## Implementation Steps (6 Steps)

## Step 1: Text Layout JSON Extension + Property Query API (Rust)
Add formatting properties to existing `getPageTextLayout` JSON and add position-based property query APIs (`getCharPropertiesAt`, `getParaPropertiesAt`).

## Step 2: CharShape/ParaShape Change Logic (Rust)
Implement logic to safely create/modify CharShape/ParaShape: `apply_char_shape_range()`, `find_or_create_char_shape()`, `CharShapeMods`/`ParaShapeMods` structs.

## Step 3: WASM Format Application API (Rust)
4 APIs: `applyCharFormat`, `applyParaFormat` + cell variants. Common `rebuild()` method for style re-resolution + re-composition + re-pagination.

## Step 4: Toolbar UI (HTML/CSS)
Formatting toolbar: font name/size, bold/italic/underline/strikethrough toggles, text color, highlight, paragraph alignment, line spacing, list bullets/numbering, indent/outdent.

## Step 5: Property Reflection (JavaScript)
FormatToolbar class: `updateFromCaret()` reflects current properties on caret/selection change. Handles mixed format indication for selections spanning different styles.

## Step 6: Format Commands (JavaScript)
Toggle commands (bold, italic, etc.), font/size dropdowns, color palette popup, paragraph alignment buttons. Keyboard shortcuts: Ctrl+B/I/U.
