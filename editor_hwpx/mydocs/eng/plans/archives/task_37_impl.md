# Task 37: Clipboard Copy and Paste - Implementation Plan

## Step 1: Internal Clipboard Infrastructure (WASM) — P0
copy_selection(), copy_control(), paste_internal() APIs. Style ID remapping, BinData merging.

## Step 2: Plain Text Paste (JS) — P0
Ctrl+V/X handlers, handlePaste() with format priority.

## Step 3: Rich Text Copy — HTML Generation — P1
export_selection_html(), ClipboardItem with HTML + plain text.

## Step 4: HTML Paste Parsing — P1
paste_html(): HTML → Document IR with style mapping.
