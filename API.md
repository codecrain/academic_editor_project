# Document Editor API v1

Audience: an LLM agent with no prior project context.

This file is the contract for API-only editing of DOCX and HWPX documents. It is not a UI automation guide. Do not click editor iframes, do not infer from screen coordinates, and do not edit by vague text alone.

## Runtime Boundary

Formats:
- DOCX API prefix: `/v1/docx/...`
- HWPX API prefix: `/v1/hwpx/...`

Local implementation files:
- Shared LLM/API contract: `editor_common/document-api-core.mjs`
- Shared contract tests: `editor_common/document-api-core.test.mjs`
- Cross-format command contract tests: `editor_common/editor-api-command-contract.test.mjs`
- DOCX API utility: `editor_docx/scripts/docx-api-utils.mjs`
- HWPX API utility: `editor_hwpx/scripts/hwpx-api-utils.mjs`
- Local API bridge/gateway: `editor_docx/scripts/editor-gateway.mjs`

Engine split:
- DOCX browser editing remains on the DOCX/WOPI editor path.
- HWPX browser editing remains on the RHWP/HWPX path.
- Shared code is allowed only for LLM-facing API contract utilities: command normalization, target normalization, text fitting, list text generation, hashing, and session-shape validation.
- Do not make DOCX depend on HWPX internals or HWPX depend on DOCX OOXML internals.

Required session methods for both local utilities:

```text
readJson()
analyze()
targetMap()
inspectTarget(location)
resolveText(query, options)
fitText(location, text, options)
styleFingerprint(location)
objectInventory()
apply(commands)
qualityCheck(options)
save()
```

## Non-Negotiable Agent Algorithm

For every edit:

```text
open -> read-json -> target-map/find -> inspect -> apply -> quality/check -> save/export -> visual validation if deliverable
```

Rules:
- Never write before `read-json`.
- Never write to a text match before `target/inspect` confirms the exact paragraph/cell/object.
- Prefer exact table `cell.number` / `cellIndex`; use row/column only when no merge ambiguity exists.
- Preserve style by choosing a nearby `styleSource` from `read-json` or `target/inspect`.
- Use `fit: true` or `layout.fitText` before writing long cell text.
- Treat append-only generation as insufficient when the task asks to modify an existing document.
- After each write batch, run `quality/check`.
- For user-visible DOCX output, local validation must include Word open/export and rendered PNG inspection.
- For user-visible HWPX output, preserve-package save and reopen/structure checks are mandatory; visual renderer gaps must be reported.

## Local Gateway Route Status

Implemented local bridge routes:

```text
POST /v1/{format}/documents/open
POST /v1/{format}/documents/{id}/documents/read-json
POST /v1/{format}/documents/{id}/target/map
POST /v1/{format}/documents/{id}/target/find
POST /v1/{format}/documents/{id}/target/inspect
POST /v1/{format}/documents/{id}/object/inventory
POST /v1/{format}/documents/{id}/commands/apply
POST /v1/{format}/documents/{id}/quality/check
POST /v1/{format}/documents/{id}/quality/render-compare
POST /v1/{format}/documents/{id}/pages/render-page
POST /v1/{format}/documents/{id}/pages/render-all
POST /v1/{format}/documents/{id}/documents/save-source
```

Known local bridge gaps:
- `POST /v1/{format}/documents/{id}/documents/export-pdf` currently returns `501`; it is a required production API but not exposed by the local bridge yet.
- DOCX page rendering through the local bridge is structural only. Current DOCX visual validation uses `npm.cmd run docx:validate:render`, which opens DOCX with Word COM, exports PDF, then rasterizes PNG pages.
- HWPX page rendering through the local bridge returns RHWP SVG payloads. The production API must convert this to WebP `quality=20`, max bounding box `1700x1700`, white background, stripped metadata.

Route aliases accepted by the local bridge:

