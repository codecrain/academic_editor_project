# Task 122 Execution Plan — Paragraph Outline Number/Bullet Rendering Completion

## 1. Current Status Analysis

### Completed Items (Implemented in Task 121)
- **Parser**: Numbering, NumberingHead, HeadType(None/Outline/Number/Bullet) parsing complete (both HWP/HWPX)
- **Serialization**: HWPTAG_NUMBERING, ParaShape attr1 bit encoding complete
- **Numbered Paragraphs (Number)**: NumberingState counter, expand_numbering_format(), 14 format conversions, rendering complete
- **UI → WASM → Model pipeline complete**

### Broken Point (To be resolved in this task)
```
UI(dialog) → WASM API → ParaShape save  ✅ Fully operational
                                ↓
Renderer(layout.rs:4957) → Outline/Bullet → early return ❌ Numbers/symbols not displayed
```

### Unimplemented Items
| Item | Location | Status |
|------|----------|--------|
| Outline paragraph rendering | layout.rs:4957 | HeadType::Outline → early return (no number display) |
| Bullet rendering | layout.rs:4957 | HeadType::Bullet → early return (no symbol display) |
| Bullet data parsing | doc_info.rs | Only bullet_count preserved, HWPTAG_BULLET parsing not implemented |

## 2. Goals

1. **Outline paragraph rendering**: Settings from dialog (headType=Outline + paraLevel) immediately reflected in rendering
2. **Bullet rendering**: HWPTAG_BULLET parsing + headType=Bullet from dialog reflected in rendering
3. **Leverage existing pipeline**: UI → WASM → ParaShape save already works, extend renderer side only to complete end-to-end integration

## 3. Implementation Plan (4 Phases)

### Phase 1: Outline Paragraph Rendering
- Add HeadType::Outline handling to `apply_numbering()` (line 4956-4961) in layout.rs
- Outline uses same numbering_id + para_level basis as Number → reference Numbering → expand format string → insert text

### Phase 2: Bullet Parsing and Data Model
- Check HWPTAG_BULLET record structure from HWP spec
- Define Bullet struct (model/style.rs): bullet character, char_shape_id, etc.
- Add parse_bullet() to parser/doc_info.rs
- Add serialize_bullet() to serializer/doc_info.rs

### Phase 3: Bullet Rendering
- Add HeadType::Bullet handling in layout.rs
- Look up bullet character from Bullet struct → insert symbol before paragraph

### Phase 4: Testing and Verification
- Verify rendering results with sample HWP files containing outline/numbering/bullets
- Confirm 571 existing test regression
- Visual results via SVG export

## 4. Impact Scope

| File | Changes |
|------|---------|
| src/model/style.rs | Add Bullet struct |
| src/model/doc_info.rs | Add bullets field |
| src/parser/doc_info.rs | Add parse_bullet() |
| src/serializer/doc_info.rs | Add serialize_bullet() |
| src/renderer/layout.rs | Add Outline/Bullet rendering logic (core change) |
| src/renderer/style_resolver.rs | Add bullets to ResolvedStyleSet |

## 5. Risks

- Counter sharing/independence policy between Outline and Number may be unclear in HWP spec → verify by comparing with actual HWP program output
- Bullet characters that are Unicode special symbols may need font support verification
- Need to verify whether default Numbering assignment is needed when numbering_id is 0 with Outline/Bullet settings
