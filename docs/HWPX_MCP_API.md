# HWPX MCP/API contract

Academic Editor exposes one revision-bound HWP/HWPX lifecycle through Streamable HTTP at `/mcp` and through the canonical HTTP actions under `/v1/hwpx/documents/{documentId}`. The historical `hwpx` route/tool prefix names the editor module, not a forced output conversion.

Contract version: `2.4.0`

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

Call `tools/list` for the exact JSON Schema. HWPX intentionally does not mirror the fragmented DOCX/PDF read-map-find API. The command catalog remains the single source of truth and is available as `editor_hwpx_inspect(view="catalog")`. It currently contains 41 canonical operations. Do not hard-code that number or copy property allowlists into an agent prompt; inspect the current-revision catalog because source-format availability and fields are generated from the same executable contract used by validation.

## Tool effects and input contract

| Tool | Required inputs | Important optional inputs | State effect |
| --- | --- | --- | --- |
| `editor_hwpx_open` | `filename` and exactly one of `bytesBase64`/`bytesRef` | none | Creates an isolated session; not read-only or idempotent. |
| `editor_hwpx_inspect` | `documentId`, `view` | current `baseRevision`, filters, bounded cursor/limits | Read-only and idempotent. |
| `editor_hwpx_edit` | `documentId`, `baseRevision`, `commands` | `templatePolicy`; per-command `assetRef`/`styleRef` | Atomically applies the batch. Mutation advances the revision; a `layout.fitText`-only batch is read-only and preserves it. |
| `editor_hwpx_review` | `documentId`, `baseRevision` | `pages`, `includeBaseline`, opt-in `includeSvg`, `profile`, `visualPolicy` | Read-only document review; records the accepted current-revision review. |
| `editor_hwpx_save` | `documentId`, `baseRevision`, `filename` | `mode=verified|checkpoint` | Creates an artifact and returns SHA-256 plus `byteLength`; verified save closes the session. |
| `editor_hwpx_export_pdf` | `documentId`, `baseRevision` | PDF `filename` | Creates a PDF artifact without closing the edit session. |
| `editor_hwpx_discard` | `documentId`, `baseRevision` | none | Destructively closes the session; idempotent. |
| `editor_hwpx_artifact_read` | `artifactId`, `expectedSha256` | none | Reads HWP/HWPX/PDF artifact bytes; read-only. |
| `editor_hwpx_artifact_delete` | `artifactId`, `expectedSha256` | none | Destructively deletes the verified artifact. |

`documentId` is always the opaque value returned by `open`. `baseRevision` is
the exact current integer revision, never a caller-generated sequence. An edit
batch contains 1–100 commands; every command has a unique stable `commandId`
and an `op` from the live catalog. Unknown top-level tool arguments are rejected.

The removed HWPX MCP tools are not aliases and must never be called:
`editor_hwpx_read_json`, `editor_hwpx_target_map`,
`editor_hwpx_target_find`, `editor_hwpx_target_inspect`,
`editor_hwpx_object_inventory`, `editor_hwpx_command_catalog`,
`editor_hwpx_apply`, `editor_hwpx_quality_check`,
`editor_hwpx_render_pages`, `editor_hwpx_save_source`, and
`editor_hwpx_save_checkpoint`.

## Lifecycle

1. Open exact bytes with `editor_hwpx_open`. Keep the returned opaque `documentId` and `revision`.
2. Inspect `summary`, then page through `outline` and `styles`. Inspect every exact mutation target with `view="target"`; inspect `objects` before object commands.
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
5. Run `editor_hwpx_review` at the current revision. It checks structure, actual rendered cell clipping, pagination, and every requested page (all pages by default).
6. Save with `editor_hwpx_save(mode="verified", profile="submission")` for a deliverable. Verified save preserves the source format (`.hwp` remains HWP; `.hwpx` remains HWPX), requires a clean current-revision review with the same profile, and performs save/reopen/hash/render checks. `checkpoint` is recovery-only.