```text
/v1/{format}/sessions                         -> open
/v1/{format}/sessions/{id}/...                -> document actions
target/map                                    -> targets/map
target/inspect                                -> targets/inspect
target/find                                   -> targets/resolve
object/inventory                              -> objects/inventory
commands/apply                                -> commands/batch
documents/save-source                         -> save
quality/check                                 -> health/check
export with body.type=json                    -> documents/read-json
export with body.type=pages-image             -> pages/render-all
export with body.type=pdf                     -> documents/export-pdf, currently 501 locally
```

## Open

`POST /v1/{format}/documents/open`

Local request:

```json
{
  "filename": "document.hwpx",
  "source": {
    "bytesRef": "C:/absolute/path/document.hwpx"
  }
}
```

Alternative local source:

```json
{
  "filename": "document.docx",
  "source": {
    "bytesBase64": "..."
  }
}
```

Response:

```json
{
  "ok": true,
  "documentId": "doc_uuid",
  "sessionId": "doc_uuid",
  "fmt": "hwpx",
  "revision": 1,
  "pageCount": 10,
  "capabilities": ["json", "targetMap", "targetInspect", "objectInventory", "commands", "save", "quality", "renderPage"]
}
```

Production note: replace local `bytesRef` with storage IDs, upload IDs, or signed internal references. Do not expose server filesystem paths to external clients.

## Read JSON

`POST /v1/{format}/documents/{id}/documents/read-json`

Current shared response shape:

```json
{
  "revision": 1,
  "sourceFormat": "hwpx",
  "pageCount": 10,
  "sections": [],
  "blocks": [
    {
      "id": "s0_p25",
      "kind": "paragraph",
      "text": "...",
      "native": { "section": 0, "paragraph": 25 }
    }
  ],
  "tables": [
    {
      "id": "tbl_2",
      "dims": { "rowCount": 5, "colCount": 2, "cellCount": 9 },
      "native": { "section": 0, "paragraph": 22, "control": 0 },
      "cells": [
        {
          "id": "tbl_2_cell_4",
          "cellIndex": 4,
          "row": 2,
          "col": 1,
          "text": "...",
          "location": { "tableId": "tbl_2", "cell": { "number": 4, "row": 2, "column": 1 } },
          "style": {},
          "styleFingerprint": { "hash": "...", "basis": {} },
          "layout": { "capacity": {} },
          "allowedActions": []
        }
      ]
    }
  ],
  "styleGraph": {},
  "layoutGraph": {},
  "objectGraph": {
    "images": [{ "name": "BinData/image1.PNG", "byteLength": 156855 }],
    "pictures": [],
    "charts": []
  },
  "editableTargets": {
    "paragraphs": [],
    "cells": []
  },
  "warnings": {}
}
```

Common validator requires:

```text
sourceFormat
blocks[]
tables[]
editableTargets.paragraphs[]
editableTargets.cells[]
objectGraph.images[]
```

Currently both DOCX and HWPX utilities also return `sections`, `styleGraph`, `layoutGraph`, and `warnings`; callers should use them when present but must not use them as the only target source.

LLM use:
- `blocks[]` gives paragraph anchors.
- `tables[].cells[]` gives cell anchors and text.
- `styleFingerprint` is for style comparison; use `styleSource` rather than inventing style IDs.
- `layout.capacity` is an estimate; use `fitText` for long text.
- `objectGraph.images[]` is the source of valid `imageName` values.

## Locations

Preferred cell location:

```json
{ "tableId": "tbl_2", "cell": { "number": 4 } }
```

Cell location fallback:

```json
{ "tableId": "tbl_2", "cell": { "row": 2, "column": 1 } }
```

Paragraph location:

```json
{ "paragraph": { "section": 0, "number": 25 } }
```

HWPX native range for low-level text replacement:

```json
{ "native": { "section": 0, "para": 25, "offset": 0, "length": 4 } }
```

DOCX range target:

```json
{
  "range": {
    "start": { "nodeId": "p_4", "offset": 0 },
    "end": { "nodeId": "p_4", "offset": 4 }
  }
}
```

Image location:

```json
{ "imageName": "BinData/image1.PNG" }
```

