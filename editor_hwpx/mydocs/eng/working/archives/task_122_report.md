# Task 122 Final Report — Paragraph Outline Numbering/Bullet Rendering Completion

## 1. Goal

1. **Outline paragraph rendering**: Section-level number reference via SectionDef's outline_numbering_id → rendering
2. **Bullet rendering**: HWPTAG_BULLET parsing → Bullet struct → rendering pipeline completion
3. **Diagnostic tool systematization**: `rhwp diag` subcommand for document structure diagnostic output
4. **Local build environment**: `cargo build`/`cargo test` local execution without Docker
5. **WASM number counter bug fix**: Per-page NumberingState reset + pre-advance
6. **Old Hangul jamo cluster handling**: Rendering/width calculation of initial+medial+final consonant sequences as single characters

## 2. Implementation Details (7 Steps + Additional Fixes)

### Step 1: Outline Match Branch Fix
- Processed HeadType::Outline through same path as Number in layout.rs

### Step 2: Bullet Parsing and Data Model
- Added `Bullet` struct (style.rs)
- Added `parse_bullet()` / `serialize_bullet()` (doc_info.rs)
- Added `bullets` field to `ResolvedStyleSet`

### Step 3: Bullet Rendering
- Unified rewrite of `apply_paragraph_numbering()` in layout.rs
- Handles 3 branches: None/Outline|Number/Bullet

### Step 4: Local Build Environment Setup
- Confirmed `cargo build`/`cargo test` local execution (Rust 1.93.1)
- Documented local build commands in CLAUDE.md (Docker for WASM only)

### Step 5: Diagnostic Command Systematization
- Added `rhwp diag <file.hwp>` subcommand
- Output: DocInfo summary, ParaShape head_type distribution, SectionDef outline numbers, paragraphs with non-None head_type

### Step 6: SectionDef Outline Number Parsing and Outline Rendering Completion
- Added `SectionDef.outline_numbering_id` field (document.rs)
- Parser: Stored outline_numbering_id from bytes 14-15 (body_text.rs)
- Serializer: Output outline_numbering_id (control.rs)
- Renderer: Falls back to section's outline_numbering_id when Outline paragraph's numbering_id=0

### Step 7: Integration Testing and Verification
- 571 tests passed, WASM build success

### Additional Fix: WASM Number Counter Bug
- **Problem**: WASM per-page independent rendering accumulated NumberingState showing "2." on page 2, "4." on page 3 (normal: 1., 2.)
- **Fix**: NumberingState reset in `build_page_tree()` followed by pre-advance for previous page FullParagraphs
- Extracted `resolve_numbering_id()` as public function (eliminated duplicate logic)
- Conditional Bullet text_distance handling (eliminated hard-coding)

### Additional Fix: U+FFFF Image Bullet SVG Error
- **Problem**: U+FFFF (image bullet marker) inserted into SVG causing XML parsing error
- **Fix**: Added `bullet_char == '\u{FFFF}'` guard, rewrote `escape_xml()` XML 1.0 valid character filtering

### Additional Fix: Old Hangul Jamo Cluster Handling
- **Character range expansion**: `is_hangul()`, `is_cjk_char()` — added Extended Jamo U+A960-A97F, U+D7B0-D7FF
- **Cluster grouping**: `split_into_clusters()` — groups initial+medial+final consonant sequences as one unit
- **Rendering**: SVG(`draw_text`) / Canvas(`draw_text`) cluster-unit `<text>`/`fillText` output
- **Width calculation**: `compute_char_positions()` — same position for characters within cluster, full-width for start character only
- **Text width estimation**: `estimate_text_width()` — cluster-aware for both WASM/native (for line-break calculation)
- **WASM type fix**: `hangul_hwp as f64 / 75.0` (fixed missing HWP→px conversion)

## 3. Key Findings

- **Outline paragraphs are managed at the section level**: ParaShape.numbering_id=0, references Numbering via numbering_id at SectionDef bytes 14-15
- **Hancom help confirms**: "Outline numbers can change shape per section. Within a section, all outline numbers have the same shape"
- **Old Hangul uses Unicode combining jamo**: Initial (1100-115F/A960-A97F) + Medial (1160-11A7/D7B0-D7C6) + Final (11A8-11FF/D7CB-D7FB) sequences synthesized by font

## 4. Changed Files Summary

| File | Changes |
|------|---------|
| src/renderer/layout.rs | Unified Outline/Bullet/Number rendering, jamo cluster recognition (compute_char_positions/estimate_text_width/split_into_clusters), resolve_numbering_id extraction |
| src/renderer/svg.rs | escape_xml() XML 1.0 filtering rewrite, cluster-unit draw_text |
| src/renderer/web_canvas.rs | Cluster-unit draw_text |
| src/renderer/composer.rs | is_hangul() extended jamo range added |
| src/model/style.rs | Bullet struct added |
| src/model/document.rs | DocInfo.bullets, SectionDef.outline_numbering_id added |
| src/parser/doc_info.rs | parse_bullet() + HWPTAG_BULLET parsing |
| src/parser/body_text.rs | SectionDef.outline_numbering_id storage |
| src/serializer/doc_info.rs | serialize_bullet() + HWPTAG_BULLET serialization |
| src/serializer/control.rs | SectionDef.outline_numbering_id serialization |
| src/renderer/style_resolver.rs | Added bullets to ResolvedStyleSet |
| src/wasm_api.rs | build_page_tree number reset/pre-advance, outline_numbering_id passing |
| src/main.rs | diag subcommand added |
| CLAUDE.md | Local build commands documented |

## 5. Verification Results

| Item | Result |
|------|--------|
| Existing 571 test regression | Passed |
| WASM build | Success |
| Outline rendering | Success (all 7 levels) |
| Bullet parsing/rendering | Success |
| WASM number counter | Success (correct numbers per page) |
| Old Hangul jamo clusters | Success (both SVG/WASM) |
| diag command | Success |
| Serialization round-trip | SectionDef outline_numbering_id preserved |
| SVG XML validity | Success (invalid characters like U+FFFF removed) |

## 6. Unresolved/Future Improvements

- Bullet char `U+FFFF` (image bullet): Currently only character rendering supported; image bullet rendering needs separate task
- Outline counter vs Number counter independence/sharing policy: Currently uses same NumberingState; needs comparison verification with actual HWP behavior
- PUA Old Hangul (E000-F8FF): Currently unconverted. Separate task needed for Unicode jamo conversion per KS X 1026-1
