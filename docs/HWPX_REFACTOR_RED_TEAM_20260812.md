# HWP/HWPX API refactor and red-team record — 2026-08-12

## Scope and outcome

This pass changed the Academic Editor HWP/HWPX runtime only. It did not author
or overwrite the user's B document. The public surface remains nine lifecycle
tools and now exposes 41 catalog-driven commands. Fine-grained formatting is
centralized in one source-aware property contract instead of being fragmented
into one MCP tool or validator per property.

## Consolidated design

- `editor_hwpx_inspect` owns bounded summary, outline, styles, targets, target,
  objects, quality, and catalog views.
- `editor_hwpx_edit` owns atomic current-revision command execution.
- `editor_hwpx_review` owns current-revision quality and full-page render
  coverage. `editor_hwpx_save(mode="verified")` requires that review.
- `format.apply` owns character, paragraph, cell, and table properties.
- `object.format` owns image and shape properties.
- `table.structure` owns row/column insertion and deletion, merge/split, and
  table deletion. `paragraph.structure` owns split/merge and page/column breaks.
- `PATCH_COLLECTIONS`, `resetPendingPatches`, `hasPendingPatches`, and
  `adoptCommittedBytes` replace repeated pending-state reset and commit blocks.

The executable format contract rejects unknown keys, invalid ranges, and
source-format serializer gaps before mutation. Catalog fields are generated
from that same contract, so documentation and execution do not maintain
independent property allowlists.

## Fail-closed findings during implementation

1. Native image-caption creation appeared to succeed but disappeared after
   HWPX reopen. It was removed from `object.format`; the verified separate
   caption-paragraph path remains available through image insertion.
2. New section-column definitions disappeared after HWP and HWPX reopen. The
   unproven command was removed.
3. New numbering definitions did not persist in either serializer. Definition
   creation was removed; existing native hierarchy/list IDs remain selectable.
4. HWPX paragraph keep flags did not round-trip. They are source-gated out of
   the HWPX catalog while remaining available for binary HWP.
5. Table `treatAsChar` and placement flags were duplicated in `table.attr`,
   `table.common.attr`, and `raw_ctrl_data`. The HWP writer preferred the stale
   raw mirror, so changes reverted after reopen. The native setter now commits
   all three representations at one synchronization point.
6. Caption target composition allowed `kind: table` to overwrite
   `kind: tableCaption`. The object-spread order was corrected and covered by
   adapter plus save/reopen tests.

## Direct red-team matrix

All cases below use real HWP or HWPX bytes. Accepted mutations are saved,
reopened, and checked again; the rejection case checks unchanged revision and
byte identity.

- Character, 8: bold, italic, underline, strike, font size, text color, shade
  color, kerning.
- Paragraph, 8: center, right, justify, percent line spacing, indent, left
  margin, before/after spacing, HWP keep/page-flow flags.
- Cell, 6: horizontal padding, vertical padding, center alignment, bottom
  alignment, header flag, protection flag.
- Table, 5: cell spacing, inner padding, repeated header, row page break,
  floating top-and-bottom wrap with `treatAsChar=false`.
- Image, 3: size, inline/treat-as-character mode, padding.
- Shape, 3: rotation, border, solid fill.
- Structure, 2: row/column insert-delete round trip; merge-split round trip.
- Atomicity, 1: undocumented property rejection leaves bytes and revision
  unchanged.

Result: 36/36 actual mutation/rejection cases passed. A further 32 static
contract acceptance, rejection, duplicate-field, and source-gating cases
passed, for 68/68 in the focused suite.

## Public lifecycle proof

An ephemeral loopback MCP gateway executed both source formats through the
public contract:

```text
open -> inspect(catalog/outline/styles/target) -> edit -> inspect ->
review(all pages) -> save(verified) -> artifact_read(hash) -> artifact_delete
```

The binary HWP path applied paragraph text replacement plus `format.apply`
alignment and line spacing in one atomic edit. Review returned one of one pages,
zero errors, zero warnings, and zero rendered cell clips. Verified save reopened
as HWP, retained the OLE signature, and the temporary artifact was deleted.

## Regression evidence

- Focused format/structure red team: 68/68 passed.
- HWP/HWPX API suite: 228/228 passed.
- Complete editor runtime suite: 428/428 passed.
- Documentation contract: 4/4 passed.
- Public-safety scan: 697 repository-owned files passed; 90,287 vendored files
  were intentionally skipped by the scanner.
