# HWP 5.0 Specification Errata

This document records discrepancies between the official specification ([hwp_spec_5.0.md](hwp_spec_5.0.md)) and the actual binary implementation.
Each item has been verified through reverse engineering, and this project's parser/renderer is implemented based on the actual binary behavior.

> **Always check this document before implementing new features.** Following the specification verbatim can cause file corruption.

---

## 1. BorderFill Serialization Order

| Item | Details |
|------|------|
| Spec location | Table 28 (Border/Background) |
| Spec description | Sequential array: `line_type[4]`, `width[4]`, `color[4]` |
| Actual implementation | Interleaved: `(line_type + width + color) x 4` (left, right, top, bottom) |
| Verification method | `eprintln!` dump of border color -> must be exactly `#000000`. Sequential array reading produces misaligned values like `#010100` |
| Modified file | `src/parser/doc_info.rs` |
| Discovery date | 2026-02-05 |

---

## 2. BorderLineType Enumeration Values

| Item | Details |
|------|------|
| Spec location | Table 28 (Border line type) |
| Spec description | Starts from 0 implying 0=Solid |
| Actual implementation | 0=None (no line), 1=Solid, 2=Dash, 3=Dot, 4=DashDot, 5=DashDotDot, 6=LongDash, 7=Circle, 8=Double, 9=ThinThickDouble, 10=ThickThinDouble, 11=ThinThickThinTriple, 12=Wave, ... |
| Verification method | `eprintln!` dump of line_type value, verify that "no line" borders are 0 in actual HWP files |
| Modified files | `src/parser/doc_info.rs`, `src/model/style.rs` |
| Discovery date | 2026-02-05 |

---

## 3. LIST_HEADER Attribute Bit Positions

| Item | Details |
|------|------|
| Spec location | Table 67 (Paragraph list header) |
| Spec description | In the UINT32 attribute field: bit 0~2=text direction, bit 3~4=line break, bit 5~6=vertical alignment |
| Actual implementation | Bit positions are in the **upper 16 bits**: bit 16~18=text direction, bit 19~20=line break, bit 21~22=vertical alignment |
| Verification method | `list_attr=0x00200000` (bit 21 set) -> vertical_align=Center(1). Reading bit 5~6 as per spec always yields 0 (Top) |
| Extraction formula | `text_direction = (list_attr >> 16) & 0x07`, `vertical_align = (list_attr >> 21) & 0x03` |
| Modified file | `src/parser/control.rs` |
| Discovery date | 2026-02-06 |

---

## 4. FootnoteShape Record Size

| Item | Details |
|------|------|
| Spec location | HWPTAG_FOOTNOTE_SHAPE |
| Spec description | 26 bytes |
| Actual implementation | 28 bytes. An undocumented 2-byte field exists between `note_spacing` and `separator_line_type` |
| Verification method | Check record data length and verify `separator_color` value (misaligned colors without skipping 2 bytes) |
| Modified file | `src/parser/body_text.rs` |
| Discovery date | 2026-02-06 |

---

## 5. PARA_HEADER char_count MSB -- Paragraph List End Marker

| Item | Details |
|------|------|
| Spec location | Table 60 (Paragraph header) |
| Spec description | `if (nchars & 0x80000000) { nchars &= 0x7fffffff; }` -- Mask MSB to get actual character count (meaning unexplained) |
| Actual meaning | **MSB = last paragraph of the current paragraph list (scope)**. When MSB=1, the paragraph is the last paragraph in the current scope (section/cell/text box, etc.) |
| Verification data | k-water-rfp.hwp Section0 (57 paragraphs): idx 0~55 MSB=0, only idx 56 has MSB=1. 26 paragraphs in a cell: p[0..24] MSB=0, only p[25] has MSB=1 |
| Violation consequence | MSB=1 on a non-last paragraph -> subsequent paragraphs disappear. MSB=0 on the last paragraph -> "file corruption" error |
| Modified files | `src/wasm_api.rs`, `src/serializer/body_text.rs` |
| Reference document | `troubleshootings/table_paste_file_corruption.md` FIX-1 |
| Discovery date | 2026-01-20 |

---

## 6. PARA_TEXT Record Prohibited for Empty Paragraphs (cc=1)

