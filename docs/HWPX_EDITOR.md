# HWPX Editor

## Runtime ownership

The HWPX engine is the source-built RHWP Studio under
`editor_hwpx/rhwp-studio`. Its HWPX package adapter and command catalog live
under `editor_hwpx/scripts`. DOCX remains a separate Collabora/WOPI engine.
Both formats use the shared transport in `editor_server`, but neither engine
imports or mutates the other engine's implementation.

Canonical entrypoints:

- Browser editor: `/hwpx/`
- REST: `/v1/hwpx`
- MCP transport: `/mcp`
- Command catalog: `editor_hwpx/scripts/hwpx-command-catalog.mjs`
- Package/session adapter: `editor_hwpx/scripts/hwpx-api-utils.mjs`
- Shared gateway: `editor_server/editor-gateway.mjs`
- Shared MCP schema: `editor_common/editor-mcp-tool-factory.mjs`

## Capability status

The HWPX catalog exposes 37 canonical commands and every entry currently
reports `readiness=available`. `execution` still identifies the actual path
used by an operation, such as the native RHWP path, structural adapter, or
preserve-package adapter. It is evidence about implementation, not a readiness
exception.

```text
text.replaceParagraph
text.insertAfterParagraph
text.replace
text.replaceTracked
insertText
deleteRange
appendParagraph
text.deleteParagraphs
table.writeCell
table.writeRichCell
table.writeCells
table.applyCellStyle
table.insertRows
table.setSize
table.setCellSize
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
image.cloneToCell
image.generateAndReplace
setDocumentMetadata
defineStyle
setPageSetup
setHeaderFooter
insertFootnote
object.deleteTextBoxByText
object.replaceTextBoxText
```

Accepted aliases are returned by the catalog and normalized before execution.
Clients must not copy a DOCX payload into an HWPX command merely because an
operation name is shared; query the format's command schema first.

## Safe edit workflow

1. Open bytes and retain `documentId` plus `revision`.
2. Read a bounded projection with `read_json`.
3. Resolve and inspect every target required by the command catalog.
4. Apply one revision-bound atomic command batch with `baseRevision`.
5. Run `quality_check` for the new revision.
6. Render the required pages and inspect the visible result.
7. Save source or checkpoint, read the opaque artifact, verify hashes and
   reopen it, then delete the artifact.
8. If the workflow is cancelled, call `discard` with `documentId` and the
   current `baseRevision`.

An old cursor or revision is rejected. Failed command batches do not advance
the revision. Save and PDF export require a clean quality check for that exact
revision.

## Important limits

- `text.replaceTracked` must be the only command in its batch and currently
  targets one `hp:t` run.
- Semantic chart-data editing is not exposed. When chart-looking content is an
  image, use the image replacement operations.
- SVG page rendering is a fast structural/browser gate. It does not replace a
  final Hancom Office visual check for high-risk layout.
- HWPX PDF export depends on the configured native converter runtime and fails
  closed when that runtime is unavailable.
- The editor accepts HWPX as its document input. PDF, DOCX, HWP, XLSX, CSV,
  TXT, PNG, and JPG are evaluation evidence inputs processed by the attachment
  extractors; they are not silently treated as editable HWPX packages.

## Verification

```powershell
npm.cmd run test:hwpx-api
npm.cmd run test:hwpx-dataset
npm.cmd run test:hwpx-evaluation
npm.cmd run test:hwpx-browser
```

`test:hwpx-browser` requires a running gateway at
`http://academic-editor.test:11006/hwpx/` unless `VITE_URL` is set. It opens a
real HWPX in Chrome, edits it, saves a downloaded package, extracts the saved
text, reopens the package, captures a screenshot, and always closes the Chrome
process it created.

The public-sector corpus contains 100 expert scenarios: 90 edits and 10
generations. Every scenario uses HWPX plus at least three heterogeneous
evidence files. The current corpus has 13 unique attachments across HWPX, HWP,
PDF, DOCX, XLSX, CSV, TXT, PNG, and JPG. Every `sourceFact` has a stable
`factId`, a real locator, a declared output target, and a reopen assertion.
