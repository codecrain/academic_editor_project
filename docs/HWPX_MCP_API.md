# HWPX MCP/API contract

Academic Editor exposes one revision-bound HWP/HWPX lifecycle through Streamable HTTP at `/mcp` and through the canonical HTTP actions under `/v1/hwpx/documents/{documentId}`. The `hwpx` route/tool prefix identifies the editor module; verified output preserves the opened source format.

Contract version: `3.3.0`

The executable identity is `academic-editor-mcp`. It supports MCP protocol
versions `2025-06-18` and `2025-03-26`, preferring `2025-06-18`. The canonical
contract manifest is `editor_server/hwpx-mcp-contract.mjs`; it owns the HWPX
tool names, inspection views, save modes, command enum, lifecycle, server
version, and initialization instructions. `editor_server/editor-mcp.mjs`
derives its public HWPX schema from that manifest.

## Tools

```text
editor_hwpx_open
editor_hwpx_inspect
editor_hwpx_edit
editor_hwpx_review
editor_hwpx_save
editor_hwpx_export_pdf
editor_hwpx_discard
editor_hwpx_artifact_read
editor_hwpx_artifact_delete
```

Call `tools/list` for the exact JSON Schema. The command catalog remains the single source of truth and is available as `editor_hwpx_inspect(view="catalog")`. Version 3.3.0 contains 48 canonical operations. Do not hard-code that number or copy property allowlists into an agent prompt; inspect the current-revision catalog because source-format availability and fields are generated from the same executable contract used by validation.

`image.insertInCell` fills an exact inspected cell from either `bytesBase64` or a cross-document `assetRef`. HWPX persists the image inline in the exact cell paragraph. Legacy binary HWP persists a bounded overlay whose center lies inside the inspected cell and returns `placementMode="cell-anchored-overlay"`. The editor verifies object persistence and geometry after save/reopen; the caller decides what the image means.

## Integrated capability model

The public surface is one state machine rather than parallel editor APIs:

| Capability family | Canonical surface |
| --- | --- |
| Document identity and lifecycle | `open`, revision-bound sessions, `discard` |
| Structure and discovery | `inspect(summary|outline|styles|target|search|fields|objects|page|template)` |
| Fine-grained mutation | `edit` with exact catalog operations, atomic batches, target/object/field preconditions |
| Field and form work | `inspect(fields)` plus `field.setValues`, verified after save/reopen |
| Security and trust | `inspect(security)`, `securityPolicy`, explicit hidden-text/prompt-injection/Unicode evidence |
| Deterministic assertions | `expectations` for source format, page/paragraph/table/picture/text/field assertions |
| Provenance | `inspect(history)`, command receipts, revision transitions, semantic digests |
| Layout and quality | `inspect(quality|page)`, full-page `review`, clipping and objective visual evidence |
| Final artifacts | policy-bound verified `save`, `export_pdf`, hash-bound artifact read/delete |
| Self-description | `inspect(capabilities|catalog)` generated from the executable contract |

Engine-level methods are adapters behind this state machine. They do not form a second public MCP surface.

## Tool effects and input contract