| Item | Details |
|------|------|
| Spec location | Table 60 (Paragraph header), Table 62 (Paragraph text) |
| Spec description | No explicit description of PARA_TEXT existence conditions |
| Actual rule | When `char_count=1` (only paragraph end marker exists) and there are no controls, the presence of a PARA_TEXT record causes Hancom to report "file corruption" |
| Valid structure | cc=1 empty paragraph: `PARA_HEADER -> PARA_CHAR_SHAPE -> PARA_LINE_SEG` (no PARA_TEXT) |
| Invalid structure | cc=1 empty paragraph: `PARA_HEADER -> PARA_TEXT([0x000D]) -> PARA_CHAR_SHAPE -> PARA_LINE_SEG` -> **file corruption** |
| Modified files | `src/model/paragraph.rs`, `src/serializer/body_text.rs` |
| Reference documents | `troubleshootings/table_paste_file_corruption.md` FIX-3, `troubleshootings/cell_split_save_corruption.md` FIX-2 |
| Discovery date | 2026-01-22 |

---

## 7. control_mask Field -- Must Be Recalculated During Serialization

| Item | Details |
|------|------|
| Spec location | Table 60 (Paragraph header) |
| Spec description | "Control mask" (no details) |
| Actual rule | `control_mask` is the bitwise OR of char_codes of controls actually present in the paragraph's `controls[]` array. When `controls[]` changes after editing, `control_mask` must also be recalculated |
| Bit mapping | `0x04` = SectionDef/ColumnDef (code 2), `0x800` = Table/Shape/Picture (code 11), `0x10000` = Header/Footer (code 16) |
| Violation consequence | `control_mask=0x800` but no TABLE record -> Hancom parser confusion -> "file corruption" |
| Fix | Recalculate `compute_control_mask(controls)` during serialization -> ignore model value |
| Modified file | `src/serializer/body_text.rs` |
| Reference document | `troubleshootings/cell_split_save_corruption.md` FIX-1 |
| Discovery date | 2026-02-19 |

---

## 8. Fill Transparency (Alpha) Byte -- Not Documented in Spec

| Item | Details |
|------|------|
| Spec location | Table 30 (Fill information) |
| Spec description | "Additional fill property length (DWORD) + Additional fill property (BYTE[size])" followed by **no further description** |
| Actual structure | After additional properties, 1 byte of alpha value exists per fill_type bit |
| Byte rule | bit0 (solid)=1 -> 1 byte alpha, bit2 (gradient)=1 -> 1 byte alpha, bit1 (image)=1 -> 1 byte alpha |
| Alpha interpretation | 0=not set (treat as opaque), 1~254=translucent (opacity=alpha/255), 255=opaque |
| Verification data | Worldcup_FIFA2010_32.hwp shape: alpha=0xA3(163) -> opacity=0.639 |
| HWPX equivalent | `<winBrush alpha="0.64">` as an explicit float |
| Side effect | Failure to consume alpha bytes -> byte alignment of subsequent fields (shadow info, etc.) collapses |
| Modified files | `src/parser/doc_info.rs`, `src/renderer/layout.rs`, `src/renderer/svg.rs`, `src/renderer/web_canvas.rs` |
| Reference document | `troubleshootings/shape_fill_transparency.md` |
| Discovery date | 2026-02-17 |

---

## 9. Extended Control Character Size -- WCHAR Units (Not Bytes)

| Item | Details |
|------|------|
| Spec location | Table 6 (Control characters), Table 62 (Paragraph text) |
| Spec description | Extended control character "size = 8" |
| Actual size | 8 **WCHAR** = 8 x 2 bytes = **16 bytes** |
| Structure (16 bytes) | `code(2B) + control type(4B, ASCII) + additional info(8B) + code repeat(2B)` |
| Control type examples | `' lbt'` -> 'tbl ' (table), `' osg'` -> 'gso ' (drawing), `'deqe'` -> 'eqed' (equation) -- little-endian reversed |
| Verification method | hwplib `ForParaText.java`: `return 16;`, `byte[] addition = new byte[12];` |
| Modified file | `hwp_semantic/record_parser.py` |
| Reference document | `troubleshootings/task_56_hwp_control_char_bytes.md` |
| Discovery date | 2026-01-06 |

---

## 10. Cell Header Row (is_header) Bit -- Not Documented in HWP 5.0