Normalization rules:
- `cell.number`, `cell.cellIndex`, and `cell.index` normalize to the same cell index.
- `cell.column` and `cell.col` normalize to the same column.
- `paragraph.number`, `paragraph.paragraph`, `paragraph.para`, and `paragraph.index` normalize to the same paragraph index.

## Target APIs

`POST /v1/{format}/documents/{id}/target/map`

Response:

```json
{
  "editableTargets": {
    "paragraphs": [{ "location": { "paragraph": { "section": 0, "number": 3 } } }],
    "cells": [{ "location": { "tableId": "tbl_1", "cell": { "number": 5 } } }]
  },
  "locations": {
    "paragraphs": [],
    "cells": []
  }
}
```

`POST /v1/{format}/documents/{id}/target/find`

Request:

```json
{
  "query": "2025",
  "match": { "caseSensitive": false, "occurrence": 1, "includeCells": true }
}
```

Response:

```json
{
  "target": {
    "kind": "cell",
    "location": { "tableId": "tbl_1", "cell": { "number": 5 } },
    "offset": 0
  },
  "ambiguous": false
}
```

`target/find` is a locator only. Always call `target/inspect` before writing.

`POST /v1/{format}/documents/{id}/target/inspect`

Request:

```json
{
  "locations": [
    { "tableId": "tbl_1", "cell": { "number": 5 } }
  ]
}
```

Single-location shortcut:

```json
{
  "location": { "paragraph": { "section": 0, "number": 3 } }
}
```

Response:

```json
{
  "targets": [
    {
      "kind": "cell",
      "id": "tbl_1_cell_5",
      "location": { "tableId": "tbl_1", "cell": { "number": 5 } },
      "currentText": "...",
      "textLength": 10,
      "style": {},
      "styleFingerprint": { "hash": "...", "basis": {} },
      "layout": { "capacity": {} },
      "allowedActions": ["table.writeCell", "style.applyText"]
    }
  ]
}
```

## Command Envelope

`POST /v1/{format}/documents/{id}/commands/apply`

Request:

```json
{
  "baseRevision": 3,
  "commands": []
}
```

`baseRevision` should be supplied by callers. Current local bridge does not reject stale revisions; production should reject stale writes.

Accepted array key aliases:

```text
commands
ops
```

Command identity:
- Prefer `commandId`.
- Compatibility aliases: `opId`, `id`.
- If missing, local utility generates `command-N`; production callers should not rely on generated IDs.

Command name normalization:
- Prefer `op`.
- Compatibility aliases: `command`, `group` + `action`, `type`, `name`.
- Normalization removes non-alphanumeric characters and lowercases. Example: `table.write-rich-cell`, `table.writeRichCell`, and `{ "group": "table", "action": "write-rich-cell" }` normalize to the same key.

Common command fields:

```json
{
  "commandId": "stable-id",
  "op": "table.writeCell",
  "location": {},
  "target": {},
  "text": "...",
  "styleSource": {}
}
```

Field aliases:
- target location: `location`, `target`, `to`
- source style location: `styleSource`, `source`, `from`, `sourceLocation`, `cloneStyleFrom`
- text: `text`, `newText`, `value`, `content.text`
- explicit style: `styleIds`, `style`, `format`

Response:

```json
{
  "revision": 4,
  "results": [
    { "opId": "stable-id", "ok": true, "action": "table.writeCell", "target": "tbl_1_cell_5" }
  ],
  "warnings": []
}
```

## Canonical Commands

Shared canonical commands:

```text
text.replaceParagraph
text.replace
table.writeCell
table.writeCells
table.writeRichCell
table.applyCellStyle
style.applyText
paragraph.applyStyle
style.clone
list.writeBullets
list.applyNumbering
layout.fitText
image.replace
image.generateAndReplace
object.deleteTextBoxByText
```

DOCX-only local commands:

```text
setDocumentMetadata
defineStyle
setPageSetup
setHeaderFooter
insertFootnote
insertText
replaceText
deleteRange
appendParagraph
applyStyle
setRunStyle
setParagraphStyle
table.create
createTable
setCellText
```

