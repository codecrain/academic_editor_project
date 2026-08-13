# Document Editor API v1

Audience: an LLM agent with no prior project context.

## MCP Transport

The production agent integration uses the Streamable HTTP endpoint `POST /mcp`
with JSON-RPC 2.0. Call `tools/list` to discover the compact schemas instead of
placing this full API document in every model context. The MCP broker delegates
to the same `/v1/docx`, `/v1/hwpx`, and `/v1/pdf` implementations; it does not duplicate
document editing logic.

DOCX MCP tools:

- `editor_docx_open`
- `editor_docx_discard` (close an abandoned session without creating an artifact)
- `editor_docx_read_json`
- `editor_docx_target_map`
- `editor_docx_target_find`
- `editor_docx_target_inspect`
- `editor_docx_object_inventory`
- `editor_docx_command_catalog`
- `editor_docx_apply`
- `editor_docx_render_pages`
- `editor_docx_quality_check`
- `editor_docx_export_pdf`
- `editor_docx_save_source`
- `editor_docx_save_checkpoint`
- `editor_docx_artifact_read` (application-side binary handoff)
- `editor_docx_artifact_delete` (delete a handed-off DOCX/PDF artifact)
- `editor_docx_prepare_review` (creates the candidate DOCX and tracked-review DOCX for approval; it closes the edit session)

DOCX additionally supports `references` through its DOCX-specific command catalog.

HWPX MCP tools:

- `editor_hwpx_open`
- `editor_hwpx_inspect` (`summary`, `outline`, `styles`, `target`, `objects`, `template`, `page`, `quality`, `catalog`, `search`, `fields`, `security`, `history`, `capabilities`)
- `editor_hwpx_edit`
- `editor_hwpx_review`
- `editor_hwpx_save` (`verified` or recovery-only `checkpoint`)
- `editor_hwpx_export_pdf`
- `editor_hwpx_discard`
- `editor_hwpx_artifact_read`
- `editor_hwpx_artifact_delete`

PDF MCP tools:

- `editor_pdf_open`
- `editor_pdf_discard`
- `editor_pdf_read_json`
- `editor_pdf_target_map`
- `editor_pdf_target_find`
- `editor_pdf_target_inspect`
- `editor_pdf_object_inventory`
- `editor_pdf_command_catalog`
- `editor_pdf_apply`
- `editor_pdf_render_pages`
- `editor_pdf_quality_check`
- `editor_pdf_export_pdf`
- `editor_pdf_save_source`
- `editor_pdf_save_checkpoint`
- `editor_pdf_artifact_read`
- `editor_pdf_artifact_delete`

`editor_docx_command_catalog`, `editor_hwpx_inspect(view="catalog")`, and
`editor_pdf_command_catalog` are the machine-readable sources of truth. They
currently expose 31 DOCX commands, 48 HWPX commands, and 46 PDF commands.
HWPX command entries report
`readiness` separately from `execution`; canonical commands that are not ready
are rejected before mutation. Agents should query the applicable
catalog by category or operation before the first apply. The broker validates
every apply against that catalog before the document session can mutate.

### HWPX canonical lifecycle

HWPX uses one public flow: `open → inspect → edit → review → save`.
`inspect(styles)`
reports measured paragraph and character properties, indentation, outline
levels, frequency, and examples without inferring protected regions or heading
roles from text. `edit` accepts canonical catalog commands and applies the whole
batch atomically. `inspect(search|fields|security|history|capabilities)` folds
text discovery, form-field targeting, security evidence, mutation provenance,
and live capability discovery into that same lifecycle. `review` renders all
pages by default and treats actual glyphs outside table-cell clip rectangles as
blocking errors. Estimated capacity and blank-page findings remain warnings
because they can be intentional.

The broker enforces exact revisions, command-specific inspection or object
inventory preconditions, and a quality check before finalization or PDF
export. Error-severity findings always block. DOCX new or worsened capacity
warnings also block; HWPX warnings remain visible for review but do not by
themselves block a structurally valid package.

### Concurrency and response compatibility

The REST and MCP contracts remain request/response APIs. A caller waits for the
same success or error response as before; no job ID, polling endpoint, socket,
or callback is required. Internally, document session work is assigned to a
stable CPU worker lane. Operations for one `documentId` remain ordered, while
operations for different documents can execute on different lanes at the same
time. This prevents synchronous package, WASM, and PDF work from blocking the
gateway event loop globally.

