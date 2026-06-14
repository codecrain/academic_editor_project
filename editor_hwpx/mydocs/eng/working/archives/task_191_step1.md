# Task 191 Step 1 Completion Report: Dedicated CSS + Dialog Structure Overhaul

## Completed Items

### 1. Dedicated CSS File
- `rhwp-studio/src/styles/table-cell-props.css` — new
- CSS prefix: `tcp-` (table-cell-props)

### 2. Inline Style to CSS Class Conversion
- Tab panel padding → `tcp-tab-content` class
- Size note → `tcp-note` class
- Border/background preview → `tcp-bg-preview` class

### 3. Context-Based Tab Branching
- `mode: 'table' | 'cell'` parameter added to constructor (default: `'cell'`)
- `mode === 'table'` → 6 tabs (Basic/Margins-Caption/Border/Background/Table/Cell)
- `mode === 'cell'` → 4 tabs (Basic/Margins-Caption/Table/Cell) — Border/Background tabs excluded
- Default active tab: always last tab (Cell)

## Verification
- TypeScript compilation: No errors
- Rust tests: 657 all passed