HWPX-only local command:

```text
object.deleteTextBoxByText
```

HWPX local utility does not currently expose stable `table.create` through `HwpxApiSession.apply`. HWPX table creation exists in lower-level RHWP tests, not as a production-safe local API command.

## Text Commands

Replace one paragraph:

```json
{
  "commandId": "p-title",
  "op": "text.replaceParagraph",
  "location": { "paragraph": { "section": 0, "number": 6 } },
  "text": "2026 report"
}
```

Aliases:

```text
replaceParagraphText
```

Replace a range:

```json
{
  "commandId": "range-1",
  "op": "text.replace",
  "target": { "native": { "section": 0, "para": 6, "offset": 0, "length": 4 } },
  "text": "2026"
}
```

Aliases:

```text
replaceText
```

DOCX legacy insert/delete:

```json
{ "commandId": "insert-1", "op": "insertText", "target": { "range": { "start": { "nodeId": "p_1", "offset": 5 } } }, "text": "..." }
```

```json
{ "commandId": "delete-1", "op": "deleteRange", "target": { "range": { "start": { "nodeId": "p_1", "offset": 5 }, "end": { "nodeId": "p_1", "offset": 9 } } } }
```

## Table Commands

Write one cell:

```json
{
  "commandId": "cell-1",
  "op": "table.writeCell",
  "location": { "tableId": "tbl_2", "cell": { "number": 4 } },
  "text": "18,420"
}
```

Aliases:

```text
setCellText
```

Write one cell with source text style:

```json
{
  "commandId": "rich-cell-1",
  "op": "table.writeRichCell",
  "location": { "tableId": "tbl_2", "cell": { "number": 4 } },
  "styleSource": { "tableId": "tbl_2", "cell": { "number": 3 } },
  "text": "18,420"
}
```

Write many cells:

```json
{
  "commandId": "table-fill-1",
  "op": "table.writeCells",
  "tableId": "tbl_2",
  "fit": true,
  "fitOptions": { "maxLines": 3, "truncate": false },
  "cells": [
    { "cell": { "number": 3 }, "text": "Total count" },
    { "cell": { "number": 4 }, "text": "18,420", "styleSource": { "tableId": "tbl_2", "cell": { "number": 3 } } }
  ]
}
```

Apply or clone outer cell style:

```json
{
  "commandId": "cell-style-1",
  "op": "table.applyCellStyle",
  "target": { "tableId": "tbl_8", "cell": { "number": 0 } },
  "source": { "tableId": "tbl_4", "cell": { "number": 0 } }
}
```

Explicit HWPX-like outer style:

```json
{
  "commandId": "cell-style-2",
  "op": "table.applyCellStyle",
  "target": { "tableId": "tbl_8", "cell": { "number": 0 } },
  "cellStyle": {
    "borderFillIDRef": "11",
    "vertAlign": "CENTER",
    "margin": { "left": "141", "right": "141", "top": "141", "bottom": "141" }
  }
}
```

Explicit DOCX-like table creation:

```json
{
  "commandId": "table-create-1",
  "op": "table.create",
  "rows": 5,
  "cols": 2,
  "cellStyle": {
    "width": 4200,
    "borderColor": "#BFBFBF",
    "verticalAlign": "center",
    "margins": { "left": 180, "right": 180, "top": 120, "bottom": 120 }
  }
}
```

Use `table.create` only on DOCX local utility unless HWPX support is explicitly added and tested later.

## Style Commands

Apply source paragraph/run style while optionally changing text:

```json
{
  "commandId": "style-text-1",
  "op": "style.applyText",
  "target": { "tableId": "tbl_2", "cell": { "number": 4 } },
  "styleSource": { "tableId": "tbl_2", "cell": { "number": 3 } },
  "text": "18,420"
}
```

Apply source paragraph/run style without changing text:

```json
{
  "commandId": "paragraph-style-1",
  "op": "paragraph.applyStyle",
  "target": { "paragraph": { "section": 0, "number": 6 } },
  "source": { "paragraph": { "section": 0, "number": 5 } }
}
```

