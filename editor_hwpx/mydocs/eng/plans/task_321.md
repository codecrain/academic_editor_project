# Task 321 Design Document: Master Page Architecture Redesign

## 1. Current Implementation Analysis

### Master Page Storage Structure (HWP)
- SectionDef.master_pages: Vec<MasterPage>
- apply_to determined by index order: 0=Both, 1=Odd, 2=Even (3+= Extended Both)
- LIST_HEADER byte 18-19: Extended attributes (last page number, etc.)

### Current Selection Logic (rendering.rs:831~864)
```
mp_both = first Both
mp_odd = first Odd
mp_even = first Even
ext = second and later Both
```
- Odd pages: mp_odd ?? mp_both
- Even pages: mp_even ?? mp_both
- Extension: Applied only to page_number==1 (hardcoded)

### Problems
1. Only first Both used as default → wrong selection in science (5 master pages)
2. Extended Both = last page, but applied only to page 1
3. No role distinction when multiple Both exist
4. Cannot determine last page
5. Master page table position calculation needs paper_area instead of body_area

## 2. Reference Analysis

### exam_social (1 master page)
- [0] Both: Vertical lines + header table
- Section 1 adds Both + Odd
- Simple: Same master page on all pages

### exam_math (2 master pages)
- [0] Both: Header table
- [1] Both (extended): Page number table — **last page**
- Key: Second Both = last page (with page number)

### exam_kor (3 master pages)
- [0] Both: For even pages (vertical lines + header table)
- [1] Odd: For odd pages (vertical lines + header table, left-right mirrored)
- [2] Both (extended): Last page (header + vertical lines + page number table)

### exam_eng (3 master pages)
- Same pattern as exam_kor

### exam_science (5 master pages)
- [0] Both: Vertical lines only (common background for all pages)
- [1] Both (extended): Vertical lines + header table — **last page or default?**
- [2] Odd: Odd pages (vertical lines + header table)
- [3] Even: Even pages (vertical lines + header table)
- [4] Both (extended): Vertical lines + header + page number table — **last page**

## 3. Master Page Application Rules (Based on Hancom Help)

### Priority (Higher overrides lower)
```
Custom page / Last page > Odd page / Even page > Both
```

### Application Logic
1. Default master page: First Both (applied to all pages)
2. If Odd exists: **Replaces** Both on odd pages
3. If Even exists: **Replaces** Both on even pages
4. Extended Both (last page): **Replaces** Odd/Even/Both on the last page of the section
   - If "overlay" option: **Adds** instead of replacing
5. Extended Both (custom page): Replaces or adds on specific pages

### Extended Both Distinction
- Distinguished by LIST_HEADER byte 18-19 values
  - 0x00: Regular Both
  - 0x03: Last page (overlay?)
  - 0x07: Last page + overlay?

## 4. Redesign Plan

### 4.1 MasterPage Model Extension
```rust
pub struct MasterPage {
    pub apply_to: HeaderFooterApply,
    pub is_extension: bool,     // Whether it's an extended master page (last/custom page)
    pub overlap: bool,          // Overlay option
    pub ext_flags: u16,         // Raw extension flags (byte 18-19)
    pub paragraphs: Vec<Paragraph>,
    // ... existing fields
}
```

### 4.2 Improved Master Page Selection Logic
```
fn select_master_page(mps, page_number, is_last_page, section_page_count) -> (Option<&MasterPage>, Vec<&MasterPage>)
1. base = first Both (is_extension=false)
2. if is_odd && Odd exists → active = Odd
3. if is_even && Even exists → active = Even
4. else → active = base
5. if is_last_page → if extended Both for last page exists:
   - overlap=true: active + extended Both (extra_master_pages)
   - overlap=false: active = extended Both (replacement)
6. return (active, extras)
```

### 4.3 Improved Master Page Rendering
- Tables/shapes/images: Position using compute_object_position relative to paper
- Apply same logic to all master page controls (currently only tables are fixed)
- Page number substitution: AutoNumber(Page) in TextBox handling (using existing implementation)
- **Clipping exception**: Master pages render outside Body clipping (editing area)
  - Current: MasterPage nodes are independent from Body node → Already correct
  - Note: Tables/shapes within master pages can be positioned across the full paper area

## 5. Implementation Steps
1. Add is_extension/overlap/ext_flags to MasterPage model
2. Parse byte 18-19 in parser to set is_extension/overlap
3. Improve master page selection logic (rendering.rs)
4. Verification with reference files (exam_social → exam_science in order)
