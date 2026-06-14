# Task 312 Implementation Plan: Line Spacing Shortcut Implementation

## 1. Feature
- Alt+Shift+A: Decrease line spacing by 10%
- Alt+Shift+Z: Increase line spacing by 10%
- When block selected, apply to all selected paragraphs

## 2. Existing Infrastructure
- `setLineSpacing(value)`: Already implemented (`input-handler.ts:2097`)
- `applyParaFormat()`: Already implemented (supports selection range, cell/header mode)
- `getParaProperties()`: Can query current line spacing
- Rust WASM: `applyParaFormat` → `parse_para_shape_mods` → `find_or_create_para_shape`

## 3. Implementation Plan

### 3.1 Step 1: Register Shortcuts
- Add Alt+Shift+A, Alt+Shift+Z to `shortcut-map.ts`

### 3.2 Step 2: Command Handlers
- Add `format:line-spacing-decrease`, `format:line-spacing-increase` to `format.ts`
- Query current line spacing → calculate +/-10% → call `setLineSpacing()`
- Clamp to min 50%, max 500%

### 3.3 Step 3: Testing
- Verify Alt+Shift+A/Z behavior in the web editor

## 4. Impact Scope
- `rhwp-studio/src/command/shortcut-map.ts`
- `rhwp-studio/src/command/commands/format.ts`