Clone style alias:

```json
{
  "commandId": "style-clone-1",
  "op": "style.clone",
  "source": { "tableId": "tbl_4", "cell": { "number": 0 } },
  "target": { "tableId": "tbl_8", "cell": { "number": 0 } }
}
```

HWPX explicit paragraph style IDs:

```json
{
  "commandId": "style-ids-1",
  "op": "paragraph.applyStyle",
  "target": { "tableId": "tbl_2", "cell": { "number": 4 } },
  "styleIds": { "paraPrIDRef": "12", "styleIDRef": "0", "charPrIDRef": "9" }
}
```

Only use explicit IDs if they came from the same document's `read-json`, `target/inspect`, or local utility methods. Do not invent IDs.

DOCX legacy named style:

```json
{
  "commandId": "named-style-1",
  "op": "applyStyle",
  "target": { "range": { "start": { "nodeId": "p_1", "offset": 0 } } },
  "styleId": "Heading1"
}
```

## List Commands

Write bullet text:

```json
{
  "commandId": "bullets-1",
  "op": "list.writeBullets",
  "location": { "tableId": "tbl_1", "cell": { "number": 5 } },
  "marker": "-",
  "items": ["first", "second"],
  "styleSource": { "tableId": "tbl_1", "cell": { "number": 5 } }
}
```

Write numbered text:

```json
{
  "commandId": "numbering-1",
  "op": "list.applyNumbering",
  "location": { "tableId": "tbl_1", "cell": { "number": 5 } },
  "startAt": 3,
  "suffix": ")",
  "items": ["alpha", "beta"],
  "styleSource": { "tableId": "tbl_1", "cell": { "number": 5 } }
}
```

Aliases:

```text
list.write
paragraph.applyNumbering
```

Current behavior:
- Writes visible list text.
- May clone source paragraph style.
- Does not guarantee native numbering-definition creation for HWPX.

## Layout Commands

Fit text without saving:

```json
{
  "commandId": "fit-1",
  "op": "layout.fitText",
  "location": { "tableId": "tbl_1", "cell": { "number": 5 } },
  "text": "long text...",
  "options": { "maxCharsPerLine": 24, "maxLines": 3, "truncate": false }
}
```

Response result includes:

```json
{
  "fit": {
    "text": "possibly wrapped text",
    "changed": true,
    "truncated": false,
    "lineCount": 3
  }
}
```

To write fitted text, either:
- call `layout.fitText`, then write the returned `fit.text`; or
- set `fit: true` / `fitOptions` on `table.writeCell` or `table.writeCells`.

## Object And Image Commands

Inventory:

`POST /v1/{format}/documents/{id}/object/inventory`

Response:

```json
{
  "images": [{ "name": "BinData/image1.PNG", "byteLength": 156855 }],
  "pictures": [],
  "charts": []
}
```

Replace an existing package image:

```json
{
  "commandId": "image-replace-1",
  "op": "image.replace",
  "imageName": "BinData/image1.PNG",
  "bytesBase64": "..."
}
```

Accepted byte sources:

```text
bytes
bytesBase64
filePath
```

Aliases:

```text
object.replaceImage
chart.replaceImage
```

Generate a simple PNG and replace an existing PNG entry:

```json
{
  "commandId": "chart-image-1",
  "op": "image.generateAndReplace",
  "imageName": "BinData/image1.PNG",
  "generator": {
    "width": 900,
    "height": 520,
    "background": "#ffffff",
    "accent": "#2f5fbd",
    "values": [
      { "value": 4, "color": "#2f5fbd" },
      { "value": 9, "color": "#d95f02" }
    ]
  }
}
```

Aliases:

```text
object.generateAndReplace
chart.generateAndReplace
```

HWPX-only remove text box/shape by text:

```json
{
  "commandId": "remove-template-guide",
  "op": "object.deleteTextBoxByText",
  "section": 0,
  "texts": ["template guide text"]
}
```

Aliases:

```text
object.deleteByText
shape.deleteByText
```