- Skill inventory: 41 commands, seven categories, nine tools, PASS.
- Core build parity: `pkg`, Node `@rhwp/core`, and Studio `@rhwp/core` matched.
  Final WASM SHA-256:
  `a2cf6954c16fc142208ddabecff39f156b169d724415325388b0c928f91af590`.

## User A/B read-only baseline

The original files under the user's Academic Editor document directory were
opened without mutation using the rebuilt runtime and checked across all
rendered pages.

| File | Pages | Paragraphs | Tables | Cells | Pictures | Actual rendered cell clips |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A completed reference | 65 | 583 | 53 | 2,497 | 19 | 0 |
| B original form | 17 | 214 | 44 | 942 | 0 | 0 |

Capacity heuristics still report 1,346 warnings for A and 149 for B. These are
advisory estimates such as `cell-overflow-risk` and must not be presented as
actual clipping. Rendered glyph-versus-cell rectangles are the blocking source
of truth.

## Runtime ownership

WASM build containers used `--rm` and no build/test process remained after the
checks. Ephemeral gateway tests closed their servers and deleted their
artifacts. The pre-existing Academic Editor container and user Browser tabs were
left untouched.
# 2026-08-12 MCP contract synchronization addendum

- Introduced `editor_server/hwpx-mcp-contract.mjs` as the executable HWPX MCP
  identity for contract version `2.0.0`, nine tool names, eight inspection
  views, save modes, lifecycle order, command enum, and initialization guidance.
- The live `initialize` response, `tools/list`, repository adapter, canonical
  documentation, local Codex skill inventory, and `~/.codex/config.toml`
  registration were compared by executable checks. The live inventory passed
  with 9 HWPX tools and 41 commands across 7 categories.
- A real Streamable HTTP lifecycle opened `ref_text.hwpx`, inspected the exact
  paragraph at revision 1, replaced its text at revision 2, reloaded the exact
  `browserPresentation.url`, rendered all 1/1 pages, reported zero clipping and
  zero warnings, saved in verified mode, independently read the artifact,
  matched SHA-256 `7b1b38a1103a96f4bc76ebb086820a77c3220e92d4f7c5b9f355d536e1430de8`,
  confirmed the `50-4B-03-04` ZIP signature, reopened the saved bytes, confirmed
  the edited text, rerendered all pages, discarded the reopened session, and
  deleted the artifact.
- Live testing found two contract defects missed by static inventory: catalog
  guidance still named removed `target_map`/`target_find`/`target_inspect`
  tools, and the catalog described `commandId` as optional while the public MCP
  schema required it. Public catalog projection now names
  `editor_hwpx_inspect(view="target"|"objects")`, requires `commandId`, and
  emits complete examples. The direct internal API remains backward compatible
  with optional command IDs.
- The first full HWPX regression exposed that an attempted global `commandId`
  requirement had incorrectly changed the internal API. That change was split
  into the public MCP projection; focused 59/59 tests then passed, followed by
  `test:hwpx-api` at 228/228 and `test:runtime` at 430/430.
- Every gateway process, Browser tab, document session, artifact, and temporary
  file created by this verification was closed or deleted. Pre-existing Docker
  runtime ownership was not changed.

## 2026-08-12 contract 2.1 completion and live red-team addendum

The earlier 2.0 synchronization record above is historical. The executable
command catalog, MCP identity, live `initialize` response, Codex skill, and
canonical documentation now all report `2.1.0`. The public surface remains
compact: 9 lifecycle tools, 10 bounded inspection views, 41 commands, and 7
command categories.

### Engine and API changes

1. Revision-scoped analysis is cached and invalidated only after a real commit.
   A 65-page binary HWP no longer rebuilds and serializes its complete target
   graph for every outline cursor.
2. The open baseline retains paragraph hierarchy/style fingerprints, table
   dimensions/cell fingerprints, object hashes, placed-picture identities, and
   fields. Quality can therefore detect required table/image loss and style
   drift instead of comparing page count alone.
3. Template intent is caller-explicit through `templatePolicy`. Protected
   locations reject writes before mutation; required/removable tables and
   required/replaceable images have distinct preservation semantics. No region
   is guessed protected from appearance, and failed edits do not commit policy.
4. `page` inspection and review return bounded render metrics plus SVG length
   and SHA-256 by default; inline SVG is opt-in. Review reuses its current full
   render instead of rendering the same revision twice and reports out-of-range
   pages separately.
5. Text fitting is non-destructive by default. It returns original `text` and
   separate `suggestedText`; line-break materialization is explicit, and
   truncation additionally requires `allowTextLoss=true`. Fit-only batches keep
   document bytes, revision, and exact-target inspection preconditions.