| Item | Details |
|------|------|
| Spec location | Table 67 (Paragraph list header), Table 82 (Cell properties) |
| Spec description | **Not defined** (missing from HWP 5.0 spec) |
| HWPML 3.0 spec | Documented as `Header` attribute: "Whether this is a header cell, default=false" |
| Actual bit position | **bit 2** in LIST_HEADER extended properties (bytes 6-7) (= hwplib property bit 18) |
| hwplib mapping | `ListHeaderPropertyForCell`: bit16=inner padding specified, bit17=cell protection, **bit18=header cell**, bit19=form mode |
| Behavior rule | Table's `repeat_header=true` AND row 0 must have cells with `is_header=true` for header row repetition |
| Extraction in our code | `cell.is_header = (cell.list_header_width_ref & 0x04) != 0;` |
| Modified files | `src/model/table.rs`, `src/parser/control.rs`, `src/renderer/layout.rs` |
| Reference document | `troubleshootings/repeat_header_image_duplication.md` |
| Discovery date | 2026-02-10 |

---

## 11. Column Definition (ColumnDef) Width/Gap -- Proportional Value Encoding

| Item | Details |
|------|------|
| Spec location | Table 140 (Column definition) |
| Spec description | Implies width values are HWPUNIT absolute values |
| Actual encoding | **Proportional values** -- proportionally distributed so that the sum equals 32768 (=2^15) |
| Conversion formula | `actual_value = proportional_value / total(32768) x body_width` |
| Verification data | KTX.hwp: w0=13722, g0=590, w1=18456, g1=0 -> total=32768. col0_width=13722/32768x79652=33363 HU=117.7mm (matches HWP dialog) |
| Byte order | Spec: `[attr][spacing][widths...]`, actual (hwplib): same_width=false -> `[attr][attr2][w0+g0][w1+g1]...` |
| HWPML 3.0 difference | In HWPX, Width and Gap are HWPUNIT absolute values |
| Modified files | `src/parser/body_text.rs`, `src/model/page.rs`, `src/renderer/page_layout.rs`, `src/serializer/control.rs` |
| Reference document | `troubleshootings/column_def_proportional_widths.md` |
| Discovery date | 2026-02-16 |

---

## 12. Page Number Position (PageNumberPos) -- Cross-Reference Error

| Item | Details |
|------|------|
| Spec location | Table 149 (Page number position) -> "Attribute (see Table 148)" |
| Spec error | Table 148 describes "odd/even adjustment" (only bit 0~1 defined). **The correct reference is Table 150** |
| Table 150 content | bit 0~7: number format, bit 8~11: display position |
| Actual impact | Referencing Table 148 uses only bit 0~3 -> position is misinterpreted as bit 4~7 -> position=0 (none) incorrectly |
| Verification data | attr=0x00000500: correct format=(0x500&0xFF)=0, position=(0x500>>8)&0x0F=**5** (bottom center) |
| Section title mismatch | Page number properties (Table 150) are located in the "Character overlap" section -- table numbers are shifted by 2~3 |
| Modified file | `src/parser/control.rs` |
| Reference document | `troubleshootings/task_70_page_number_false_completion.md` |
| Discovery date | 2026-02-08 |

---

## 13. CommonObjAttr -- prevent_page_break Field Not Documented

| Item | Details |
|------|------|
| Spec location | Table 72 (Common object attributes) |
| Spec description | Field listing after attr(UINT32) **does not include** `prevent_page_break` |
| Actual implementation | An INT32 `prevent_page_break` field (4 bytes) exists after attr |
| Violation consequence | Omitting this field causes all subsequent fields (object description length + data) to be offset by 4 bytes -> file structure corruption |
| Modified files | `src/serializer/control.rs`, `src/parser/control.rs`, `src/model/shape.rs` |
| Reference document | `troubleshootings/picture_save_hancom_compatibility.md` section 1 |
| Discovery date | 2026-02-15 |

---

## 14. CommonObjAttr attr bit 15~19 -- Size Reference Setting Required