Binary HWP uses native structural operations and is never silently converted to HWPX. Commands that depend on HWPX package XML (existing-image byte replacement, package-level picture cloning, tracked-change XML, and XML-only convenience style cloning) fail explicitly with `HWP_COMMAND_REQUIRES_HWPX_PACKAGE`. Native `setRunStyle`, `setParagraphStyle`, `applyStyle`, table resize/row insertion, paragraph insertion, and new-image insertion remain available for HWP.

7. Read the opaque artifact, verify its SHA-256 and package signature independently, then delete it.

On cancellation or failed validation, call `editor_hwpx_discard`.

## Inspection views

- `summary`: bounded document counts, page count, warnings, and object totals.
- `outline`: exact document-flow order with locations, text, page hints, styles, hierarchy facts, and cell geometry. Cell items also expose bounded `pictureCount` and `allowedActions`, so picture-slot commands can be targeted without guessing or expanding every cell.
- `styles`: measured body and cell-paragraph style groups with counts and examples. It reports native paragraph/character properties, margins, indentation, outline level, and fingerprints; it does not guess headings from text.
- `targets`: an alias of the ordered target projection with optional kind/table filters.
- `target`: exact current-revision inspection by locations, or unambiguous text resolution by query.
- `objects`: images, drawings, nested tables, and package object inventory.
- `template`: explicit required/removable/protected/replaceable/repeatable/conditional policy plus advisory instruction, conditional, freeform, and unresolved-field suggestions with evidence and confidence. Suggestions never mutate or protect content automatically.
- `page`: one rendered page with dimensions, content bounds, vertical occupancy, density/readability metrics, and document-wide-scanned target linkage. The response reports matched/returned/truncated target counts. Inline SVG is opt-in; the default returns its byte length and SHA-256.
- `quality`: structural, semantic, submission-readiness, actual rendered-layout findings, and explicit visual-policy findings. Use `profile="submission"` when the artifact is meant to be submitted.
- `catalog`: canonical command definitions, readiness, required native methods, and examples.

All list-like views use opaque revision-bound cursors. Do not alter a cursor or reuse it after a revision change.

The bounded input limits are `limit <= 120`, `locations <= 120`,
`textPreviewChars=32..512`, `cellPreviewLimit=0..12`, and cursor length no more
than 2,048 characters. Omit `pages` from review to render every page; an
explicit page list is limited to 120 unique one-based page numbers.

## Table layout

`table.autoFit` measures the first and last rendered cursor rectangles in the selected cell, grows every cell in that physical row together, applies a page-content maximum (or explicit `maxHeight`), and verifies the resulting row height after save/reopen. It rejects the entire atomic batch if the reopened candidate introduces any additional rendered table-cell clipping (`HWPX_AUTOFIT_RENDER_CLIPPING_REGRESSION`) or exceeds the document-level pagination budget (`HWPX_AUTOFIT_PAGINATION_REGRESSION`). The default budget is one added page, no added blank page, and no added sparse/low-occupancy page; callers may explicitly set `maxPageGrowth`, `maxBlankPageGrowth`, and `maxLowOccupancyGrowth`. It fails instead of creating an unbounded row. Estimated text capacity is advisory. `layout.fitText` and `fit=true` preserve original text by default; `materializeBreaks=true` is required to write suggested wrapping, and truncation additionally requires both `truncate=true` and `allowTextLoss=true`.

For newline-delimited `table.writeCell` or `table.writeCells` content whose source paragraphs have different roles, pass one `paragraphTemplateIndices` entry per output paragraph. Binary HWP and HWPX both preserve the selected paragraph, character, and named-style identities through save/reopen. Character or paragraph formatting of a table cell containing more than one paragraph must include `target.cellParagraphIndex`; omission fails atomically with `HWPX_CELL_PARAGRAPH_INDEX_REQUIRED` instead of silently formatting paragraph zero.

Every `render-cell-clip` issue includes renderer provenance and, when the current document target resolves, `targetId`, `tableId`, and exact `location`. Use these fields for repair; `clipId` is render-local evidence and must not be treated as a stable editing identifier.

## Template and cross-document resources

