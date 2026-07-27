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
| Canonical catalog | 29 operations | 17 operations |
| Existing text/table/style edit | Supported | Supported |
| Existing image replacement/generation | Supported | Supported |
| New table creation/caption | Supported | Not exposed |
| Metadata/page setup/header/footer/footnote | Supported | Not exposed |
| Render evidence | Baseline/current WebP | Baseline/current RHWP SVG |
| PDF export | Supported through isolated UNO | Not implemented |
| Encrypted/distribution input | Not applicable to OOXML contract | Explicitly rejected |

HWPX now has transport and agent-workflow parity, but it does not yet have
DOCX's authoring breadth or renderer/export breadth. The command counts and
limits above are deliberate current-contract facts, not roadmap promises.

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

The current catalog exposes 17 canonical operations:

- Text: `text.replaceParagraph`, `text.insertAfterParagraph`, `text.replace`
- Tables: `table.writeCell`, `table.writeRichCell`, `table.writeCells`,
  `table.applyCellStyle`
- Styles: `style.applyText`, `paragraph.applyStyle`, `style.clone`
- Lists: `list.writeBullets`, `list.applyNumbering`
- Layout: `layout.fitText`
- Images: `image.replace`, `image.generateAndReplace`
- Objects: `object.deleteTextBoxByText`, `object.replaceTextBoxText`

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

## Explicit limits

These capabilities are not represented as supported:

- encrypted/distribution HWPX editing; the loader returns
  `unsupported_encrypted_hwpx` with an actionable message;
- HWPX PDF export;
- creation of new tables;
- native numbering-definition creation (list commands write visible list
  text while preserving paragraph style);
- semantic chart-data editing (replace an existing image entry instead);
- guaranteed pixel parity with Hancom Office;
- direct mutation of legacy binary HWP. HWP files may be reference inputs, but
  the editable output contract here is HWPX.

Never claim one of these from the existence of a lower-level RHWP experiment.