| Item | Details |
|------|------|
| Spec location | Table 72 (Common object attributes) |
| Spec description | bit 15~17: object width reference (0=paper, 1=page, 2=column, 3=para, 4=absolute), bit 18~19: height reference (0=paper, 1=page, 2=absolute) |
| Actual interpretation | If unset (=0=paper), Hancom interprets width/height as **percentage of paper**. Example: 42520 HU -> 425.20% |
| Correct setting | When inserting images, `(4 << 15) \| (2 << 18)` = width=absolute, height=absolute must be specified |
| Modified file | `src/wasm_api.rs` |
| Reference document | `troubleshootings/picture_save_hancom_compatibility.md` section 6 |
| Discovery date | 2026-02-15 |

---

## 15. SHAPE_COMPONENT ctrl_id -- Pictures Use "$pic"

| Item | Details |
|------|------|
| Spec location | Table 86 (SHAPE_COMPONENT) |
| Spec description | Control ID field exists (specific values not documented) |
| Actual rule | Drawing objects (GSO) = `"gso "` (0x67736F20), **Pictures = `"$pic"` (0x24706963)** |
| Violation consequence | Using `"gso "` for pictures causes images not to display in Hancom |
| Modified files | `src/serializer/control.rs`, `src/parser/tags.rs` |
| Reference document | `troubleshootings/picture_save_hancom_compatibility.md` section 2 |
| Discovery date | 2026-02-15 |

---

## 16. bin_data_id -- Record Ordinal (Not storage_id)

| Item | Details |
|------|------|
| Spec location | Image reference related |
| Spec description | Exact meaning of bin_data_id not documented |
| Actual meaning | **Ordinal number of BinData records in doc_info (1-indexed)**. Separate from storage_id (CFB filename number) |
| Confusion cause | In most HWP files, storage_id is sequentially assigned from 1, coincidentally matching the ordinal |
| Correct approach | `bin_data_content[(bin_data_id - 1) as usize]` -- access as array index |
| Violation consequence | Incorrect image mapping in files where storage_id is non-sequential (e.g., Worldcup_FIFA2010_32.hwp) |
| Modified files | `src/renderer/layout.rs` (6 locations), `src/wasm_api.rs` (1 location) |
| Reference document | `troubleshootings/bin_data_id_index_mapping.md` |
| Discovery date | 2026-02-17 |

---

## 17. ShapeComponent Parsing Order -- Shadow Info

| Item | Details |
|------|------|
| Spec location | Table 86~87 (SHAPE_COMPONENT) |
| Spec description | **No description** of data after fill |
| Actual order | `commonPart -> lineInfo -> fillInfo -> shadowInfo(16B) -> instid -> skip -> transparent` |
| Shadow info structure | `shadow_type(u32) + shadow_color(u32, COLORREF) + offset_x(i32) + offset_y(i32)` = 16 bytes |
| Misparsing consequence | Reading the 16-byte shadow as text box margin (8 bytes) causes all subsequent fields to misalign |
| hwplib reference | `ForShapeComponent.java` `shadowInfo()` method |
| Modified file | `src/parser/control.rs` |
| Reference document | `troubleshootings/shape_fill_transparency.md` section "Second root cause" |
| Discovery date | 2026-02-17 |

---

## 18. Field CTRL_HEADER -- memo_index Field Not Documented

| Item | Details |
|------|------|
| Spec location | Table 154 (Field control CTRL_HEADER) |
| Spec description | `ctrl_id(4) + properties(4) + extra_properties(1) + command_len(2) + command(variable) + field_id(4)` -- **nothing described** after field_id |
| Actual implementation | **4 bytes** exist after field_id (named `memoIndex` in hwplib, but actually a **MemoShape record reference index** in DocInfo) |
| Field meaning | Points to the MemoShape ID of the associated memo in fields that use the "attach memo" feature. Always 0 for ClickHere (form field) fields. Links to hwplib's `IDMappings.memoShapeCount` and `MemoShape` records |
| Violation consequence | Not serializing the 4 bytes -> CTRL_HEADER size mismatch in Hancom -> form field guide text appears as empty string |
| Verification method | hwplib `CtrlHeaderField.java`: `memoIndex = sr.readSInt4()`, `IDMappings.memoShapeCount`, byte comparison with Hancom-saved files |
| hwplib serialization | `ForControlField.java` lines 52~56: for `FIELD_UNKNOWN`, writes the `memoIndex` value; **for all other field types, writes 0 as 4 bytes**. hwplib always serializes these 4 bytes |
| hwplib limitation | Reads and writes the command string as-is. No parsing/modification of internal `Direction:/HelpState:/Name:` -> cannot edit form field guide text/memo/name |
| Modified files | `src/model/control.rs`, `src/parser/control.rs`, `src/serializer/control.rs` |
| Discovery date | 2026-03-15 |