`EDITOR_SESSION_WORKERS` may override the number of worker lanes. Its default
is the host's available CPU parallelism. It controls server execution resources
and does not impose a fixed user, connection, or document limit. DOCX browser
collaboration continues through the separate local Collabora/WOPI runtime and
does not change this API contract.

Every `tools/call` argument object is validated against the schema returned by
`tools/list` before the tool executes. Each format's `open` requires top-level
`filename` plus exactly one byte source. DOCX accepts `bytesBase64`, `bytesRef`,
or the `storedDocumentId` returned by `/api/documents`; HWPX and PDF accept
`bytesBase64` or `bytesRef`. The nested REST shape `{source:{...}}` is invalid
for MCP and never opens a sample or fallback document.
`save_source` returns `artifactId`, package
SHA-256, and visible-text SHA-256. It never exposes the server-local path.
If work is cancelled or cannot pass quality checks, call the matching
`editor_docx_discard` or `editor_hwpx_discard` with the open `documentId` and
its current `baseRevision`. It
removes the isolated session and its inspection, inventory, quality, and lock
state without saving or creating an artifact. The call is idempotent: an
already-closed session still returns `status=completed` with `deleted=false`.

### Bounded MCP reads

MCP never returns the raw `readJson()` graph or the legacy duplicated target
map. Those objects can grow to megabytes on a real paper. Use these paged
projections instead:

```json
{
  "name": "editor_hwpx_inspect",
  "arguments": {
    "documentId": "doc_...",
    "view": "outline",
    "limit": 40
  }
}
```

HWPX `view` is `summary`, `outline`, `styles`, `target`, `objects`, `template`,
`page`, `quality`, `catalog`, `search`, `fields`, `security`, `history`, or `capabilities`. Ordered and style views use revision-bound opaque
cursors and return exact locations plus measured style/layout facts. DOCX and
PDF retain their format-specific paged read projections.

For submission documents, call `editor_hwpx_review` with
`profile="submission"`. This keeps the same nine-tool lifecycle while adding
unresolved-field, instruction-region, dummy-identifier, required-blank,
floating-image, sparse-page, content-bound, and occupancy evidence. Template
suggestions are advisory; explicit `templatePolicy` roles remain authoritative.

Every read page has this envelope:

```json
{
  "ok": true,
  "revision": 1,
  "view": "blocks",
  "total": 604,
  "returned": 24,
  "nextCursor": "v1.opaque.integrity-protected",
  "textPreviewChars": 200,
  "items": []
}
```

For table pages the envelope also includes `cellPreviewLimit`. An item whose
own compact projection cannot fit the response budget is returned atomically
with `oversizedItem=true`; the server never splits one target or table across
pages.

For DOCX, the page count in `open`, `summary`, and `quality_check` is a
paragraph-heuristic estimate (`pageCountEstimate` / `pageCountIsEstimate=true`).
Only `editor_docx_render_pages` and `editor_docx_export_pdf` return an
authoritative renderer page count. Do not use an estimate for final page
coverage or user-visible pagination.

Target enumeration is a separate one-kind stream:

```json
{
  "name": "editor_docx_target_map",
  "arguments": {
    "documentId": "doc_...",
    "kind": "cell",
    "tableId": "tbl_3",
    "limit": 60
  }
}
```

`kind` is `paragraph` (default) or `cell`, `limit` is `1..120`, and `tableId`
is an optional filter valid only for cells. The response is
`{ok,revision,kind,tableId,total,returned,nextCursor,targets}`. It deliberately
does not repeat targets under `editableTargets` or `locations` aliases.

To fetch the next page, send only `documentId` and `cursor` set to the returned
`nextCursor`.
The integrity-protected cursor fixes the document, revision, stream, options,
and offset. Repeating the same cursor is safe. Changing options while following
a cursor returns `cursor_query_mismatch`; tampering returns `invalid_cursor`;
using it after any successful apply returns `stale_cursor`. Start again without
a cursor after a revision change. The gateway budgets the structured page near
9 KiB so the MCP response containing both text and structured content remains
near or below 24 KiB at item boundaries.

