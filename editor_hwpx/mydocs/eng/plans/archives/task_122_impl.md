# Task 122 Implementation Plan (Revised) — Paragraph Outline Number/Bullet Rendering Completion

## Overall Implementation Steps (7 Steps)

**Steps 1~3**: Complete (Bullet parsing/rendering, Outline match branching)
**Steps 4~7**: Additional (local build, diagnostic tools, section outline numbering, integration verification)

---

## Step 1: Outline Paragraph Match Branch Fix ✅ Complete

Process Outline through same path as Number in layout.rs match branch.
Note: numbering_id=0 cases cause early return, actual rendering completed in Step 6

---

## Step 2: Bullet Parsing and Data Model ✅ Complete

Bullet struct, parse_bullet(), serialize_bullet(), ResolvedStyleSet.bullets added.

---

## Step 3: Bullet Rendering ✅ Complete

Bullet branch in layout.rs → bullet_char insertion rendering.

---

## Step 4: Local Build Environment Setup

### Goal
Verify and document that native build/test is possible locally without Docker. (Docker used for WASM only)

### Work
- Verify `cargo build` / `cargo test` local execution
- Check required system dependencies (openssl, pkg-config, etc.)
- Add local build commands to CLAUDE.md build section

---

## Step 5: Diagnostic Command Systematization

### Goal
Instead of temporary `eprintln`, output document structure diagnostic information via `rhwp diag <file.hwp>` command.

### Output
```
=== DocInfo Summary ===
  Numbering: 3 items (formats: ["^1.", "^2.", ...])
  Bullet: 2 items (characters: ●, ■)

=== ParaShape head_type Distribution ===
  None: 15, Outline: 8, Number: 3, Bullet: 2

=== SectionDef Outline Numbering ===
  Section0: outline_numbering_id=1 → Numbering[0]

=== Non-None head_type Paragraphs ===
  Section0:Para5 head=Outline level=0 num_id=0 text="Web Hangul Gian..."
  Section0:Para7 head=Bullet  level=3 num_id=1 text="Existing Hangul documents..."
```

### Changed Files
- src/main.rs: Add `diag` subcommand

---

## Step 6: SectionDef Outline Numbering Parsing and Outline Rendering Completion

### Goal
Store SectionDef's numbering_id (bytes 14-15) and reference it during Outline paragraph rendering.

### Key Finding
- SectionDef bytes 14-15 contain `numbering_id`, currently discarded as `_numbering_id`
- Outline paragraphs have ParaShape.numbering_id=0, referencing Numbering via section's numbering_id

### Changed Files and Content

**src/model/document.rs** — Add `outline_numbering_id: u16` field to SectionDef

**src/parser/body_text.rs** (line 429) — Change `_numbering_id` to `sd.outline_numbering_id`

**src/renderer/layout.rs** — Use current section's outline_numbering_id when numbering_id=0 for Outline paragraphs

---

## Step 7: Integration Testing and Verification

| Item | Method |
|------|--------|
| Existing 571 test regression | `cargo test` (local) |
| WASM build | `docker compose run --rm wasm` |
| Outline rendering | hancom-webgian.hwp SVG export |
| Bullet rendering | hancom-webgian.hwp SVG export (with Bullet paragraphs) |
| Number existing behavior preserved | Existing sample file SVG export comparison |
| diag command output | `rhwp diag samples/hancom-webgian.hwp` |
| Serialization round-trip | Bullet/SectionDef parse → save → re-parse |