---

## 19. ClickHere Memo Content (M) Storage Location -- HelpState in command String

| Item | Details |
|------|------|
| Spec location | Table 154 (Field control), HWP 3.0 HWPML spec section 10.1.5 |
| Spec description | **No description** of how ClickHere memo (help text) is stored |
| Actual implementation | Stored as `HelpState:wstring:N:text` pattern within the command string |
| Full command structure | `Clickhere:set:{len}:Direction:wstring:{n}:{guide_text} HelpState:wstring:{n}:{memo} Name:wstring:{n}:{name} ` |
| Important note | **A trailing space must be preserved** after each wstring value. Calling trim_end() causes Hancom to interpret the guide text as an empty string |
| HWP 3.0 reference | Section 10.1.5: "String #3 contains help text displayed in the status line, String #2 contains the input guide text" |
| Verification method | field-01-memo.hwp: `HelpState:wstring:43:The company name is...` |
| Modified files | `src/model/control.rs` (`guide_text()`, `memo_text()`, `build_clickhere_command()`) |
| Discovery date | 2026-03-15 |

---

## 20. ClickHere Field Name -- Stored in CTRL_DATA

| Item | Details |
|------|------|
| Spec location | Table 154 (Field control), HWP 3.0 HWPML spec section 8.8 |
| Spec description | **No description** of field name storage/update mechanism |
| Actual implementation | Stored in CTRL_DATA record as ParameterSet(id=0x021B) -> ParameterItem(id=0x4000, type=String) |
| Name: in command | `Name:wstring:N:name` also exists in the command string, but **Hancom does not rebuild the command when changing the field name** -- only the name in CTRL_DATA is updated |
| Priority | 1st: CTRL_DATA name -> 2nd: command Name: -> 3rd: command Direction: (fallback) |
| HWP 3.0 reference | Section 8.8: Stored separately in supplementary info block as "form field number + field name" |
| Modified files | `src/model/control.rs` (`field_name()`), `src/parser/control.rs`, `src/wasm_api.rs` |
| Discovery date | 2026-03-15 |

---

## 21. Field properties bit 15 -- Initial State Flag

| Item | Details |
|------|------|
| Spec location | Table 155 (Field properties) |
| Spec description | "bit 15: Whether field content has been modified" (no detailed behavior description) |
| Actual behavior | bit 15 == 0: **initial state** (user has not input). Hancom inserts guide text as the field value when actions like adding memos occur, but keeps bit 15 as 0 -> treated as guide text |
| HWP 3.0 equivalent | Section 10.1.5 binary data: "bit 0: Whether user has not input content, in initial state (1=initial state)" |
| Rendering rule | bit 15 == 0 and field value equals guide text -> display as guide text (red italic). Clear text on click to create empty field |
| Verification data | field-01-memo.hwp: properties=0x00000001 (bit 15=0), field value="Enter here"=guide text -> initial state |
| Modified files | `src/document_core/commands/document.rs` (`clear_initial_field_texts()`), `src/renderer/layout/paragraph_layout.rs` |
| Discovery date | 2026-03-16 |

---

## 22. control_mask -- TAB, FIELD_END, LINE_BREAK Bit Omission Warning

| Item | Details |
|------|------|
| Spec location | Table 60 (Paragraph header) |
| Spec description | "Control mask" (does not describe which control characters must be included) |
| Actual rule | Must include bits for **all** control characters present in PARA_TEXT. This includes not only extended control characters from the controls array, but also TAB(0x0009), FIELD_END(0x0004), LINE_BREAK(0x000A) |
| Bit mapping | `bit 3` = FIELD_BEGIN(0x0003), `bit 4` = FIELD_END(0x0004), `bit 9` = TAB(0x0009), `bit 10` = LINE_BREAK(0x000A) |
| Violation consequence | Missing TAB/FIELD_END bits -> Hancom 2010 crashes abnormally (Hancom 2020 is more tolerant) |
| Verification method | Byte comparison of PARA_HEADER control_mask with Hancom-saved files. Example: original 0x00000218, with omission 0x00000008 |
| Modified file | `src/serializer/body_text.rs` (`compute_control_mask()`) |
| Reference | Related to section 7 of this document, but section 7 only covers extended control characters. This item is the extended rule including inline control characters |
| Discovery date | 2026-03-15 |

