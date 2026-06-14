# Task 88 Implementation Plan: Fix HWP File Corruption When Saving After Table Structure Changes

## Implementation Steps (3 steps)

### Step 1: Fix Cell::new_from_template()

**File**: `src/model/table.rs`

- Set `has_para_text: false` (empty cells don't need PARA_TEXT)
- Explicitly set `char_count: 1` (including HWP end marker)

**Before**:
```rust
char_count: tpl_para.char_count.min(1),
has_para_text: tpl_para.has_para_text,
```

**After**:
```rust
char_count: 1,
has_para_text: false,
```

### Step 2: Fix Paragraph::new_empty()

**File**: `src/model/paragraph.rs`

- `char_count: 1` (including end marker)
- Add default `LineSeg` (`tag: 0x00060000` HWP default flag)

**Before**:
```rust
pub fn new_empty() -> Self {
    Paragraph {
        char_count: 0,
        ..Default::default()
    }
}
```

**After**:
```rust
pub fn new_empty() -> Self {
    Paragraph {
        char_count: 1,
        line_segs: vec![LineSeg {
            text_start: 0,
            tag: 0x00060000,
            ..Default::default()
        }],
        ..Default::default()
    }
}
```

### Step 3: Write Verification Tests and Build

**File**: `src/wasm_api.rs`

- Add test `test_table_modification_empty_cell_serialization`
- After adding rows, save → re-parse → verify empty cell paragraphs:
  - No cc=0 violations
  - No unnecessary PARA_TEXT generation
  - PARA_LINE_SEG exists
- Update existing test `test_cell_new_empty` expected values (cc=0 → cc=1)
- All Rust tests pass confirmation
- WASM build + Vite build confirmation
