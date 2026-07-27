# HWPX editor: architecture, capability, and safety

## Product boundary

HWPX has two deliberately separate entry points:

- Studio is the interactive RHWP/WASM editor.
- REST/MCP is the deterministic automation path. Its default
  `preserve-package` writer patches the original HWPX ZIP and is the required
  path for complex public-sector documents.

DOCX and HWPX share transport conventions, bounded projections, artifact
handling, and the small MCP schema factory. They do not share package mutation,
rendering, runtime, or editor code.

Key HWPX modules:

- `editor_hwpx/scripts/hwpx-api-utils.mjs`: parsing, stable targets, atomic
  commands, package preservation, quality, SVG render data, reopen validation.
- `editor_hwpx/scripts/hwpx-command-catalog.mjs`: machine-readable operation
  contract.
- `editor_hwpx/scripts/hwpx-mcp-tools.mjs`: HWPX-owned MCP schemas.
- `editor_hwpx/scripts/hwpx-runtime-readiness.mjs`: installed RHWP declaration,
  executable-wrapper, and artifact materialization gates.
- `editor_hwpx/scripts/hwpx-native-pdf.mjs`: isolated native PDF runner.
- `editor_hwpx/rhwp-studio/src/core/hwpx-save-integrity.ts`: Studio save-loss
  guard.
- `editor_docx/scripts/editor-gateway.mjs`: shared HTTP transport dispatch;
  format behavior remains in each format's modules.

## DOCX comparison

| Area | DOCX | HWPX |
| --- | --- | --- |
| REST/MCP lifecycle | Open, bounded read, inspect, atomic apply, quality, render, checkpoint/finalize, PDF, artifact handoff, discard | Same lifecycle |
| Canonical catalog | 29 operations | 32 operations (27 available, 5 unavailable) |
| Existing text/table/style edit | Supported | Supported |
| Existing image replacement/generation | Supported | Supported |
| New table/caption | Supported | Table creation ready; native caption unavailable |
| Metadata/page setup/header/footer/footnote | Supported | Page setup ready; metadata, header/footer, footnote unavailable |
| Render evidence | Baseline/current WebP | Baseline/current RHWP SVG |
| PDF export | Isolated UNO | Isolated source-built RHWP CLI |
| Complex-format safety | OOXML-specific checks | Preserve-package writer plus critical-control loss gate |
| Encrypted/distribution input | Outside this contract | Explicitly rejected |

The HWPX rendering surface remains SVG rather than DOCX WebP, and five
canonical structural operations remain unavailable. These are explicit
contract limits, not hidden partial support.

## Preservation and transaction model

An API `apply` request is atomic:

1. Validate every command against the catalog.
2. Verify all required targets and style sources were inspected.
3. Execute the whole batch in an isolated trial session.
4. Serialize and reopen the trial package.
5. Compare package, relationship, object, and operation postconditions.
6. Commit once and advance the revision once.

Failure at any gate commits nothing. The default writer changes only addressed
section XML, image entries, shapes, or text boxes. No-op saves return the exact
original bytes, including opaque and binary entries.

Studio uses the native RHWP serializer for interactivity. Real testing against
an 11-page education-ministry HWPX showed that an unguarded round trip could
reduce pictures from 9 to 1 and remove a container and shape comments. Studio
therefore compares source and candidate control counts before every HWPX save
and blocks unsafe output. It does not silently downgrade to a corrupt file.

## Stable targets and command catalog

Use locations returned by `target_map`, `target_find`, or `target_inspect`:

```json
{"paragraph":{"section":0,"number":31}}
```

```json
{"tableId":"tbl_12","cell":{"number":21,"row":6,"column":1}}
```

The catalog has 32 canonical operations:

- Text: `text.replaceParagraph`, `text.insertAfterParagraph`, `text.replace`,
  `text.replaceTracked`, `insertText`, `deleteRange`, `appendParagraph`
- Tables: `table.writeCell`, `table.writeRichCell`, `table.writeCells`,
  `table.applyCellStyle`, `table.create`, `table.insertCaption`
- Styles: `style.applyText`, `paragraph.applyStyle`, `style.clone`,
  `applyStyle`, `setRunStyle`, `setParagraphStyle`
- Lists: `list.writeBullets`, `list.applyNumbering`
- Layout: `layout.fitText`
- Images: `image.replace`, `image.insertAfterParagraph`,
  `image.generateAndReplace`
- Package/structure: `setDocumentMetadata`, `defineStyle`, `setPageSetup`,
  `setHeaderFooter`, `insertFootnote`
- Objects: `object.deleteTextBoxByText`, `object.replaceTextBoxText`

Twenty-seven report `readiness=available`. The five unavailable operations are
`table.insertCaption`, `setDocumentMetadata`, `setRunStyle`,
`setHeaderFooter`, and `insertFootnote`. The gateway rejects them before
mutation. Query `editor_hwpx_command_catalog` or the REST catalog at runtime;
do not infer support from a declaration or lower-level experiment.

## Rendering and PDF

HWPX page rendering returns nonblank RHWP SVG plus structural evidence. It is
not a claim of pixel identity with Hancom Office.

HWPX PDF export uses `editor_hwpx/docker/pdf/Dockerfile` and
`editor_hwpx/scripts/hwpx-native-pdf.mjs`. Each request gets a unique container
and temporary directory. The runner supports `pages="all"` only, imposes a
timeout and output limit, validates JSON and `%PDF-`, computes SHA-256, and
cleans only its owned container and directory.

Build the local image:

```powershell
docker build -t academic-rhwp-pdf:latest -f editor_hwpx/docker/pdf/Dockerfile .
```

Then call REST `/v1/hwpx/documents/{id}/documents/export-pdf` or MCP
`editor_hwpx_export_pdf`.

## Acceptance evidence

Deterministic verification includes:

- 121 HWPX API/catalog/package/readiness/Studio-safety tests;
- REST and MCP workflow checks;
- a 100-case public-sector corpus: 90 complex edits and 10 generations;
- question length, heterogeneous-source, attachment hash/signature,
  privacy, exact binary identity, reopen, object, render, and cleanup gates;
- actual Studio load/edit/save-loss blocking on the 11-page source;
- actual Hancom 2024 open, resave, and PDF export of API-produced HWPX;
- actual native Docker PDF export and cleanup.

Run commands are listed in `API.md` and the evaluation README. Generated
evidence and caches are not committed.

## Explicit limits

- Encrypted/distribution HWPX returns `unsupported_encrypted_hwpx`.
- The five unavailable catalog operations above are rejected before mutation.
- Native numbering-definition creation is unavailable; list commands write
  visible list text while preserving paragraph style.
- Tracked replacement is limited to one `hp:t` run and a single-command batch;
  listing, accepting, and rejecting revisions are not public commands.
- Semantic chart-data editing is unavailable; replace an existing image.
- HWPX render evidence does not guarantee Hancom pixel parity.
- Legacy binary HWP may be a reference input, but this contract writes HWPX.
