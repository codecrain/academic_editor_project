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

The HWPX catalog exposes 48 canonical commands and every HWPX entry currently
reports `readiness=available`. `execution` still identifies the actual path
used by an operation, such as the native RHWP path, structural adapter, or
preserve-package adapter. It is evidence about implementation, not a readiness
exception.

```text
field.setValues
text.replaceParagraph
text.insertAfterParagraph
text.replace
text.replaceTracked
insertText
field.manage
field.insert
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
table.transform
style.applyText
applyStyle
setRunStyle
setParagraphStyle
format.apply
paragraph.structure
image.replace
image.insertAfterParagraph
image.replaceInCell
image.insertInCell
image.cloneToCell
image.generateAndReplace
setDocumentMetadata
defineStyle
setPageSetup
section.configure
setHeaderFooter
insertFootnote
note.insert
note.manage
bookmark.manage
object.deleteTextBoxByText
object.format
object.create
object.manage
object.replaceTextBoxText
```

HWPX accepts only the exact canonical `op` published by the catalog. Clients
must not copy a DOCX payload into an HWPX command merely because an operation
name is shared; query the format's command schema first.

## Safe edit workflow

1. Open bytes and retain `documentId` plus `revision`.
2. Inspect bounded `summary` and `capabilities`, then use `outline`, `styles`,
   `search`, `fields`, `objects`, or `security` for the exact evidence needed.
3. Resolve and inspect every exact target, object inventory, or field inventory
   required by the command catalog.
4. Apply one revision-bound atomic batch with `edit` and `baseRevision`.
5. Inspect `history` to verify the revision and semantic digest transition,
   then run `review` for the new revision with full-page coverage. Review returns
   structural failures and objective page, font, color, image, occupancy, flow,
   and clipping evidence. The caller decides semantic completeness, reference
   similarity, editorial quality, and submission readiness.
6. Inspect every affected rendered page and its neighbors.
7. Save in verified mode with the exact same deterministic `expectations` and
   `securityPolicy`, or recovery-only
   checkpoint mode; read the opaque artifact, verify hashes and reopen it, then
   delete the artifact. After verified save the mutable session is closed, but
   the returned `browserPresentation.url` (`readonly=1&finalized=1`) serves an
   immutable hash-bound final preview until the artifact TTL expires.
8. If the workflow is cancelled, call `discard` with `documentId` and the
   current `baseRevision`.

A stale cursor or revision is rejected. Failed command batches do not advance
the revision. Save and PDF export require a clean quality check for that exact
revision and must repeat the expectations and security policy accepted by review.

## Important limits

- `text.replaceTracked` must be the only command in its batch and currently
  targets one `hp:t` run.
- Semantic chart-data editing is not exposed. When chart-looking content is an
  image, use the image replacement operations.
- SVG page rendering is a fast structural/browser gate. It does not replace a
  final Hancom Office visual check for high-risk layout.
- HWPX PDF export depends on the configured native converter runtime and fails
  closed when that runtime is unavailable.
- The editor accepts both binary HWP and HWPX document input. It preserves the
  source format; package-only commands are marked unavailable for HWP.
- `template` inspection reports exact tables, images, and explicit
  `preservationPolicy` state without inferring semantic roles. `page` inspection
  scans the complete target stream before returning bounded page targets and
  occupancy metrics.
- Newly inserted paragraph images must persist `treatAsChar=true` when re-read;
  native HWP may retain dormant floating-layout fields while inline mode is active.
  Floating placement requires a subsequent explicit `object.format`.
- `image.insertInCell` stores an inline picture in HWPX. Binary HWP stores a
  centered, cell-contained overlay and exposes that format-specific placement
  in the command receipt; save/reopen verification checks the spatial result.

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

The final corpus contains 20 selected expert stress scenarios: 18 edits and 2
generations. Every scenario uses HWPX plus at least three heterogeneous
evidence files. The current corpus has 11 unique attachments across HWPX, HWP,
PDF, DOCX, XLSX, CSV, TXT, PNG, and JPG. Every `sourceFact` has a stable
`factId`, a real locator, a declared output target, and a reopen assertion.

This directory is the canonical HWPX Agent final-20 validation contract, but
`test:hwpx-evaluation` is only its deterministic editor replay gate. A real
HWPX Agent pass requires the separate no-oracle run defined in
`evaluation/hwpx-agent-final-20-v1/FINAL_VALIDATION.md`.