6. `table.autoFit` has an explicit/page-derived maximum height and fails closed
   instead of creating an unbounded row or accidental pagination cascade.
7. Native HWP image insertion records the exact input hash/MIME/dimensions and
   verifies the reopened embedded bytes. Cross-document `assetRef` and measured
   `styleRef` transfer exact resources while both sessions are open. Only
   target-format-safe measured style properties cross document boundaries;
   source-local style IDs do not.
8. Native HWP asset transfer rejects unsupported MIME before serializer entry
   with `asset_target_format_unsupported`; PNG, JPEG, GIF, and BMP are accepted.
9. Save responses now expose `byteLength` beside SHA-256 and reopen evidence.
   The independent verifier accepts both HWPX ZIP and native HWP OLE/CFB, then
   saves, reopens, quality-checks, and renders the requested pages.
10. Duplicate capability values and asset-only naming were removed. Cross-
    document resolution is one resource path, and format-property knowledge is
    exposed only through the HWPX adapter so the shared gateway does not import
    an engine implementation directly.

### Failures found by real calls and their fixes

- The executable catalog still returned 2.0.0 while MCP returned 2.1.0. MCP
  version now derives from the live catalog, and the skill client identifies as
  2.1.0.
- `layout.fitText.options` existed in execution code but was omitted from the
  published optional fields. The catalog now publishes the complete loss and
  materialization contract.
- A fit-only batch returned `changed:false` but saved identical bytes and
  advanced revision. It now takes a read-only path with no save/adopt stage.
- Unauthorized truncation surfaced as HTTP 500. It now returns stable 422 code
  `text_loss_not_authorized` and leaves bytes/revision/policy unchanged.
- A style transfer initially copied serializer-dependent source properties and
  failed exact reopen verification. Transfer was narrowed to the intersection
  of the target format contract and a conservative portable-property set.
- The first A image chosen by the red team reported an unsupported MIME for a
  native HWP target. The gateway now rejects it before mutation and reports the
  accepted MIME set; the subsequent PNG transfer succeeded.
- An identical B baseline produced 44 false `table-dimensions-changed` warnings
  because one side used `rowCount/columnCount` and the comparator read
  `rows/cols`. Dimension normalization removed all 44 false warnings while
  preserving the real render blocker.
- The artifact verifier rejected every `.hwp` before opening it. It now checks
  native OLE/CFB signature and uses the same save/reopen/full-render gate as
  HWPX.
- Two PowerShell harness attempts failed before editor work because one used an
  unsupported null-coalescing operator and one sent a non-UTF-8 JSON string.
  The UTF-8 byte-body harness resolved the Korean paths. One later harness typo
  opened a read-only B session before local return failed; its exact document ID
  was recovered from lifecycle logs and explicitly discarded.

### Live 11004 evidence

The final checks used `http://127.0.0.1:11004/mcp` and the original user files,
without modifying either original.

| Evidence | Result |
| --- | --- |
| A reference | 65 pages, 3,027 outline targets, first five returned in 19 ms, 19 images and 19 placed pictures |
| B original | 17 pages, 44 tables, zero images, 17/17 pages rendered |
| B baseline comparison | zero table-dimension false warnings after repair |
| B blocking render evidence | one real vertical cell clip on page 14, retained as an error |
| MCP render payload | first/last pages returned SVG byte length and SHA-256 with no inline SVG by default |
| Template rejection | `template_protected_region`, revision remained 1 |
| Safe fitting | original text preserved, suggested breaks returned, revision remained 1 |
| Loss rejection | `text_loss_not_authorized`, revision remained 1 |
| Unsupported transfer | `asset_target_format_unsupported`, target unchanged |
| Successful transfer | A PNG SHA-256 `559438e7ba815f68301e15b5e9e5ea211b2861393fc1a7a5d9610c784b1c2266` plus measured paragraph style transferred to native HWP |
| Reopened transfer target | 1 image, 1 placed picture, quality clean, 1/1 page rendered |
| Verified native artifact | 144,384 bytes, SHA-256 `70e8f7e7c3d0437d8aadebfca2047d81ae776b559364139e0eced8c4cbbabb5e`, OLE/CFB signature valid, artifact deleted |
| Final HWPX save probe | save/read both 7,832 bytes, SHA-256 `bcac33a472aebf86ad7cddd51cb800a5d2e067dead6488c8aad0f35f21cb1485`, reopen/render clean, artifact deleted |

### Final regression gates

- Common API: 5/5 passed.
- HWP/HWPX API, serializer, structural, format, package, and red-team suite:
  232/232 passed.
- Complete editor runtime including boundaries, gateway, MCP, DOCX, HWP/HWPX,
  and PDF: 435/435 passed.