The direct `/v1/docx/...`, `/v1/hwpx/...`, and `/v1/pdf/...` `documents/read-json` and
`target/map` routes keep
their legacy unpaged response for trusted non-MCP callers. New agent code must
use the bounded MCP tools; the internal bounded projection marker is not a
public REST contract.

This file is the contract for API-only editing of DOCX, HWPX, and PDF documents. It is not a UI automation guide. Do not click editor iframes, do not infer from screen coordinates, and do not edit by vague text alone. PDF support includes additive content, transactional page composition, metadata, attachments, flattening, encryption, and final digital signing. It does not claim arbitrary reflow of existing PDF text or replacement of arbitrary source image objects.

## Runtime Boundary

Formats:
- DOCX API prefix: `/v1/docx/...`
- HWPX API prefix: `/v1/hwpx/...`
- PDF API prefix: `/v1/pdf/...`

Local implementation files:
- Shared LLM/API contract: `editor_common/document-api-core.mjs`
- Shared contract tests: `editor_common/document-api-core.test.mjs`
- Cross-format command contract tests: `editor_common/editor-api-command-contract.test.mjs`
- DOCX API utility: `editor_docx/scripts/docx-api-utils.mjs`
- DOCX UNO renderer: `editor_docx/scripts/docx-renderer.mjs` and `render-docx-uno.py`
- HWPX API utility: `editor_hwpx/scripts/hwpx-api-utils.mjs`
- PDF API utility: `editor_pdf/scripts/pdf-api-utils.mjs`
- Canonical API bridge/gateway: `editor_server/editor-gateway.mjs`
- Compatibility launch path: `editor_docx/scripts/editor-gateway.mjs`

Engine split:
- DOCX browser editing remains on the DOCX/WOPI editor path.
- HWPX browser editing remains on the RHWP/HWPX path.
- PDF browser editing remains on the PDF.js/PDF overlay path.
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

`resolveText` accepts `caseSensitive`, `occurrence`, `includeCells`, the
optional `kind` filter (`paragraph` or `cell`), and `exact: true` to match a
whole paragraph or cell value instead of a substring. Use `kind: "cell"` when
the same visible text also occurs in a body paragraph.

## Non-Negotiable Agent Algorithm

For legacy DOCX/PDF edit surfaces:

```text
open -> read-json -> command-catalog -> target-map/find -> inspect -> apply -> quality/check -> render/compare -> save/export
```

HWP/HWPX uses the compact canonical lifecycle:

```text
open -> inspect(summary/outline/styles/catalog/target|objects) -> edit -> review(all pages) -> save(verified)
```

On cancellation or unrecoverable failure, replace `save/export` with the
matching format's `discard` tool so the isolated server session is released
immediately.