`templatePolicy` is explicit and revision-scoped. `protectedLocations` block writes before mutation. `requiredLocations` must be nonblank in review; `instructionLocations` must be absent from a submission; `freeformLocations` declare extensible body regions; and `allowedUnresolvedLocations` documents intentional exceptions. `requiredTableIds`, `removableTableIds`, `repeatableTableIds`, and `conditionalTableIds` classify table intent without freezing every table. `requiredImageNames` and `replaceableImageNames` control asset preservation. Contradictory roles are rejected as `template_policy_conflict`. HWPX `deleteTable` removes only the exact inspected `<hp:tbl>` subtree, qualifies only that measured structural-reference loss, preserves the rest of the package, and verifies the exact reopened table count. Unclassified baseline loss remains a warning so a template is neither frozen wholesale nor silently destroyed.

An image command can use `assetRef={documentId,imageName}` while both HWP/HWPX sessions are open. The gateway reads the exact inventoried source bytes and records SHA-256, length, MIME, source, and target in `resourceTransfers`. `format.apply` can use `styleRef={documentId,location,scope}` to transfer measured properties rather than unsafe source-local style IDs.

Review renders each current page once, reports clipping plus page/font/line/image/content-bound/occupancy metrics, and reuses that evidence. `profile="submission"` additionally blocks unresolved placeholders, dummy identifiers, explicit required blanks, explicit instruction remnants, and paper/page-anchored floating-image flow risks. The optional `visualPolicy` is the single place to declare editorial expectations: `allowedTextColors` (default black), `failOnColoredText`, `failOnImageFlow`, `failOnSparsePages`/`minVerticalOccupancy`, `requireChapterPageBreak`, `requireHeadingKeepWithNext`, `expectedBodyFont`, `expectedBodyFontSizePt`, and `failOnStyleVariance`. Colored text and image geometry are warnings in structural review but become submission errors by default; heading/style rules become errors only when explicitly enabled. This makes blue instruction text, left-floating images, sparse pages, and missing chapter flow controls observable without guessing protected regions. Sparse pages and incomplete date/signature fields remain visible warnings unless the caller enables the corresponding visual policy. A verified HWPX save/export must repeat the exact visual policy that passed the current-revision review; changing or omitting it fails closed with `quality_visual_policy_required`. MCP responses always return `svgByteLength` and `svgSha256`; `includeSvg=true` additionally returns the exact inline SVG without removing that evidence. Requested pages that do not exist are returned in `unavailablePages` with or without baseline comparison instead of being silently omitted or fabricated.

## Stable failure codes

- Cursor integrity and revision failures: `invalid_cursor`, `cursor_query_mismatch`, `stale_cursor`.
- Artifact type/hash failures: `artifact_format_mismatch`, `artifact_hash_mismatch`.
- Template classification failures: `template_policy_conflict`, `template_required_table`, `template_required_image`, `template_protected_region`.
- Finalization precondition failures: `quality_check_required`, `quality_profile_required`, `quality_visual_policy_required`.
- Bounded fitting failures retain engine codes such as `HWPX_AUTOFIT_PAGE_CONSTRAINT_EXCEEDED` and `HWPX_AUTOFIT_RENDER_CLIPPING_REGRESSION` instead of collapsing to `tool_execution_failed`.

Every failed edit is atomic: revision, live-source bytes, and previously active template policy remain unchanged.

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
- `object.format` accepts `image` or `shape` scope. It covers size,
  treat-as-character, wrapping, anchor/offset, crop, inner/outer spacing and
  border for images; and those controls plus rotation/flip, solid/gradient fill,
  shadow, text-box margins/alignment, rounding, and connector endpoints for
  shapes.
- `table.structure` performs row/column insertion and deletion, cell merge and
  split, or table deletion. `paragraph.structure` performs split,
  merge-with-previous, page break, or column break. Location-invalidating
  structure commands run alone.

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

The former HWPX `read-json`, target-map/find/inspect, semantic-plan, raw quality/render, and split save routes are removed. Internal engine modules may still expose lower-level methods, but they are not public HTTP/MCP contracts.

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
