# Task 47 Execution Plan

## Task: WASM Core Extension Phase 1 (7 Basic Editing APIs)

## Goal

Add **7 editing helper APIs** defined in Design Document Section 9.2 Phase 1 to the Rust WASM core (`wasm_api.rs`). Do not change existing API signatures/behavior; only add methods.

## APIs to Add

| No | API | Signature | Purpose |
|----|-----|-----------|---------|
| 1 | **getSectionCount** | `() -> u32` | Section count |
| 2 | **getParagraphCount** | `(sec) -> u32` | Paragraph count in section |
| 3 | **getParagraphLength** | `(sec, para) -> u32` | Paragraph character count (cursor boundary) |
| 4 | **getTextRange** | `(sec, para, offset, count) -> String` | Extract text portion (for Undo) |
| 5 | **getCellParagraphCount** | `(sec, para, ctrl, cell) -> u32` | Paragraph count in cell |
| 6 | **getCellParagraphLength** | `(sec, para, ctrl, cell, cellPara) -> u32` | Cell paragraph length |
| 7 | **getTextInCell** | `(sec, para, ctrl, cell, cellPara, offset, count) -> String` | Extract text in cell |

## Implementation Pattern

Follows Design Document Section 9.4 API Design Principles:

- **WASM + Native dual implementation**: `fn get_xxx() -> Result<String, JsValue>` + `fn get_xxx_native() -> Result<String, HwpError>`
- **JSON serialization**: Return values are JSON strings
- **Char index basis**: All position parameters are Rust char indices
- **No existing code changes**: Only add methods to `wasm_api.rs`

## Execution Phases

### Phase 1: Document/Section/Paragraph Query APIs (4)

### Phase 2: Cell Query APIs (3)

### Phase 3: WASM Build and Test Verification