Rules:
- Never write before `read-json`.
- Never write to a text match before `target/inspect` confirms the exact paragraph/cell/object.
- Inspect every target and style source required by the selected catalog operation; inspecting a different target at the same revision does not authorize it.
- Prefer exact table `cell.number` / `cellIndex`; use row/column only when no merge ambiguity exists.
- Preserve style by choosing a nearby `styleSource` from `read-json` or `target/inspect`.
- Use `table.writeCell` or `table.writeCells` with `fit: true` before writing long HWP/HWPX cell text.
- Treat append-only generation as insufficient when the task asks to modify an existing document.
- After each write batch, run `quality/check`.
- For user-visible DOCX output, validate actual WebP pages; use baseline comparison for layout-affecting changes.
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
POST /v1/{format}/documents/{id}/commands/catalog
POST /v1/{format}/documents/{id}/commands/apply
POST /v1/{format}/documents/{id}/quality/check
POST /v1/{format}/documents/{id}/quality/render-compare
POST /v1/{format}/documents/{id}/pages/render-page
POST /v1/{format}/documents/{id}/pages/render-all
POST /v1/{format}/documents/{id}/documents/save-source
POST /v1/{format}/documents/{id}/documents/save-checkpoint
POST /v1/{format}/documents/{id}/documents/discard
POST /v1/{format}/documents/{id}/documents/export-pdf
```

Known local bridge gaps:
- HWPX page rendering returns RHWP SVG payloads. WebP rasterization is not
  part of the current HWPX API.
- DOCX PDF uses isolated Collabora UNO. HWPX PDF uses the source-built RHWP
  native CLI in an isolated request-owned Docker container.

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
export with body.type=pdf                     -> documents/export-pdf
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

Persisted Academic Editor DOCX source:

```json
{
  "filename": "document.docx",
  "source": {
    "storedDocumentId": "12345678-1234-4234-8234-123456789abc"
  }
}
```

`storedDocumentId` is DOCX-only. It reads the existing authenticated
`/api/documents` working copy inside the gateway, so an application does not
download that DOCX and upload the same bytes again. The MCP equivalent uses
top-level `filename` and `storedDocumentId` arguments.

Response:

```json
{
  "ok": true,
  "documentId": "doc_uuid",
  "sessionId": "doc_uuid",
  "fmt": "hwpx",
  "revision": 1,
  "pageCount": 10,
  "capabilities": ["json", "targetMap", "targetInspect", "objectInventory", "commands", "save", "quality", "renderPage", "exportPdf"]
}
```

Production note: prefer a persisted DOCX `storedDocumentId` when the file is
already in the Academic Editor document store. Otherwise use application-side
bytes. Do not expose server filesystem paths to external clients.

## Read JSON

`POST /v1/{format}/documents/{id}/documents/read-json`

Current shared response shape:

```json
{
  "revision": 1,
  "sourceFormat": "hwpx",
  "pageCount": 10,
  "sections": [
    {
      "id": "sect_0",
      "section": 0,
      "boundary": { "kind": "paragraph", "paragraph": 25 },
      "paragraphStart": 0,
      "paragraphEnd": 25,
      "pageSetup": {
        "width": 11906,
        "height": 16838,
        "orientation": "portrait",
        "margins": { "top": 1440, "right": 1440, "bottom": 1440, "left": 1440 }
      },
      "type": "nextPage",
      "columns": { "count": 1, "space": null, "equalWidth": true }
    }
  ],
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
  "integrityGraph": {
    "bookmarkStarts": 2,
    "bookmarkEnds": 2,
    "commentReferences": 1,
    "footnoteReferences": 0,
    "endnoteReferences": 0,
    "fieldCharacters": 4,
    "hyperlinks": 3
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

Currently both DOCX and HWPX utilities also return `sections`, `styleGraph`, `layoutGraph`, and `warnings`; callers should use them when present but must not use them as the only target source. DOCX `sections[]` is derived from every native `w:sectPr`, including paragraph-owned section breaks and the final body section. Its zero-based `section`, boundary, page size, orientation, margins, section type, and column settings are preserved separately, so a mixed portrait/landscape document must not be reconstructed as one page setup. DOCX additionally returns `integrityGraph` counters for zero-width structures and references such as bookmarks, comments, notes, fields, and hyperlinks.

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

For the MCP `editor_hwpx_inspect(view="target")` tool, always send the
canonical `locations` array, including for one target. The HTTP route below
also accepts its legacy single `location` shortcut; that shortcut is not an
MCP argument and must not be used with the MCP client.

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

`baseRevision` is mandatory. The REST bridge and MCP broker use the same
revision-bound precondition state. A mismatch is rejected with HTTP 409 and
`code=stale_revision` before any mutation.

Every command whose catalog precondition is `target_inspect` requires all exact
targets and style sources to have been inspected at the same revision. Image
and object commands require `objects` inspection at the same revision, and
`field.setValues` requires `fields` inspection. The corresponding failures are
`inspection_required`, `object_inventory_required`, and
`field_inventory_required`. A successful apply advances the revision exactly
once and clears inspection, inventory, field-inventory, and quality state.

Accepted array key aliases:

```text
commands
ops
```

HWPX command identity:
- Use a stable `commandId` in every MCP edit command.
- Use the exact canonical `op` returned by `editor_hwpx_inspect(view="catalog")`.
- Alternate command names, punctuation-normalized spellings, and grouped action envelopes are rejected.

Command fields are operation-specific:

```json
{
  "commandId": "stable-id",
  "op": "table.writeCell",
  "location": {},
  "text": "...",
  "styleSource": {}
}
```

HWP/HWPX commands accept only the exact fields published for that operation by
`editor_hwpx_inspect(view="catalog")`. Unknown fields, spelling variants, and
cross-operation aliases fail before mutation. In particular, use `location`
for commands that publish `location`, `target` for commands that publish
`target`, and `styleSource` wherever that exact field is published.

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

Shared canonical commands include:

```text
text.replaceParagraph
text.replace
table.writeCell
table.writeCells
table.applyCellStyle
style.applyText
image.replace
image.generateAndReplace
```

DOCX and HWPX both expose these canonical structural operations, although
their target and option shapes remain format-specific:

```text
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
table.insertCaption
insertTableCaption
image.insertAfterParagraph
setCellText
```

HWPX-only local commands:

```text
field.setValues
text.insertAfterParagraph
text.replaceTracked
text.deleteParagraphs
table.insertRows
table.setSize
table.setCellSize
image.cloneToCell
object.replaceTextBoxText
object.deleteTextBoxByText
```

The HWPX catalog has 38 canonical entries and all currently report
`readiness=available`. Commands promoted beyond the published RHWP wrapper use
qualified package-preserving or structural adapters and must pass mutation,
package qualification, export, reopen, and operation-specific postconditions.
Entries report the actual path in `execution`; values such as
`structural-adapter` describe implementation, not a missing capability.
`appendParagraph` instead reports `execution=preserve-package-adapter` so it
can clone inspected paragraph and run style IDs exactly while still passing
package qualification and reopen verification.

Runtime artifact validation statically compares the `HwpDocument` method
surface in `rhwp.d.ts` with the executable `rhwp.js` wrapper. It does not
initialize WASM or introspect live WASM exports, so method presence alone is not
semantic readiness. The 38-operation set is additionally gated by pinned
installed-artifact and adapter tests that require the applicable mutation,
package qualification, export, reopen, and operation-specific postconditions.

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

For DOCX paragraphs whose `target_inspect` result contains more than one run, preserve every run explicitly with `segments`. Provide one segment per inspected run in the same order. Each segment copies the exact run properties from `sourceRun`, and all segment text must concatenate exactly to `text`:

```json
{
  "commandId": "p-abstract",
  "op": "text.replaceParagraph",
  "location": { "paragraph": { "section": 0, "number": 14 } },
  "text": "Revised lead. Revised remainder.",
  "segments": [
    { "sourceRun": 0, "text": "Revised lead." },
    { "sourceRun": 1, "text": " Revised remainder." }
  ]
}
```

DOCX rejects a multi-run paragraph replacement without complete `segments` instead of silently flattening its structure or formatting. Single-run paragraph replacement remains unchanged.

DOCX compatibility alias (not accepted by HWP/HWPX):

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

DOCX compatibility alias (not accepted by HWP/HWPX):

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

DOCX compatibility alias (not accepted by HWP/HWPX):

```text
setCellText
```

Write one cell with source text style:

```json
{
  "commandId": "rich-cell-1",
  "op": "table.writeCell",
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
  "styleSource": { "tableId": "tbl_4", "cell": { "number": 0 } }
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

HWPX `table.create` is available through the structural adapter and requires an
inspected paragraph `target`, `rows`, and `columns`; query the HWPX catalog for
its format-specific optional width, height, and cell text fields.
`table.insertCaption` is also available through the qualified HWPX adapter;
inspect its target and query the HWPX catalog for the format-specific payload.

On success, the matching `results` item returns `tableId`, `target`, and exact `dimensions` (`rowCount`, `colCount`, `cellCount`). Use that returned `tableId` for all subsequent `target_map`, `target_inspect`, and cell-write calls; do not guess `tbl_0` or select an older table by position.

Insert a caption immediately before an existing DOCX table without moving or rewriting it:

```json
{
  "commandId": "table-caption-2",
  "op": "table.insertCaption",
  "tableId": "tbl_22",
  "text": "Table 2. Controlled evaluation matrix",
  "paragraphStyle": { "styleId": "FollowupCaption" },
  "runStyle": { "bold": true }
}
```

Use the exact `tableId` returned by `target_map` or `table.create`. The caption is a normal Word paragraph placed directly before that table and participates in normal style, quality-check, render, and save flows.

When the gateway binds beyond loopback, `ACADEMIC_EDITOR_MCP_BEARER_TOKEN` is required. The same token authenticates `/mcp` and `/api/documents`; WOPI session signatures remain separate. Loopback-only development may omit the server-to-server token.

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
  "op": "style.applyText",
  "target": { "paragraph": { "section": 0, "number": 6 } },
  "styleSource": { "paragraph": { "section": 0, "number": 5 } }
}
```

DOCX legacy named style:

```json
{
  "commandId": "named-style-1",
  "op": "applyStyle",
  "target": { "range": { "start": { "nodeId": "p_1", "offset": 0 } } },
  "styleId": "Heading1"
}
```

## List formatting boundary

Native list hierarchy is controlled through inspected paragraph properties and
style operations. Visible bullet characters alone are text content and do not
constitute a numbering definition. Every list mutation must preserve and verify
the native numbering identity after reopen.

## Layout Commands

DOCX retains the read-only `layout.fitText` command:

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

For HWP/HWPX, fitting is part of the actual cell write: set `fit: true` and
`fitOptions` on `table.writeCell` or `table.writeCells`. This keeps the HWPX
`edit` lifecycle mutation-only and returns fit evidence with the write receipt.

## Object And Image Commands

Inventory:

`POST /v1/{format}/documents/{id}/object/inventory`

Response:

```json
{
  "images": [{ "name": "BinData/image1.PNG", "byteLength": 156855, "mimeType": "image/png" }],
  "pictures": [{ "id": "pic_0", "name": "BinData/image1.PNG", "native": { "section": 0, "paragraph": 3, "control": 0 } }],
  "shapes": [{ "id": "shape_0", "text": "Approval", "native": { "section": 0, "paragraph": 7, "control": 1 } }],
  "textBoxes": [{ "id": "textbox_0", "text": "Approval", "shapeId": "shape_0" }],
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

Canonical HWPX image sources:

```text
bytesBase64
assetRef={documentId,imageName}
```

Server-local `filePath` and in-process `bytes` are implementation details and
are not accepted by the public HWPX command catalog.

The replacement bytes must have a complete PNG, JPEG, GIF, BMP, EMF, or WMF
signature matching the existing package filename extension. An optional
`mimeType` must agree with both. Corrupt, truncated, or extension-mismatched
media fails the entire atomic command batch. `image.generateAndReplace` always
produces PNG and therefore only accepts a `.png` package target.

Insert a new DOCX image after an inspected paragraph without requiring an
existing package image or placeholder:

```json
{
  "commandId": "image-insert-1",
  "op": "image.insertAfterParagraph",
  "location": { "paragraph": { "section": 0, "number": 3 } },
  "bytesBase64": "...",
  "mimeType": "image/png",
  "widthEmu": 5486400,
  "heightEmu": 3086100,
  "altText": "Research methodology framework",
  "caption": "Figure 1. Research methodology framework."
}
```

The command creates a unique `word/media` package entry, document relationship,
and drawing ID, then optionally inserts a caption paragraph. Its precondition is
`target_inspect`; callers should calculate positive EMU dimensions before apply.

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

HWPX-only exact visible-text replacement or deletion for text boxes:

```json
{
  "commandId": "replace-template-guide",
  "op": "object.replaceTextBoxText",
  "replacements": [{ "find": "template guide text", "replaceWith": "Final note" }]
}
```

`object.deleteTextBoxByText` accepts `texts` with the same exact-match rule.
Every selector must match at least one inventoried text box or the atomic batch
fails with `HWPX_TEXTBOX_NOT_FOUND`.

Chart rule:
- If `objectGraph.charts` is empty and `objectGraph.images` contains PNGs, chart-looking content is embedded as images.
- In that case use `image.replace` or `image.generateAndReplace`.
- Do not call a chart-data API unless the document actually exposes chart objects later.

## Package Commands

The following examples show DOCX payload shapes. HWPX exposes the matching
metadata, style, page setup, header/footer, and footnote operations with
format-specific schemas; query `editor_hwpx_inspect(view="catalog")` before applying
them.

DOCX metadata example:

```json
{
  "commandId": "meta-1",
  "op": "setDocumentMetadata",
  "title": "API-only Journal Manuscript",
  "creator": "local automation API"
}
```

DOCX style definition example:

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

DOCX page setup example:

```json
{
  "commandId": "page-setup-1",
  "op": "setPageSetup",
  "section": 1,
  "width": 16838,
  "height": 11906,
  "orientation": "landscape",
  "margins": {
    "top": 1440,
    "bottom": 1440,
    "left": 1440,
    "right": 1440
  }
}
```

`section` is the zero-based native DOCX section index returned by `read-json`.
It defaults to `0` for backward compatibility and may be `"all"` only when the
caller intentionally wants the same page setup on every section. Omitting it
must never be used to rebuild a document whose `sections[]` contains different
page sizes or orientations.

When `qualityCheck({ baselineJson })` is run after an ordinary content edit, it
fails closed with `section-layout-changed` if any native section count, page
width/height, orientation, margin, section type, or column setting changed.
Pass `allowSectionLayoutChanges: true` only for a request that explicitly
intends to change page setup; the saved artifact still exposes every section in
the quality and validation reports for independent comparison.

DOCX header/footer example:

```json
{
  "commandId": "header-1",
  "op": "setHeaderFooter",
  "header": "Double-anonymized submission",
  "footer": "Confidential manuscript"
}
```

DOCX footnote example:

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

DOCX image contract:

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
  "page": {
    "page": 1,
    "format": "svg",
    "mimeType": "image/svg+xml",
    "nonBlank": true,
    "svg": "<svg>...</svg>"
  },
  "pages": [
    {
      "page": 1,
      "format": "svg",
      "mimeType": "image/svg+xml",
      "nonBlank": true,
      "svg": "<svg>...</svg>"
    }
  ]
}
```

Current bridge response for DOCX:

```json
{
  "ok": true,
  "renderer": "collabora-uno",
  "pageCount": 3,
  "selectedPages": [1],
  "settings": { "quality": 20, "maxWidth": 1700, "maxHeight": 1700, "background": "white", "metadata": "stripped" },
  "page": { "page": 1, "format": "webp", "mimeType": "image/webp", "sha256": "64hex", "byteLength": 12345, "bytesBase64": "..." },
  "pages": []
}
```

The renderer uses one isolated Collabora profile and returns only after its owned office process and temporary profile are gone.

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
- This limits the qualification surface to the requested mutation and preserves untouched package structure exactly.

DOCX save validation:
- Internal reopen is not enough.
- For deliverables, call page rendering and inspect the actual WebP output before save.

HWPX save validation:
- Reopen the saved bytes through `/v1/hwpx`.
- Compare page, table, image, picture, XML-entry, and binary-entry invariants.
- Render requested baseline/current pages as SVG and report that this does not
  prove Hancom Office pixel parity.

`save-source` requires a clean `quality/check` recorded at the same
`baseRevision`; otherwise it returns HTTP 409 with
`code=quality_check_required`. Use `documents/save-checkpoint` with the current
`baseRevision` only for an explicitly unverified recovery artifact.

## PDF Export

Implemented DOCX and HWPX export API:

`POST /v1/{format}/documents/{id}/documents/export-pdf`

```json
{ "baseRevision": 4, "filename": "edited.pdf" }
```

Response without `outputPath`:

```json
{
  "ok": true,
  "mimeType": "application/pdf",
  "filename": "edited.pdf",
  "pageCount": 3,
  "sha256": "64hex",
  "byteLength": 23456,
  "bytesBase64": "..."
}
```

MCP `editor_docx_export_pdf` and `editor_hwpx_export_pdf` write an opaque
`.pdf` artifact after a quality check with no error-severity issues. The
application-side wrapper reads it, verifies its hash, returns it as a real
model file input, and deletes the temporary artifact.

DOCX uses isolated UNO. HWPX uses the source-built RHWP CLI image:

```powershell
docker build -t academic-rhwp-pdf:latest -f editor_hwpx/docker/pdf/Dockerfile .
```

The HWPX runner accepts only the complete document (`"pages":"all"` or
omitted), verifies native JSON, page count, `%PDF-`, byte length, and SHA-256,
and cleans its unique request container and temporary directory on success,
failure, or timeout.

Optional HWPX PDF runtime settings are
`EDITOR_HWPX_PDF_DOCKER_IMAGE`, `EDITOR_HWPX_PDF_TIMEOUT_MS`, and
`EDITOR_HWPX_PDF_TEMP_ROOT`.

Optional Windows/Word validation command:

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

Request:

```json
{ "baseRevision": 4 }
```

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
Only a clean result authorizes `save-source` and `export-pdf` for that exact
revision. Any subsequent successful apply clears that authorization.

DOCX table-capacity findings are evaluated against the JSON captured when the
isolated session opened. An `empty-table`, `cell-overflow-risk`, or
`cell-line-overflow-risk` warning at the same stable table/cell location is
reported as `severity=info`, `preexisting=true`, and
`baselineSeverity=warning` only when every risk ratio is unchanged or lower.
For DOCX, new or worsened capacity warnings block finalization. DOCX also
compares `integrityGraph` with the session-opening baseline: lost structural
markers or changed start/end balance produce `structural-marker-loss` or
`unbalanced-*` errors. Paragraph and range replacements preserve those
zero-width structures through save and reopen. For HWPX, warnings are returned
for review but do not block when package, object, reopen, and render gates pass.
Errors are never downgraded and always block save/PDF finalization.

`POST /v1/{format}/documents/{id}/quality/render-compare`

Purpose:
- Detect blank pages, unexpected page count changes, object loss, overflow risk, and visual drift.

Current behavior:
- HWPX returns SVG pages plus structural quality.
- DOCX returns structural quality plus labeled baseline/current WebP pages.
- The model must visually compare the labeled page pairs; the gateway does not pretend that matching hashes prove acceptable layout.

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

HWPX canonical commands:

```text
field.setValues
text.replaceParagraph
text.insertAfterParagraph
text.replace
text.replaceTracked
insertText
deleteRange
appendParagraph
text.deleteParagraphs
table.writeCell
table.writeCells
table.applyCellStyle
table.insertRows
table.setSize
table.setCellSize
table.autoFit
table.create
table.insertCaption
table.structure
style.applyText
applyStyle
setRunStyle
setParagraphStyle
format.apply
paragraph.structure
image.replace
image.insertAfterParagraph
image.replaceInCell
image.cloneToCell
image.generateAndReplace
setDocumentMetadata
defineStyle
setPageSetup
setHeaderFooter
insertFootnote
object.deleteTextBoxByText
object.format
object.replaceTextBoxText
```

All 48 HWPX entries currently report `readiness=available` for HWPX sources. For binary HWP,
the same catalog marks package-XML-only commands unavailable. Apply still fails closed
when required target, object, or field inspection, exact revision, or
operation-specific postconditions are missing.
Tracked replacement is limited to one `hp:t` run and must be the only command
in its atomic batch. The API can create the tracked replacement but does not
expose review operations that accept or reject existing tracked changes.

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
text.replaceParagraph
text.replace
text.replaceTracked
insertText
reference.insert
reference.remove
deleteRange
appendParagraph
table.writeCell
table.writeRichCell
table.writeCells
table.applyCellStyle
table.create
table.insertCaption
style.applyText
paragraph.applyStyle
style.clone
applyStyle
setRunStyle
setParagraphStyle
list.writeBullets
list.applyNumbering
layout.fitText
image.replace
image.insertAfterParagraph
image.generateAndReplace
setDocumentMetadata
defineStyle
setPageSetup
setHeaderFooter
insertFootnote
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
npm.cmd run test:pdf-api
```

`test:hwpx-api` runs the catalog, package-policy, structural-command,
tracked-change, tracked-change-probe, API utility, and runtime-readiness suites.
These deterministic checks include package qualification and reopen
verification; they do not constitute Hancom Office interoperability or visual
acceptance evidence.

HWPX native PDF and Hancom acceptance:

```powershell
node --test editor_hwpx/scripts/hwpx-native-pdf.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass `
  -File editor_hwpx/scripts/hancom/Invoke-HwpxAcceptance.ps1 `
  -InputPath <candidate.hwpx> `
  -ResavedPath <hancom-resaved.hwpx> `
  -PdfPath <hancom.pdf> `
  -EvidencePath <evidence.json>
```

The Hancom harness records open/resave/PDF/hash/page evidence and terminates
only the Hwp processes it created.

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

HWPX deterministic editor replay gate:

```powershell
npm.cmd run test:hwpx-evaluation
```

The 20-case runner executes both REST and MCP open/catalog/inspect/apply/
quality/render/save/read/hash/delete workflows for every case and enforces
privacy and exact binary-entry preservation gates. It makes no OpenAI calls.
This command does not run or pass the HWPX Agent. The canonical Agent input,
completion criteria, and claim boundary are defined in
`evaluation/hwpx-agent-final-20-v1/FINAL_VALIDATION.md`.

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
6. commands/apply table.writeCell or table.writeCells
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
