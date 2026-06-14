# Task 229: Field Control Parsing and Basic Rendering

## Current Status Analysis

### Already Implemented
- **Model**: `Field` struct (`field_type`, `command`), `FieldType` enum (including ClickHere)
- **Tag constants**: `CHAR_FIELD_BEGIN(0x03)`, `CHAR_FIELD_END(0x04)` defined
- **HWPX parser**: `fieldBegin` tag Field type/name parsing implemented
- **CTRL_DATA preservation**: Each control's CTRL_DATA binary preserved in `ctrl_data_records` for round-trip

### Unimplemented
1. **Binary parser**: Field ctrl_id (`%clk`, `%hlk`, etc.) → processed as `Control::Unknown`
2. **Field data parsing**: Properties (4B), extra properties (1B), command (variable), id (4B) not parsed
3. **Field text processing**: Text between 0x03/0x04 rendered as normal text but no field range tracking
4. **Rendering**: No field visual markers (click-here guide text style, field boundaries, etc.)
5. **Serialization**: `Control::Field` → serialized with ctrl_id=0 (incomplete)

## Implementation Plan

### Step 1: Field Control Binary Parsing
### Step 2: Field Text Range Tracking and Rendering
### Step 3: Serialization and Testing