- Live inventory: catalog 2.1.0 = contract 2.1.0 = server 2.1.0; 41 commands,
  7 categories, 9 tools, zero issues.

## Final adversarial validation round

The final round reran the real loopback MCP lifecycle after the earlier report
and deliberately exercised failure paths as well as happy paths. Persistent
evidence is under `.run/hwpx-mcp-red-team-20260812-final/`:

- `live-calls.jsonl`: timestamped MCP/RPC calls with bounded arguments,
  durations, result codes, revisions, hashes, and byte lengths; no credentials
  or document bytes.
- `live-report.json`: 84 named assertions from one uninterrupted successful
  run.
- `gateway-v14.out.log`: lifecycle v2 open/inspect/edit/review/save/discard
  traces for the final runtime.

Additional defects found and fixed in this round:

1. Intentional HWPX `deleteTable` was rejected by the same package-loss guard
   intended to prevent accidental loss. Qualification now accepts only the
   exact measured reference loss from the inspected table subtree.
2. Full structural re-export for one table deletion changed a two-page source
   to four pages. Deletion is now a package-local atomic subtree removal and
   preserves all unrelated entries and pagination.
3. Positional table IDs changed after deletion and caused false missing-table
   findings. Baseline matching now uses structural fingerprints and remembers
   explicitly deleted baseline IDs.
4. Required/removable policy overlap was ambiguous, and required images were
   not fully protected against byte or placement loss. Contradictions now fail
   before mutation; required table/image semantics are blocking.
5. `includeSvg=true` removed the otherwise returned SVG length/hash, and review
   silently omitted non-existent requested pages outside baseline comparison.
   Hash/length are now invariant and all missing pages appear in
   `unavailablePages`.
6. Artifact hash/type, cursor integrity/revision, and uppercase engine failures
   collapsed to `tool_execution_failed`. They now retain stable public codes.
7. `table.autoFit` could commit when the reopened SVG introduced new cell
   clipping. It now compares rendered clipping evidence before adoption and
   rolls back the entire mixed batch on regression.
8. Exact style verification compared array identity, so two equal language
   ratio arrays failed. Structural style values now use deterministic deep
   value equality.
9. Table `styleRef` was advertised but read a nonexistent `table.style` path.
   It now transfers measured `table.layout.properties` and verifies the target
   after reopen.
10. Public outline projection discarded picture-slot count and allowed actions,
    making `image.replaceInCell` practically undiscoverable. Cell outline items
    now expose bounded `pictureCount` and `allowedActions`; picture cloning also
    has an exact reopened destination-cell postcondition.

The successful live run covered contract/schema rejection, exact live-source
hash changes, protected edits, current-revision review gates, cursor tampering
and staleness, non-destructive and authorized-loss fitting, required/removable
table policies, exact table deletion and reopen, auto-fit constraint and render
rollback, four-scope cross-document style transfer, unsupported and supported
native-HWP image transfer, HWP OLE/CFB save/reopen, HWPX package image
replacement, cell picture replacement, artifact hash fail-closed behavior, and
closed-source rejection. Every saved probe was fully reviewed, read back with
matching byte length and SHA-256, reopened, and deleted from the artifact store.

The Codex in-app Browser was also tested on the exact URL returned by
`editor_hwpx_open`. The same tab displayed `안녕 Hello 123`, MCP committed
`BROWSER LIVE REVISION 2`, and a reload of that same URL visibly showed the new
text. Before/after screenshots were 45,764/46,613 bytes with SHA-256
`cbefe0d8a9f87c976a5446f374bc2d34d3fb393e9795a3beebc1a19d73cf025f`
and `6567405f14ffbe1dafd4d2bcc16a88a37de675047a34cc5ab6e029f6c626250b`.
The canvas text is not projected into the accessibility DOM, so visual evidence
was paired with exact target re-inspection (`currentText`) and a clean 1/1-page
review. The probe session was discarded and the task-created Browser tab was
closed.

Final gates after these fixes:

- Live MCP: 84/84 checks passed.
- HWP/HWPX API, package, serializer, structure, formatting, and red-team:
  234/234 passed.
- Complete editor runtime across DOCX, HWP/HWPX, PDF, gateway, MCP, workers,
  and documentation contracts: 437/437 passed.
- Public repository safety: 1,472 repository-owned files passed.
- Independent artifact verification passed for a 3-table/2-page deletion result,
  a native-HWP image-transfer result (valid OLE/CFB, 1/1 page), and an
  11-page HWPX cell-image replacement (all pages rendered after reopen).