| Tool | Required inputs | Important optional inputs | State effect |
| --- | --- | --- | --- |
| `editor_hwpx_open` | `filename` and exactly one of `bytesBase64`/`bytesRef` | none | Creates an isolated session; not read-only or idempotent. |
| `editor_hwpx_inspect` | `documentId`, `view` | current `baseRevision`, filters, bounded cursor/limits | Read-only and idempotent. |
| `editor_hwpx_edit` | `documentId`, `baseRevision`, `commands` | `preservationPolicy`; per-command `assetRef`/`styleRef` | Atomically applies the batch and advances the revision. |
| `editor_hwpx_review` | `documentId`, `baseRevision` | `pages`, `includeBaseline`, opt-in `includeSvg`, `expectations`, `securityPolicy` | Read-only structural and rendered review; records exact deterministic verification inputs. |
| `editor_hwpx_save` | `documentId`, `baseRevision`, `filename` | `mode=verified|checkpoint`, `expectations`, `securityPolicy` | Creates an artifact and returns SHA-256 plus `byteLength`; verified save closes mutation while preserving an immutable final browser preview. |
| `editor_hwpx_export_pdf` | `documentId`, `baseRevision` | PDF `filename`, `expectations`, `securityPolicy` | Creates a PDF artifact without closing the edit session. |
| `editor_hwpx_discard` | `documentId`, `baseRevision` | none | Destructively closes the session; idempotent. |
| `editor_hwpx_artifact_read` | `artifactId`, `expectedSha256` | none | Reads HWP/HWPX/PDF artifact bytes; read-only. |
| `editor_hwpx_artifact_delete` | `artifactId`, `expectedSha256` | none | Destructively deletes the verified artifact. |

`documentId` is always the opaque value returned by `open`. `baseRevision` is
the exact current integer revision, never a caller-generated sequence. An edit
batch contains 1 through 100 commands; every command has a unique stable `commandId`
and an `op` from the live catalog. Unknown top-level tool arguments are rejected.

## Lifecycle

1. Open exact bytes with `editor_hwpx_open`. Keep the returned opaque `documentId` and `revision`.
2. Inspect `summary` and `capabilities`, then page through the views needed by the task. Inspect every exact mutation target with `view="target"`, inspect `objects` before object commands, and inspect `fields` before `field.setValues`.
3. Apply one atomic catalog command batch with `editor_hwpx_edit`. Every command needs a stable `commandId` and canonical `op`.

```json
{
  "documentId": "doc_...",
  "baseRevision": 1,
  "commands": [
    {
      "commandId": "edit-1",
      "op": "text.replaceParagraph",
      "location": { "paragraph": { "section": 0, "number": 1 } },
      "text": "Replacement text"
    }
  ]
}
```

4. Reload the returned `browserPresentation.url` after each successful revision-changing call when using the Codex in-app Browser.
5. Inspect `history`, then run `editor_hwpx_review` at the current revision. It checks structure, actual rendered cell clipping, pagination, every requested page (all pages by default), caller expectations, and security policy.
6. Review every page and inspect the returned objective evidence yourself. Repeat the same `expectations` and `securityPolicy` at save. Verified save preserves the source format (`.hwp` remains HWP; `.hwpx` remains HWPX), requires a clean current-revision structural review, and performs save/reopen/hash/render checks. `checkpoint` is recovery-only.

Binary HWP uses native structural operations and is never silently converted to HWPX. Commands that depend on HWPX package XML (existing-image byte replacement, package-level picture cloning, tracked-change XML, and XML-only convenience style cloning) fail explicitly with `HWP_COMMAND_REQUIRES_HWPX_PACKAGE`. Native `setRunStyle`, `setParagraphStyle`, `applyStyle`, table resize/row insertion, paragraph insertion, and new-image insertion remain available for HWP.

7. Reload the returned `browserPresentation.url`; after verified save it includes `readonly=1&finalized=1` and serves immutable bytes whose `X-Editor-Sha256` and ETag match the artifact. Read the opaque artifact, verify its SHA-256 and package signature independently, then delete it. The final preview remains read-only until the configured artifact TTL expires.

On cancellation or failed validation, call `editor_hwpx_discard`.

## Inspection views