Chart rule:
- If `objectGraph.charts` is empty and `objectGraph.images` contains PNGs, chart-looking content is embedded as images.
- In that case use `image.replace` or `image.generateAndReplace`.
- Do not call a chart-data API unless the document actually exposes chart objects later.

## DOCX Package Commands

DOCX-only metadata:

```json
{
  "commandId": "meta-1",
  "op": "setDocumentMetadata",
  "title": "API-only Journal Manuscript",
  "creator": "local automation API"
}
```

DOCX-only style definition:

```json
{
  "commandId": "style-def-1",
  "op": "defineStyle",
  "style": {
    "styleId": "JournalHeading1",
    "name": "Journal Heading 1",
    "type": "paragraph",
    "basedOn": "Normal",
    "paragraphStyle": { "spacingBefore": 240, "spacingAfter": 120 },
    "runStyle": { "bold": true, "textColor": "#1F4E79", "fontSize": 14 }
  }
}
```

DOCX-only page setup:

```json
{
  "commandId": "page-setup-1",
  "op": "setPageSetup",
  "width": 11906,
  "height": 16838,
  "marginTop": 1440,
  "marginBottom": 1440,
  "marginLeft": 1440,
  "marginRight": 1440
}
```

DOCX-only header/footer:

```json
{
  "commandId": "header-1",
  "op": "setHeaderFooter",
  "header": "Double-anonymized submission"
}
```

DOCX-only footnote:

```json
{
  "commandId": "footnote-1",
  "op": "insertFootnote",
  "target": { "range": { "start": { "nodeId": "p_2", "offset": 10 } } },
  "text": "Inserted through API-only automation."
}
```

## Page Images

Single page:

`POST /v1/{format}/documents/{id}/pages/render-page`

```json
{ "page": 1 }
```

All or selected pages:

`POST /v1/{format}/documents/{id}/pages/render-all`

```json
{ "pages": [1, 2, 3] }
```

Target production image contract:

```json
{
  "format": "webp",
  "quality": 20,
  "maxWidth": 1700,
  "maxHeight": 1700,
  "background": "white",
  "metadata": "stripped"
}
```

Current local bridge response for HWPX:

```json
{
  "renderer": "rhwp-svg",
  "page": { "page": 1, "format": "svg", "nonBlank": true, "svg": "<svg>...</svg>" },
  "pages": []
}
```

Current local bridge response for DOCX:

```json
{
  "page": { "page": 1, "format": "structure-only", "nonBlank": true },
  "warnings": [{ "code": "docx-render-not-wired" }]
}
```

Production server must provide real WebP bytes or stable byte references for both formats.

## Save

`POST /v1/{format}/documents/{id}/documents/save-source`

Request:

```json
{
  "baseRevision": 4,
  "filename": "edited.hwpx",
  "outputPath": "C:/absolute/local/path/edited.hwpx",
  "return": "bytesRef"
}
```

Local response:

```json
{
  "ok": true,
  "revision": 4,
  "bytesRef": "C:/absolute/local/path/edited.hwpx",
  "sha256": "64hex",
  "validation": {}
}
```

HWPX save mode:
- Default is preserve-package.
- Preserve-package keeps the original HWPX ZIP and patches only addressed XML/package entries.
- Reason: raw RHWP `exportHwpx()` historically changed complex sample structure even on no-edit export.

DOCX save validation:
- Internal reopen is not enough.
- For deliverables, run Word open/export and inspect rendered page PNGs.

## PDF Export

Required production API:

`POST /v1/{format}/documents/{id}/documents/export-pdf`

```json
{ "pages": "all" }
```

Current local bridge:

```json
{ "ok": false, "status": 501, "message": "PDF export is not exposed by the local API bridge yet." }
```

Current local DOCX validation command:

```powershell
npm.cmd run docx:validate:render
```

This command creates PDFs and PNGs under:

```text
output/docx-review/rendered/*/*.pdf
output/docx-review/rendered/*/page-*.png
```

## Quality

`POST /v1/{format}/documents/{id}/quality/check`

