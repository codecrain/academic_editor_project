# Hancom Web Document Authoring System Feature Definition Document

## Document Info

| Item | Content |
|------|---------|
| Document Name | Hancom Web Document Authoring System Feature Definition |
| Task | #43 |
| Created | 2026-02-12 |
| Version | v3.0 (Final) |

---

## 1. Overview and Migration Strategy

### 1.1 Goal
Minimize **changes to existing source code** when public institutions using Hancom's web document authoring system transition to rhwp.

### 1.2 Migration Principles
| Principle | Description |
|-----------|-------------|
| Identical web editor UI | Provide identical editor UI/UX as Hancom |
| Identical developer API | HwpCtrl-compatible API (same method names, parameters, behavior) |

### 1.3 Compatibility Layer Architecture
```
┌─────────────────────────────────────────────────────┐
│  Existing public institution JavaScript code (no changes)  │
│  HwpCtrl.Open(), PutFieldText(), SaveAs() etc.             │
├─────────────────────────────────────────────────────┤
│  rhwp compatibility layer (rhwp.js)                         │
│  HwpCtrl API → rhwp WASM API conversion                    │
│  ┌───────────┬───────────┬───────────┬────────────┐        │
│  │ Grade A   │ Grade B   │ Grade C   │ Grade X    │        │
│  │ Direct    │ Transform │ New impl  │ Empty func │        │
│  └───────────┴───────────┴───────────┴────────────┘        │
├─────────────────────────────────────────────────────┤
│  rhwp WASM Core (Rust → WebAssembly)                        │
│  Document parsing, rendering, editing, serialization        │
└─────────────────────────────────────────────────────┘
```

### 1.5 Compatibility Grade Definitions

| Grade | Meaning | Migration Impact |
|-------|---------|-----------------|
| A (Direct Mapping) | Equivalent feature exists in rhwp, wrapper only | No source changes needed |
| B (Transform Mapping) | Similar feature in rhwp, parameter conversion needed | No source changes needed (wrapper handles conversion) |
| C (New Implementation) | No equivalent feature in rhwp, internal implementation needed | No source changes needed (after implementation) |
| D (Architecture Difference) | Server dependency or structural difference | Some source changes needed |
| X (Unnecessary) | UI-only, server-only, etc. | Empty function/stub handling |

---

## 2. HwpCtrl API Complete Classification

### 2.1 API Overall Scale Summary

| Component | Scale | Description |
|-----------|-------|-------------|
| HwpCtrl Properties | 18 | Document state/property query and setting |
| HwpCtrl Methods | 67 | Core document control methods |
| Action IDs | 312 | Unit actions executed via Run() |
| ParameterSet Types | 50 | Structured data passed to actions/methods |

### 2.2 HwpCtrl Properties (18)
Includes: CellShape, CharShape, CurFieldState, CurSelectedCtrl, EditMode, EngineProperties, HeadCtrl, IsEmpty, IsModified, LastCtrl, PageCount, ParaShape, ParentCtrl, ReadOnlyMode, ScrollPosInfo, SelectionMode, Version, ViewProperties

### 2.3 HwpCtrl Methods (67)
Categories: Document Management (8), Text I/O (8), Cursor/Position (9), Selection/Block (4), Field Management (10), Image/Object Insertion (4), Table Query (2), Page Image (2), Action System (5), Edit Control (2), UI Control (7), Utility (6), Spell Check (1)

### 2.4 Action Table (312 actions, 15 categories)
Categories: Cursor Movement (51), Selection Extension (36), Text Editing (29), Character Format (33), Paragraph Format (16), Page/Section (22), Table (32), Drawing Objects (31), Find/Replace (5), View (10), File (7), Insert Dialog (17), Format Dialog (12), Edit Command (6), Miscellaneous (5)

---

## 3. rhwp vs HwpCtrl Compatibility Mapping

Grade A (Direct Mapping): ~15 APIs including document loading, page count, rendering, text insertion
Grade B (Transform Mapping): ~20 APIs including format query/application, field operations
Grade C (New Implementation Needed): ~30+ APIs including Undo/Redo, full cursor model, action system, ParameterSet system
Grade X (Stub): ~10 APIs including UI control, spell check, server-dependent features

---

## 4. Unimplemented Feature Priority (Migration Perspective)

| Grade | Criteria | Examples |
|-------|----------|----------|
| P0 (Required) | Core to public institution authoring | Field management (PutFieldText/GetFieldText), Undo/Redo, Find/Replace |
| P1 (Important) | Advanced document editing | Image insertion, headers/footers, page numbers, distribution documents |
| P2 (Optional) | Additional features | Drawing tools, spell check, character map |
| X (Stub) | Can be handled with empty functions | UI control, server-only features |

---

## 5. Migration Scenarios

| Scenario | Required APIs | Frequency |
|----------|--------------|-----------|
| Auto-generate draft documents | Open, PutFieldText, SaveAs, CreateField, FieldExist | Most frequent |
| Document viewer | Open, CreatePageImage, PageCount | Simple |
| Form editing | Above + CharShape, ParagraphShape, TableCreate | Medium |
| Full editor | All APIs | Rare |

---

## 6. rhwp Unique Strengths (Features Not in Hancom)

- Open source (MIT license)
- No server dependency (fully client-side)
- Cross-platform (any browser with WASM support)
- SVG export capability
- Distribution document → editable conversion
- Extensible architecture

---

## 7. Compatibility Layer Implementation Roadmap

Phase 1: Core Field API + Document Open/Save (P0)
Phase 2: Cursor Model + Selection + Undo/Redo (P0)
Phase 3: Format Application + Table Operations (P1)
Phase 4: Action System + ParameterSet Framework (P1)
Phase 5: Advanced Features (P2)

Note: This is a condensed translation. The original Korean document contains detailed API tables with 300+ entries. HWP-specific terms (HwpCtrl, ParameterSet, Action, CtrlCode, HWPUNIT, CharShape, ParaShape, BorderFill, etc.) are preserved as-is.