---

## 23. PARA_TEXT Serialization -- FIELD_BEGIN/FIELD_END Order

| Item | Details |
|------|------|
| Spec location | Table 62 (Paragraph text) |
| Spec description | **No description** of extended control character placement order |
| Actual rule | Field controls must be wrapped in `FIELD_BEGIN(0x0003)` + field content + `FIELD_END(0x0004)` order. For empty fields (displaying only guide text), FIELD_END immediately follows FIELD_BEGIN |
| Trailing FIELD_END | When the field range extends to the end of paragraph text, FIELD_END is placed **immediately after** the corresponding FIELD_BEGIN control (before other controls) |
| Violation consequence | FIELD_END before FIELD_BEGIN or pushed after other controls causes Hancom to fail recognizing the field range |
| Modified file | `src/serializer/body_text.rs` (`trailing_end_after_ctrl` HashMap) |
| Discovery date | 2026-03-15 |

---

## 24. TAB Extended Data -- 7 Code Units Must Be Preserved

| Item | Details |
|------|------|
| Spec location | Table 62 (Paragraph text) |
| Spec description | TAB(0x0009) extended control character "size = 8" (internal structure not documented) |
| Actual structure | TAB code(2B) + **7 additional code units(14B)** = 16 bytes. Additional data contains tab width/type information |
| Round-trip rule | The 7 code units must be preserved during parsing and restored as-is during serialization. Filling with 0 causes tab spacing to be incorrect in Hancom |
| Modified files | `src/model/paragraph.rs` (`tab_extended`), `src/parser/body_text.rs`, `src/serializer/body_text.rs` |
| Discovery date | 2026-03-15 |



## 25. Paragraph Numbering Start Mode -- Implicit Behavior of the `numbering_id` System

| Item | Details |
|------|------|
| Spec location | Table 40 (Paragraph numbering), Table 45 (ParaShape `numbering_id`), `nwno` control (Table 146) |
| Spec description | **No explicit attribute field exists in the spec** for start mode (continue from previous / resume previous list / start new list) |
| Actual behavior | Not a separate implementation but a **natural byproduct** of the `numbering_id` system. Same id = continue, different id = reset, previous id restoration = resume. The dialog's radio buttons are just naming this behavior |
| Hancom help | `format/numberbullet/numberbullet(new_number).htm` |
| Verification files | `samples/para-head-num.hwp`, `samples/para-head-num-2.hwp` |
| Discovery date | 2026-03-19 |

### Storage Mechanism

HWP does not store the start mode as a separate field, but expresses it through **patterns of changing/maintaining/restoring `numbering_id` values**.

| Start Mode | Hancom Behavior | HWP Binary Representation |
|----------|----------|------------------|
| **Continue from previous** | Continue +1 from preceding numbered paragraph | Keep **same `numbering_id`** as previous paragraph |
| **Start new list** | Reset counter and start from new number | Change to a **different `numbering_id`** (create new Numbering definition) |
| **Resume previous list** | Restore previous counter even with different numbers in between | Revert to a **previously used `numbering_id`** |
| **Explicit number specification** | Set counter to specified value | Insert `nwno` control (Table 146) |

### Rendering Implementation

`NumberingState` preserves counters per numbering_id using `history: HashMap<u16, [u32; 7]>`.

```
advance(numbering_id, level):
  if numbering_id changed:
    history[old_id] <- save current counters
    if history[new_id] exists:
      counters <- restore history[new_id] (resume previous list)
    else:
      counters <- inherit upper levels(0..level) + reset current level and below (start new list)
  counters[level] += 1
  reset lower levels
```

### Dialog Binding

Read: Reverse scan from `get_para_properties_at_native` to determine:
- Same id as preceding numbered paragraph -> mode=0 (continue from previous)
- Same id previously used -> mode=1 (resume previous list)
- First occurrence of this id -> mode=2 (start new list)

Write: Manipulate `numbering_id` when changing start mode:
- "Continue from previous" -> keep previous paragraph's `numbering_id`
- "Start new list" -> create new Numbering definition -> assign different `numbering_id`
- "Resume previous list" -> revert to previously used `numbering_id`

