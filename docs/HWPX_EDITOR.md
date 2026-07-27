# HWPX editor: current architecture and capability

## Scope

The HWPX editor supports deterministic API-only edits of ordinary,
unencrypted HWPX packages. It uses RHWP for document analysis and SVG rendering
and a preserve-package writer for final output. Browser automation is not part
of the editing contract.

The implementation is intentionally split:

- `editor_hwpx/scripts/hwpx-api-utils.mjs` owns HWPX parsing, stable targets,
  command execution, preservation, quality checks, SVG rendering data, and
  reopen validation.
- `editor_hwpx/scripts/hwpx-command-catalog.mjs` owns the machine-readable
  public command contract.
- `editor_hwpx/scripts/hwpx-runtime-readiness.mjs` statically verifies that the
  installed RHWP artifact declares every native method required by a ready
  command in `rhwp.d.ts` and exposes the matching method on the executable
  `rhwp.js` wrapper before Studio materializes that artifact. This check does
  not initialize WASM, introspect live WASM exports, or prove command
  semantics.
- `editor_docx/scripts/editor-gateway.mjs` exposes `/v1/hwpx`.
- `editor_docx/scripts/editor-mcp.mjs` exposes the `editor_hwpx_*` MCP tools.
- `evaluation/hwpx-public-sector-v1` owns high-difficulty acceptance data and
  the API-only runner.

DOCX and HWPX share transport conventions and bounded projections. They do not
share package mutation logic.

## DOCX comparison

| Area | DOCX | HWPX |
| --- | --- | --- |
| REST/MCP lifecycle | Open, bounded read, inspect, atomic apply, quality, render, checkpoint, finalize, artifact handoff, discard | Same lifecycle |
| Canonical catalog | 29 operations | 32 operations (27 ready, 5 unavailable) |
| Existing text/table/style edit | Supported | Supported |
| Existing image replacement/generation | Supported | Supported |
| New table creation/caption | Supported | Table creation is ready; native captions remain unavailable |
| Metadata/page setup/header/footer/footnote | Supported | Page setup is ready; metadata, header/footer, and footnote remain unavailable |
| Render evidence | Baseline/current WebP | Baseline/current RHWP SVG |
| PDF export | Supported through isolated UNO | Not implemented |
| Encrypted/distribution input | Not applicable to OOXML contract | Explicitly rejected |

HWPX now has a wider authoring surface, but it does not have full DOCX
renderer/export parity. The command counts and limits above are current
contract facts, not roadmap promises.

## Preservation and transaction model

An `apply` request is atomic:

1. Validate every command against the HWPX catalog.
2. Execute the whole batch in an isolated trial session.
3. Serialize and reopen the trial package.
4. Commit the resulting bytes to the live session once.

If any command or reopen step fails, no earlier command is committed and the
revision does not advance. Successful batches advance the revision exactly
once.

The default `preserve-package` writer starts from the original ZIP and changes
only addressed section XML, image entries, or shape/text-box content. It
preserves unrelated package entries and reopens the saved bytes before
finalization. No-op saves return the original bytes.

## Stable targets

Use exact targets obtained from `target_map`, `target_find`, or
`target_inspect`:

```json
{"paragraph":{"section":0,"number":31}}
```

```json
{"tableId":"tbl_12","cell":{"number":21,"row":6,"column":1}}
```

`tableId` plus cell `number` is the stable cell identity within one revision.
Row and column are useful assertions, not substitutes for inspection. Cursors
are revision-bound; enumerate targets again after a successful apply.

## Public command catalog

The current catalog exposes 32 canonical operations:

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
- Package and structure: `setDocumentMetadata`, `defineStyle`, `setPageSetup`,
  `setHeaderFooter`, `insertFootnote`
- Objects: `object.deleteTextBoxByText`, `object.replaceTextBoxText`

Each entry reports `readiness` independently from `execution`. Ready
preserve-package commands use `execution=preserve-package`; native tracked
replacement uses `tracked-package-transform`; the promoted structural
commands use `structural-adapter`. `appendParagraph` uses the qualified
`preserve-package-adapter` so inspected paragraph/run style IDs can be copied
exactly instead of being approximated through format properties. Five
structural entries remain canonical
with `readiness=unavailable`. Repository source implements
`setDocumentMetadata`, while no published `@rhwp/core` artifact through 0.8.2
exposes both metadata methods. The pinned published 0.7.15 artifact exposes
the relevant method names, but table captions and run formatting disappear
during export/reopen, header/footer content does not survive export/reopen, and
footnote insertion traps on the supported blank-document fixture. Validation
rejects all five operations before mutation. `table.create` remains ready
without its former caption option; passing `caption` is rejected before
mutation.

The static declaration/wrapper check is only the first readiness gate. A
command is included in the current 27-ready set only when installed-artifact
tests also exercise its applicable command path and require package
qualification, export, reopen, and operation-specific postconditions. Method
presence in `rhwp.d.ts` or `rhwp.js` alone never promotes a command.

Query `editor_hwpx_command_catalog` or
`POST /v1/hwpx/documents/{documentId}/commands/catalog` before applying a new
operation. The response includes aliases, required fields, preconditions,
inspection targets, and an example.

## Quality and rendering evidence

Acceptance requires more than a successful save:

- saved bytes have a package SHA-256;
- the saved HWPX reopens through the same public API;
- page, section, table, image, picture, XML, and binary-entry invariants pass;
- requested baseline and current pages render as nonblank SVG;
- exact target text and cloned paragraph/character style IDs survive reopen;
- no quality issue has `severity=error`.

The renderer returns SVG evidence. It is not proof of pixel identity in Hancom
Office, so workflows requiring Hancom-specific typography still need a human
or Hancom rendering acceptance step.

The deterministic Node suites exercise catalog validation, package policy,
structural adapters, tracked-change markup/probing, reopen checks, and API
utilities. Passing them is not Hancom interoperability evidence. In
particular, tracked replacement is currently limited to one `hp:t` run and a
single-command atomic batch; listing, accepting, and rejecting revisions are
not public commands.

## Explicit limits

These capabilities are not represented as supported:

- encrypted/distribution HWPX editing; the loader returns
  `unsupported_encrypted_hwpx` with an actionable message;
- HWPX PDF export;
- document metadata mutation with the currently published RHWP artifact;
- native table-caption and run-format mutation with the pinned published RHWP
  artifact;
- header/footer and footnote mutation with the pinned published RHWP artifact;
- native numbering-definition creation (list commands write visible list
  text while preserving paragraph style);
- cross-run or table-cell tracked replacement, tracked-change listing, and
  tracked-change accept/reject;
- semantic chart-data editing (replace an existing image entry instead);
- guaranteed pixel parity with Hancom Office;
- direct mutation of legacy binary HWP. HWP files may be reference inputs, but
  the editable output contract here is HWPX.

Never claim one of these from the existence of a lower-level RHWP experiment.