- `summary`: bounded document counts, page count, warnings, and object totals.
- `outline`: exact document-flow order with locations, text, page hints, styles, hierarchy facts, and cell geometry. Cell items also expose bounded `pictureCount` and `allowedActions`, so picture-slot commands can be targeted without guessing or expanding every cell.
- `styles`: measured body and cell-paragraph style groups with counts and examples. It reports native paragraph/character properties, margins, indentation, outline level, and fingerprints; it does not guess headings from text.
- `target`: exact current-revision inspection by locations, or unambiguous text resolution by query.
- `objects`: package assets plus page-linked pictures, shapes, charts, and text boxes. Top-level and table-cell pictures expose stable native targets; nested pictures include `cellPath` so `object.format` can update the exact control. Text-box replacement/deletion matches normalized visible text exactly rather than searching raw XML.
- `template`: exact current tables/images and caller-selected preservation state. It does not infer required, removable, instructional, conditional, or freeform roles.
- `page`: one rendered page with dimensions, content bounds, vertical occupancy, density/readability metrics, and document-wide-scanned target linkage. The response reports matched/returned/truncated target counts. Inline SVG is opt-in; the default returns its byte length and SHA-256.
- `quality`: structural and actual rendered-layout findings plus objective visual measurements. It does not judge document meaning or submission readiness.
- `catalog`: canonical command definitions, readiness, required native methods, and examples.
- `search`: bounded exact text matches with target locations and surrounding context.
- `fields`: bounded field inventory with stable IDs, names, values, and duplicate-name occurrence order.
- `security`: hidden-text, prompt-injection, and Unicode-deception evidence with explicit severities.
- `history`: revision-bound mutation receipts and before/after semantic digests covering text, fields, tables, styles, objects, metadata, page definitions, headers/footers, and footnotes.
- `capabilities`: the current nine-tool lifecycle, inspection views, live command catalog, and integrated capability families.

All list-like views use opaque revision-bound cursors. Do not alter a cursor or reuse it after a revision change.

The bounded input limits are `limit <= 120`, `locations <= 120`,
`textPreviewChars=32..512`, `cellPreviewLimit=0..12`, and cursor length no more
than 2,048 characters. Omit `pages` from review to render every page; an
explicit page list is limited to 120 unique one-based page numbers.

## Table layout

`table.autoFit` measures the first and last rendered cursor rectangles in the selected cell, grows every cell in that physical row together, applies a page-content maximum (or explicit `maxHeight`), and verifies the resulting row height after save/reopen. It rejects the entire atomic batch if the reopened candidate introduces any additional rendered table-cell clipping (`HWPX_AUTOFIT_RENDER_CLIPPING_REGRESSION`) or exceeds the document-level pagination budget (`HWPX_AUTOFIT_PAGINATION_REGRESSION`). The default budget is one added page, no added blank page, and no added sparse/low-occupancy page; callers may explicitly set `maxPageGrowth`, `maxBlankPageGrowth`, and `maxLowOccupancyGrowth`. It fails instead of creating an unbounded row. Estimated text capacity is advisory. `table.writeCell` with `fit=true` preserves original text by default; `fitOptions.materializeBreaks=true` is required to write suggested wrapping, and truncation additionally requires both `truncate=true` and `allowTextLoss=true`.

For newline-delimited `table.writeCell` or `table.writeCells` content whose source paragraphs have different roles, pass one `paragraphTemplateIndices` entry per output paragraph. Binary HWP and HWPX both preserve the selected paragraph, character, and named-style identities through save/reopen. Character or paragraph formatting of a table cell containing more than one paragraph must include `target.cellParagraphIndex`; omission fails atomically with `HWPX_CELL_PARAGRAPH_INDEX_REQUIRED` instead of silently formatting paragraph zero.

Every `render-cell-clip` issue includes renderer provenance and, when the current document target resolves, `targetId`, `tableId`, and exact `location`. Use these fields for repair; `clipId` is render-local evidence and must not be treated as a stable editing identifier.

## Preservation and cross-document resources

`preservationPolicy` is explicit and revision-scoped. `protectedLocations`, `preserveTableIds`, and `preserveImageNames` block only the named mutations. Everything else remains editable. The editor never guesses whether a region is required, instructional, repeatable, conditional, or freeform. HWPX `deleteTable` removes only the exact inspected `<hp:tbl>` subtree, qualifies only that measured structural-reference loss, preserves the rest of the package, and verifies the exact reopened table count.

