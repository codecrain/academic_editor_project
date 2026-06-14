# Task 241 Execution Plan: HWPTAG_CTRL_DATA Full Cross-Check

## Background

During Task 240 bookmark implementation, a bug was discovered where the bookmark name was not extracted from the CTRL_DATA ParameterSet. Cross-checking with hwplib (Java) revealed that 7 control types use CTRL_DATA, but we only extract names for Field/Bookmark and preserve the rest as raw bytes.

## Goal

1. Identify the ParameterSet structure for all controls that use CTRL_DATA based on hwplib
2. Prioritize parsing items that affect rendering/editing
3. Investigate and fix the issue of FIELD_BOOKMARK (%bmk) parsing returning 0 results
4. Correctly generate CTRL_DATA records when creating new bookmarks

## Scope

### Required (Rendering/Editing Impact)
- **Bookmark**: Generate CTRL_DATA ParameterSet when adding new bookmark → display name in Hancom
- **FIELD_BOOKMARK (%bmk)**: Investigate 0 parsing results → include field bookmarks in list
- **Field**: Verify additional attributes beyond ctrl_data_name (check if current implementation is sufficient)

### Investigation (No Immediate Fix Needed, Document Findings)
- Identify CTRL_DATA contents for SectionDef, Table, Picture, Rectangle, and other GSO
- Document which ParameterSet id/items are used for each control → add parsing later if needed

## Deliverables

- Modified parser code (bookmark CTRL_DATA generation, FIELD_BOOKMARK parsing)
- CTRL_DATA analysis technical document (mydocs/tech/)
