# Task 13: Implementation Plan — Format > Paragraph > Numbering: Start Number/Paragraph Number

## Implementation Steps (4 Steps)

---

### Step 1: Model Definition

**Target Files**: `src/model/style.rs`, `src/model/document.rs`

**Work Contents**:

1. Add `Numbering` struct
   - `heads: [NumberingHead; 7]` — level-specific (1~7) paragraph head info
   - `level_formats: [String; 7]` — level-specific number format strings
   - `start_number: u16` — starting number
   - `level_start_numbers: [u32; 7]` — level-specific start numbers

2. Add `NumberingHead` struct
   - `alignment: u8` — alignment (0=left, 1=center, 2=right)
   - `width_adjust: i16` — width correction value
   - `text_distance: i16` — distance from body text
   - `char_shape_id: u32` — character shape ID reference

3. Add fields to `ParaShape`
   - `head_type: HeadType` — paragraph head type (none/outline/number/bullet)
   - `para_level: u8` — paragraph level (0~6 → levels 1~7)

4. Add field to `DocInfo`
   - `numberings: Vec<Numbering>` — numbering definition list

---

### Step 2: Parser Implementation

**Target File**: `src/parser/doc_info.rs`

**Work Contents**:

1. Implement `parse_numbering()` function
   - Parse level-specific (1~7) paragraph head info (12 bytes each)
   - Parse level-specific number format strings (variable length)
   - Parse start number and level-specific start numbers

2. Add `HWPTAG_NUMBERING` handler to DocInfo parsing loop

3. Extract `attr1` bit fields in `parse_para_shape()`
   - bits 23~24: paragraph head type
   - bits 25~27: paragraph level

---

### Step 3: Rendering Implementation

**Target File**: `src/renderer/layout.rs`

**Work Contents**:

1. Paragraph number counter management
   - `NumberingCounter` struct: track current number per level (1~7)
   - Same level consecutive → increment number
   - Upper level transition → reset lower levels
   - Non-numbered paragraph → reset counter

2. Number string generation
   - Process `^n`, `^N` control codes in number format strings
   - Use `format_number()` function for format-specific conversion

3. Insert number text during paragraph rendering
   - Detect paragraphs where `head_type == HeadType::Number`
   - Reference numbering definition via `numbering_id`
   - Insert generated number string before the first line of the paragraph

---

### Step 4: Testing and Verification

**Work Contents**:

1. Write unit tests
   - `Numbering` parsing test
   - `ParaShape` attribute extraction test
   - Number counter increment/reset test
   - Number format string processing test

2. Integration tests
   - SVG output with sample HWP files containing paragraph numbers
   - Visual verification of correct number rendering

3. Confirm existing tests pass