### Verification Example (para-head-num-2.hwp)

```
id=3 level=1 -> counter[1]=1 -> "A."   (Start new: first occurrence)
id=3 level=1 -> counter[1]=2 -> "B."   (Continue: same id)
id=2 level=1 -> counter[1]=1 -> "A."   (Start new: id=2 first occurrence -> reset)
id=3 level=1 -> counter[1]=3 -> "C."   (Resume previous: id=3 history [2] restored -> +1)
id=4 level=1 -> counter[1]=1 -> "1."   (Start new: id=4 first occurrence -> reset, different format)
id=4 level=1 -> counter[1]=2 -> "2."   (Continue: same id)
```


---

## 26. Table CTRL_HEADER -- Same CommonObjAttr Structure as Shape

| Item | Details |
|------|------|
| Spec location | Table 72 (Common object attributes), Table 79 (Table control) |
| Spec description | CommonObjAttr is described only for Shape/GSO objects. **The CTRL_HEADER ctrl_data structure for table (tbl) controls is not documented** |
| Actual implementation | Table's CTRL_HEADER ctrl_data uses **the same CommonObjAttr structure as Shape/GSO** |
| hwplib verification | `ForControlTable.java` line 62: `ForCtrlHeaderGso.read(table.getHeader(), sr)` -- calls the same reader as Shape |
| CommonObjAttr structure | `attr(u32) + vertical_offset(u32) + horizontal_offset(u32) + width(u32) + height(u32) + z_order(i32) + margin(i16x4) + instance_id(u32) + ...` |
| Previous error | Arbitrarily interpreting ctrl_data[0..4] as table-specific attr and ctrl_data[4..] as position data -> 4-byte coordinate offset misalignment |
| Affected scope | All table placement attributes including `treat_as_char`, `text_wrap`, `vert_rel_to`, `horz_rel_to`, `vertical_offset`, `horizontal_offset` |
| Modified files | `src/parser/control.rs`, `src/renderer/layout/table_layout.rs`, `src/renderer/pagination/engine.rs`, `src/renderer/layout.rs` |
| Discovery date | 2026-03-19 |

### Additional Corrections for Table Placement

InFrontOfText (text_wrap=3) / BehindText (text_wrap=2) tables are **floating objects that do not occupy space**.

- **Pagination**: Collected as `PageItem::Shape` like shapes (no height consumption)
- **Layout**: `layout_table` is called during the shapes pass, rendering at absolute paper-relative coordinates

| Reference | Paper Horizontal Position | Paper Vertical Position |
|------|----------------|----------------|
| ref origin | x=0.0 (paper left) | y=0.0 (paper top) |
| offset | `common.horizontal_offset` (HWPUNIT) | `common.vertical_offset` (HWPUNIT) |

### Verification Data (table-ipc.hwp)

| Table | Hancom Properties | Parsing Result |
|----|----------|----------|
| Table[3] | Paper/Left/15mm, Paper/Top/49mm, 68x5mm | Paper/4252=15mm, Paper/13890=49mm, 19276x1417 Correct |
| Table[4] | Paper/Left/15mm, Paper/Top/54mm, 266.8x128mm | Paper/4252=15mm, Paper/15307=54mm, 75628x36288 Correct |

---

## Verification Principles

1. **Binary first**: Trust actual binary data over specification documents
2. **3-stage cross-verification**: (1) HWP 5.0 official spec -> (2) hwplib Java reference implementation -> (3) Actual HWP file hex dump
3. **Debug dump**: Output raw bytes with `eprintln!` for verification, then remove
4. **Color verification**: Confirm color values are exactly `#000000` (black). Approximate values (`#010100`, etc.) indicate byte misalignment
5. **Multi-file cross-verification**: Verify the same field across multiple HWP files when possible
6. **Suspect 0/null returns**: When the parser returns 0 or None, only conclude "the value is actually 0" after cross-referencing with the spec
7. **Read tolerantly / Write strictly**: HWP format is tolerant for reading but even 1 byte off during writing triggers "file corruption". Serialization code must be byte-compared with files that Hancom considers valid
8. **Record immediately upon discovery**: Add new discrepancies to this document as soon as they are found

---