Response:

```json
{
  "ok": true,
  "stable": true,
  "pageCount": 10,
  "tableCount": 15,
  "paragraphCount": 85,
  "objectSummary": { "imageCount": 7, "pictureCount": 7, "chartCount": 0 },
  "targetSummary": { "paragraphTargets": 85, "cellTargets": 269 },
  "issues": [],
  "warnings": {},
  "report": {}
}
```

Use `quality/check` after every command batch. If `ok=false`, do not save as final output unless the user explicitly accepts the issue.

`POST /v1/{format}/documents/{id}/quality/render-compare`

Purpose:
- Detect blank pages, unexpected page count changes, object loss, overflow risk, and visual drift.

Current local behavior:
- HWPX returns SVG pages plus structural quality.
- DOCX returns structural quality with render warning.
- Production must perform actual image comparison using the WebP render pipeline.

## Format-Specific Local Coverage

HWPX local utility supports:

```text
readJson
analyze
targetMap
inspectTarget
resolveText
fitText
styleFingerprint
paragraphStyleIds
cellOuterStyle
objectInventory
apply
qualityCheck
save
```

HWPX supported shared commands:

```text
text.replaceParagraph
text.replace
table.writeCell
table.writeCells
table.writeRichCell
table.applyCellStyle
style.applyText
paragraph.applyStyle
style.clone
list.writeBullets
list.applyNumbering
layout.fitText
image.replace
image.generateAndReplace
object.deleteTextBoxByText
```

DOCX local utility supports:

```text
readJson
analyze
targetMap
inspectTarget
resolveText
fitText
styleFingerprint
paragraphTemplateXml
cellOuterStyle
objectInventory
apply
qualityCheck
save
```

DOCX supported shared and package commands:

```text
setDocumentMetadata
defineStyle
setPageSetup
setHeaderFooter
insertFootnote
text.replaceParagraph
text.replace
insertText
replaceText
deleteRange
appendParagraph
applyStyle
setRunStyle
setParagraphStyle
table.create
createTable
table.writeCell
setCellText
table.writeCells
table.writeRichCell
table.applyCellStyle
style.applyText
paragraph.applyStyle
style.clone
list.writeBullets
list.applyNumbering
layout.fitText
image.replace
image.generateAndReplace
```

## Required Local Verification Commands

Syntax and shared API:

```powershell
npm.cmd run test:common-api
```

Format utilities:

```powershell
npm.cmd run test:docx-api
npm.cmd run test:hwpx-api
```

Runtime and gateway:

```powershell
npm.cmd run test:runtime
npm.cmd run dev:check
```

DOCX sample and visual validation:

```powershell
npm.cmd run docx:author:samples
npm.cmd run docx:validate:render
```

HWPX sample authoring:

```powershell
npm.cmd run hwpx:fill:esg
npm.cmd run hwpx:author:sample
```

Known acceptable HWPX warning:

```text
LinesegTextRunReflow
```

Meaning: HWPX line segment layout may be recomputed by Hancom/RHWP. It is a warning when structure, page count, tables, objects, and reopen checks pass.

## Minimal LLM Playbooks

Modify existing table form:

```text
1. open
2. read-json
3. find the table/cell by text or editableTargets
4. target/inspect each target cell
5. choose styleSource from nearby filled cell
6. commands/apply table.writeRichCell or table.writeCells
7. quality/check
8. save-source
9. render/validate if deliverable
```

Modify paragraph while preserving style:

```text
1. open
2. read-json
3. target/find query
4. target/inspect returned location
5. commands/apply style.applyText with styleSource = current or nearby paragraph
6. quality/check
7. save-source
```

Replace image/chart-like object:

```text
1. open
2. object/inventory
3. choose exact imageName
4. commands/apply image.replace or image.generateAndReplace
5. quality/check
6. render/validate
7. save-source
```

Reject unsafe edit:

```text
If target/find returns ambiguous or target/inspect does not match the intended paragraph/cell/object, do not write. Request a better selector or use read-json to derive a precise location.
```