Image mutation accepts either `bytesBase64` or `assetRef`; server-local `filePath` and in-process `bytes` are not part of the public command contract. An image command can use `assetRef={documentId,imageName}` while both HWP/HWPX sessions are open. The gateway reads the exact inventoried source bytes and records SHA-256, length, MIME, source, and target in `resourceTransfers`. `format.apply` can use `styleRef={documentId,location,scope}` to transfer measured properties rather than unsafe source-local style IDs. Measured fractional HWP units are normalized to the target contract; unsupported values are omitted before mutation and reported as `transferredFields`/`omittedFields` in the transfer receipt.

Review renders each current page once and reports clipping plus page/font/line/image/content-bound/occupancy metrics. Colors are returned as measured counts; images include measured body containment, width ratio, and center offset; styles include exact distributions and dominant ratios; target flow includes page hints, hierarchy facts, and character formatting. These are evidence, not pass/fail editorial rules. `expectations` verifies caller-specified page, paragraph, table, picture, source-format, required/forbidden text, and exact field outcomes. `securityPolicy` controls hidden text, prompt-injection evidence, and Unicode deception. A verified HWPX save/export must repeat the exact expectations and security policy accepted by the current-revision review. MCP responses always return `svgByteLength` and `svgSha256`; `includeSvg=true` additionally returns the exact inline SVG. Requested pages that do not exist are returned in `unavailablePages` instead of being silently omitted or fabricated.

## Stable failure codes

- Cursor integrity and revision failures: `invalid_cursor`, `cursor_query_mismatch`, `stale_cursor`.
- Artifact type/hash failures: `artifact_format_mismatch`, `artifact_hash_mismatch`.
- Atomic command identity failures: `duplicate_command_id`.
- Image input failures: `HWPX_IMAGE_FORMAT_UNSUPPORTED`, `HWPX_IMAGE_MIME_MISMATCH`.
- Exact text-box selector failures: `HWPX_TEXTBOX_NOT_FOUND`.
- Preservation failures: `template_protected_region`, `preserved_table_mutation_blocked`, `preserved_image_mutation_blocked`.
- Finalization precondition failures: `quality_check_required`, `quality_verification_policy_required`.
- Finalized preview integrity failures: `finalized_preview_hash_mismatch`, `finalized_preview_size_mismatch`.
- Bounded fitting failures retain engine codes such as `HWPX_AUTOFIT_PAGE_CONSTRAINT_EXCEEDED` and `HWPX_AUTOFIT_RENDER_CLIPPING_REGRESSION` instead of collapsing to `tool_execution_failed`.

Every failed edit is atomic: revision, live-source bytes, and previously active preservation policy remain unchanged.

## Executable exhaustive red-team gate

`npm.cmd run test:hwpx-mcp-red-team` starts an isolated latest-source gateway on an ephemeral loopback port, calls the real Streamable HTTP `/mcp` endpoint, and closes it in `finally`. The gate asserts exact coverage of all nine lifecycle tools, all 14 inspection views, and every operation in the live command catalog. It also exercises HWP and HWPX, nested image and shape formatting, exact text-box replacement/deletion, cross-document `assetRef`/`styleRef`, table and paragraph location invalidation, stale revisions, missing inspection preconditions, duplicate command IDs, MIME conflicts, template protection, atomic rollback, policy-bound review/save, PDF artifact transport, hash-bound artifact read/delete, and save/reopen evidence. The PDF renderer is injected in this contract test; native operating-system PDF readiness remains covered separately by `hwpx-native-pdf.test.mjs`.

## Fine-grained formatting and structure

The public API does not multiply one tool per formatting property. Two strict,
catalog-driven commands expose the native controls without duplicating MCP
surface area:

