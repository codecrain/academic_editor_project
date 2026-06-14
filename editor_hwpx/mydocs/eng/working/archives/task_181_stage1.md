# Task 181 — Step 1 Completion Report: Model + Binary/HWPX Parser

## Goal
Extract equation script strings from both HWP/HWPX and store in `Control::Equation`

## Completed Items

### 1. Model Definition (`src/model/control.rs`)
- Added `Equation` struct (common, script, font_size, color, baseline, font_name, version_info, raw_ctrl_data)
- Added `Control::Equation(Box<Equation>)` variant

### 2. Binary HWP Parser (`src/parser/control.rs`)
- Added `CTRL_EQUATION` (eqed) branch
- Implemented `parse_equation_control()`: CommonObjAttr + HWPTAG_EQEDIT child record parsing
- HWPTAG_EQEDIT layout: attr(u32) → script(HWP string) → font_size(u32) → color(u32) → baseline(i16) → version_info(HWP string) → font_name(HWP string)

### 3. HWPX Parser (`src/parser/hwpx/section.rs`)
- Fully rewrote existing `parse_equation()` to return `Control::Equation`
- Referenced XSD schema (paralist.xsd EquationType) and OWPML tables 207-208
- Parsed equation-specific attributes: version, baseLine, textColor, baseUnit, font
- Extracted equation script text from `<hp:script>` child element

### 4. Serialization
- `serialize_equation_control()` added (CTRL_HEADER + HWPTAG_EQEDIT)
- Equation char code mapping (`0x000B`, `CTRL_EQUATION`)

## Verification
- cargo test: **615 passed** (0 failed)
- Binary parsing: 3 equations from `samples/eq-01.hwp` all parsed correctly
