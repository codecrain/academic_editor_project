# DOCX API-only Implementation Lessons

Date: 2026-06-13

## Decision Summary

DOCX API-only editing is now implemented as a separate local utility layer in `editor_docx/scripts/docx-api-utils.mjs`.

This does not replace the DOCX WOPI editor. WOPI remains the end-user browser editor path; the new utility is for LLM/API automation that must read, target, edit, save, and verify documents without browser clicks.

DOCX and HWPX now share normalization, command identity, target-location, list-writing, text-fitting, and API session contract helpers through `editor_common/document-api-core.mjs`. Format-specific package editing remains inside `editor_docx` and `editor_hwpx`.

## What Changed

Implemented DOCX API primitives:

- JSON read model: paragraphs, tables, cells, editable targets, styles, objects.
- Exact target editing: paragraph locations, `tableId + cell.number`, text ranges.
- Style-sensitive writes: `table.writeRichCell`, `style.applyText`, `paragraph.applyStyle`.
- Cell style cloning: `table.applyCellStyle`.
- Text fitting: `layout.fitText` with word-aware wrapping.
- Object editing: `image.replace`, `image.generateAndReplace`.
- Package features: metadata, styles, page setup, header, footnotes.
- Table creation with initial cell style.
- Quality checks for package entries, table/cell capacity, style drift.

Added tests and samples:

- `editor_common/document-api-core.test.mjs`
- `editor_docx/scripts/docx-api-utils.test.mjs`
- `editor_docx/scripts/author-docx-api-samples.mjs`
- `editor_docx/scripts/validate-docx-render.mjs`
- `npm.cmd run test:common-api`
- `npm.cmd run test:docx-api`
- `npm.cmd run docx:author:samples`
- `npm.cmd run docx:validate:render`

Generated outputs:

- `output/docx-review/01-template-original.docx`
- `output/docx-review/02-template-api-improved.docx`
- `output/docx-review/03-report-original.docx`
- `output/docx-review/04-report-api-improved.docx`
- `output/docx-review/rendered/*/*.pdf`
- `output/docx-review/rendered/*/page-*.png`

## Failures Found And Fixed

1. API-only reopen was not enough.

The first implementation passed internal parsing tests but Word rejected the saved DOCX. The fix was to add external validation: Word COM open/export plus rendered PNG inspection.

2. DOCX ZIP metadata mattered.

The custom ZIP writer used zero DOS date fields. Word rejected generated packages. The ZIP writer now writes a valid minimum DOS date.

3. Relationship duplication could corrupt compatibility.

Existing DOCX templates already had styles relationships. Adding a second styles relationship with a new id was unnecessary and risky. The utility now reuses an existing relationship when type and target already exist.

4. XML well-formedness was necessary but insufficient.

All XML parts parsed successfully even when Word refused the document. DOCX acceptance requires package-level validation, relationship sanity, and real application open/export.

5. Character-count fitting produced bad visual output.

The first `fitText` split words in table cells. It now wraps on whitespace first and splits only overlong tokens.

6. Table creation needed style inputs.

Plain generated tables rendered without visible structure. `table.create` now accepts initial `cellStyle` so API authors can create readable tables without a second styling pass.

7. DOCX and HWPX needed a shared contract, not shared file internals.

The useful common layer is command and location normalization plus session-shape validation. DOCX still edits OOXML packages and HWPX still edits HWPX/RHWP data. This avoids forcing two different document formats into one parser while keeping LLM-facing behavior aligned.

8. Rendered table margins needed visual QA.

The API-generated DOCX samples were structurally valid but table text sat too close to borders. The sample authoring flow now supplies cell borders and margins, and `docx:validate:render` exports Word PDFs and page PNGs for visual inspection.

## Current Verified Scope

Verified by automated tests:

- Common DOCX/HWPX API session contract.
- No-op save returns original bytes.
- Read JSON and target map expose paragraphs, cells, styles, images.
- Rich cell writes preserve source run and paragraph style.
- Paragraph style cloning preserves text.
- Cell outer style cloning survives save/reopen.
- Numbered list text writes preserve selected style.
- Image replacement and generated PNG replacement update package media.
- Legacy DOCX command wrappers still work.
- Metadata, page setup, styles, header, and footnotes can be applied in one batch.

Verified by real Word/render path:

- Four sample DOCX files opened through Word COM.
- Four sample DOCX files exported to PDF.
- PDFs were rasterized to PNG.
- Improved samples were visually inspected page by page.

## Remaining Product Work

These are not blockers for the current local API utility, but they are the next quality steps:

- Add server endpoints under `/v1/docx/...` that call the same utility instead of reimplementing logic.
- Add a render-compare endpoint that stores page images and returns bounded visual diffs.
- Add real DOCX numbering definitions for callers that need native list objects instead of stable visible list text.
- Add richer table geometry: column grid, row height, cell margins, and merged cell support.
- Add content controls, comments, tracked changes, and field updates if SaaS workflows require them.
- Add a Word/LibreOffice validation adapter in CI or a Windows validation worker.

## LLM Usage Rules

Use this flow for DOCX API-only editing:

1. Open the document.
2. Call `readJson()`.
3. Use `targetMap()` or `resolveText()`.
4. Call `inspectTarget(location)` before writing.
5. Choose `styleSource` from a nearby correct paragraph/cell.
6. Use `fit: true` or `fitText()` for table cells.
7. Apply commands.
8. Call `qualityCheck()`.
9. Save.
10. Validate with Word/PDF/rendered PNG for deliverables.

Do not use screen position, browser clicks, or WOPI iframe state for API-only editing.

Required local verification for DOCX deliverables:

```powershell
npm.cmd run test:common-api
npm.cmd run test:docx-api
npm.cmd run docx:author:samples
npm.cmd run docx:validate:render
```