- `format.apply` accepts `character`, `paragraph`, `cell`, or `table` scope.
  It covers font family/size/emphasis/color/decoration/kerning and language
  arrays; paragraph alignment, line spacing, indentation, margins, before/after
  spacing, hierarchy/list IDs, and page-flow flags; cell size, padding,
  vertical alignment, text direction, header/protection, borders, and fill; and
  table padding/spacing, page-break/header behavior, anchor/wrap/position,
  margins, borders/fill, and existing native caption properties.
- `object.format` accepts `image`, `shape`, or `equation` scope. It covers size,
  treat-as-character, wrapping, anchor/offset, crop, inner/outer spacing and
  border for images; and those controls plus rotation/flip, solid/gradient fill,
  shadow, text-box margins/alignment, rounding, and connector endpoints for
  shapes.
- `table.structure` performs row/column insertion and deletion, cell merge and
  split, or table deletion. `paragraph.structure` performs split,
  merge-with-previous, page break, or column break. Location-invalidating
  structure commands run alone.
- `setHeaderFooter` inserts native page, total-page, and file-name controls
  rather than raw control characters; all dynamic fields are independently
  checked after save/reopen. `note.manage` replaces a complete note body,
  formats one exact note paragraph, or deletes one exact note. `object.manage`
  groups/ungroups exact top-level shape and picture controls through the same
  native engine path used by the studio.

Unknown properties, invalid ranges, unsupported source-format fields, and
unproven serializer behavior fail before mutation. For example, HWPX does not
advertise paragraph keep flags that its serializer cannot preserve, and native
image-caption creation is not claimed; an image caption can instead be created
as the separately verified caption paragraph supported by
`image.insertAfterParagraph`. Every accepted direct-format mutation is checked
again after save/reopen before commit.

New paragraph images use safe inline flow by default and are re-read before the
command succeeds; `treatAsChar=true` must persist. Native HWP may retain dormant
`Paper`/`Square` fields while inline mode is active, so those fields must be
interpreted together with `treatAsChar`. Intentional floating placement is a
separate, explicit `object.format` operation after re-inspecting the picture.

## Canonical HTTP actions

```text
POST /v1/hwpx/documents/open
POST /v1/hwpx/documents/{documentId}/inspect
POST /v1/hwpx/documents/{documentId}/edit
POST /v1/hwpx/documents/{documentId}/review
POST /v1/hwpx/documents/{documentId}/save
POST /v1/hwpx/documents/{documentId}/export-pdf
POST /v1/hwpx/documents/{documentId}/discard
GET  /v1/hwpx/documents/{documentId}/live-source
```

These lifecycle routes are the complete public HWP/HWPX HTTP contract. Internal engine modules are implementation details and are not separate public editor APIs.

## Diagnostic trace

Lifecycle traces use the JSONL schema `academic-editor-hwpx-lifecycle/v2` and record open, bounded inspection, edit, review, save, discard, and failed requests without document text, plaintext bytes, or credentials. They are emitted to stdout by default. Set `EDITOR_HWPX_TRACE_FILE` to persist the same one-event-per-line records; set `EDITOR_HWPX_TRACE_ENABLED=false` only when an embedding host provides an equivalent sink.

## Browser presentation and authentication

On loopback, `editor_hwpx_open` returns `browserPresentation.url`. Open that exact URL in the Codex side-panel Browser. The GET-only live-source exception is loopback-only; a non-loopback gateway requires Bearer authorization and does not advertise the local presentation URL.

Codex desktop, CLI, and IDE share `~/.codex/config.toml`. The local registration
is:

```toml
[mcp_servers.academicEditor]
url = "http://127.0.0.1:11004/mcp"
bearer_token_env_var = "ACADEMIC_EDITOR_MCP_BEARER_TOKEN"
startup_timeout_sec = 15
```

The token value belongs only in the named environment variable. After adding
or changing the registration, restart Codex and use `/mcp` to confirm that the
server and its nine HWPX tools are connected. A configured but non-listening
11004 endpoint does not make tools available to an already-open task.

The repository does not make OpenAI model calls for editor execution or evaluation.
