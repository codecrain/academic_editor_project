# HWPX public-proposal platform completion and red-team report

Date: 2026-08-13 (Asia/Seoul)
Contract: `academic-editor-mcp` 3.1.0
Endpoint under test: `http://127.0.0.1:11004/mcp`

## Outcome

The editor now exposes the missing platform evidence and mutation primitives needed to make a completed public proposal a fail-closed artifact instead of accepting a structurally readable but editorially unfinished document. The change adds one canonical edit operation, `image.insertInCell`, but does not add another top-level MCP tool or a parallel lifecycle. Review, save, export, artifact retrieval, and browser presentation remain in the existing nine-tool contract.

The current B candidate was re-evaluated against all four real documents after the implementation. It is correctly rejected with 58 errors. The platform no longer reports that document as an acceptable completed proposal.

## Root problems and implemented controls

### 1. Structural quality was being mistaken for proposal completion

The prior structural review could prove that the document reopened and rendered, but it could not reject unavailable-data wording, author instructions, text-only signatures, sparse pages, undersized text, weak font convergence, or poor image placement.

Implemented:

- A centralized `public-proposal` review profile in `editor_server/hwpx-review-profile.mjs`.
- Expanded semantic evidence in `editor_server/hwpx-semantic-evidence.mjs`.
- Expanded rendered visual evidence in `editor_server/hwpx-visual-evidence.mjs`.
- The same profile and exact policies must be repeated at verified save and PDF export.
- New deterministic expectations for minimum paragraph and picture counts.

### 2. The editor could inspect four documents but could not judge transformation parity

Implemented `editor_server/hwpx-reference-comparison.mjs`. A review may now bind three distinct, open reference sessions:

- blank reference form;
- completed reference;
- blank target form;

The current session is the candidate. The comparison measures page, text, paragraph, table, picture, and median rendered-occupancy transformation ratios. The completed reference is rendered once and cached with a bounded cache. Duplicate, missing, closed, or candidate-equal document IDs fail closed.

### 3. Blank signature/seal cells could not receive a new image

The old API could replace an existing cell picture or clone an image already present in the same document. It could not insert a new external or cross-document image into an empty cell.

Implemented the canonical `image.insertInCell` command under the existing `editor_hwpx_edit` tool:

- accepts `bytesBase64` or `assetRef`;
- targets one inspected cell and one explicit cell paragraph;
- bounds requested width and height to the cell;
- HWPX stores an inline cell image;
- binary HWP stores a centered cell-contained overlay and returns `placementMode="cell-anchored-overlay"`;
- save/reopen evidence verifies that the object persists in the intended cell.

The red team exposed and fixed two related defects:

- HWP cross-document asset extraction discarded nested `cellPath` and failed with `Picture 컨트롤이 아닙니다`. `readAsset` now preserves the exact cell path.
- Initial HWP overlay placement was merely inside the cell but left-aligned. Placement now calculates the true rendered cell center. The final reopened offset error is 0.05 px horizontally and 0 px vertically.

### 4. Text labels were being accepted as signatures

`public-proposal` now rejects signature/seal execution fields with no persisted picture. HWPX uses exact cell `pictureCount`. Binary HWP additionally uses saved/reopened page and bounding-box overlap because its native representation is a cell-anchored top-level picture. A picture elsewhere on the same page does not satisfy the rule.

### 5. Chapter and page-flow evidence was incomplete and initially over-broad

The first new rule treated dates, questionnaire items, and multiline numbered prose as chapter titles. It also lacked page hints on bulk target maps.

Fixed:

- enriched target maps with actual paragraph/cell page hints and measured hierarchy/character format;
- excluded dates, questions, multiline prose, and long numbered body blocks from heading classification;
- limited automatic page-break errors to high-confidence prominent top-level chapters;
- retained keep-with-next checks for credible headings and rendered page transitions.

This reduced the real B result from 70 false heading errors to two chapter page-start errors and one genuine subsection keep-with-next error.

### 6. A verified save closed the session and made the Browser URL dead

Verified save now copies the exact verified artifact to a TTL-bound immutable preview before closing mutation state. The same `browserPresentation.url` remains read-only and returns:

- `X-Editor-Finalized: true`;
- `X-Editor-Revision`;
- `X-Editor-Sha256` matching the artifact;
- no-store caching and a hash ETag.

The preview copy is independently hashed and length-checked. Expired previews are pruned with artifact cleanup.

## Real four-document result

Inputs:

| Role | Pages | Paragraphs | Tables | Pictures | Text characters |
| --- | ---: | ---: | ---: | ---: | ---: |
| A blank reference | 11 | 144 | 20 | 0 | 8,440 |
| A completed reference | 55 | 583 | 53 | 62 | 54,160 |
| B blank target | 17 | 214 | 44 | 0 | 10,376 |
| B current candidate | 20 | 217 | 32 | 3 | 15,237 |

Reference transformation ratios:

| Check | Required | B actual | Result |
| --- | ---: | ---: | --- |
| Page growth | 2.500 | 1.176 | fail |
| Text growth | 3.209 | 1.468 | fail |
| Paragraph growth | 2.024 | 1.014 | fail |
| Table growth | 1.325 | 0.727 | fail |
| Picture count | 16 | 3 | fail |
| Median occupancy gap | at most 0.150 | 0.060 | pass |

Final `public-proposal` rejection counts:

| Code | Count |
| --- | ---: |
| `submission-unresolved-placeholder` | 31 |
| `submission-execution-object-missing` | 4 |
| `submission-author-instruction-remains` | 2 |
| `render-font-size-below-policy` | 4 |
| `render-sparse-page` | 1 |
| `render-page-relative-occupancy-low` | 5 |
| `render-image-not-visually-centered` | 2 |
| `heading-page-break-missing` | 2 |
| `heading-keep-with-next-missing` | 1 |
| `style-body-font-dominance-low` | 1 |
| Reference transformation failures | 5 |
| Total | 58 |

## Real signature round trip

Source asset: actual `인감도장.png` from A completed, 70,087 bytes.
Destination: B original, page 15, table `tbl_42`, cell 16 under the representative row's handwritten-signature column.

Steps proven through the live MCP endpoint:

1. Open A completed and B original in isolated sessions.
2. Inventory and link the exact source image and placed picture.
3. Inspect the exact blank B cell.
4. Resize that cell in a separate revision and re-inspect it.
5. Transfer A's seal through `assetRef` and call `image.insertInCell`.
6. Review all 17 pages with structural expectations.
7. Verified-save as binary HWP.
8. Read artifact bytes and independently hash them.
9. Fetch the immutable finalized source and compare its hash.
10. Reopen saved bytes and prove the picture remains spatially centered in the exact cell.
11. Render page 15 and inspect the rasterized page.

Final artifact SHA-256: `6ed545abc17f5f688e255156adb0159bf6d3985278c800b48be6c36d8d2dce69`.
Saved/reopened picture: 40 x 40 rendered pixels.
Center error: x=0.05 px, y=0 px.
The source file was not overwritten; the isolated verified proof is under `.run/platform-redteam-20260812`.

## Automated verification

- Static catalog and contract inventory: 3.1.0, 39 commands, 9 MCP tools, no parity issues.
- Live `initialize` and `tools/list`: 3.1.0 and 9 tools.
- `npm.cmd run test:hwpx-api`: 263 passed, 0 failed.
- `npm.cmd run test:runtime`: 456 passed, 0 failed.
- The exhaustive MCP test executes every one of the 39 commands, every inspect view, and every HWPX tool. It also checks HWPX and HWP blank-cell insertion, duplicate reference IDs, real reference rejection, cross-document assets/styles, failure atomicity, verified save, immutable preview, artifact hash, reopen, and cleanup.
- `git diff --check`: clean.

Detailed evidence:

- `.run/platform-redteam-20260812/live-four-document-review.jsonl`
- `.run/platform-redteam-20260812/live-four-document-review-result.json`
- `.run/platform-redteam-20260812/live-signature-roundtrip.jsonl`
- `.run/platform-redteam-20260812/live-signature-roundtrip-result.json`
- `.run/platform-redteam-20260812/test-hwpx-api.log`
- `.run/platform-redteam-20260812/test-runtime.log`
- `.run/platform-redteam-20260812/B_signature_page_15.png`

## Contract and skill parity

The following sources now describe the same 3.1.0 behavior:

- executable command catalog and MCP JSON Schema;
- `docs/HWPX_MCP_API.md`;
- `docs/HWPX_EDITOR.md`;
- `docs/DOCUMENTATION_INDEX.md`;
- repository `AGENTS.md`;
- local `academic-editor-hwpx` skill, workflow, capability reference, inventory, and MCP client version.

## Remaining evidence boundaries

- The in-app Browser controller failed to establish a connection twice within its 90-second limit. No external browser was substituted. The exact Browser URL, immutable HTTP source, and headers were verified, and page 15 was independently rendered and visually inspected from the saved HWP, but an in-app Browser screenshot is not claimed.
- A native Hancom Office desktop reopen was not run in this pass. RHWP native save/reopen, full-page rendering, exact hash verification, and the real HWP source format were proven. High-risk delivery should still include the normal final Hancom Office visual acceptance step.
- The signed B file is a capability proof based on the blank B form. It is not presented as a completed proposal and intentionally does not pass `public-proposal` because the blank form still contains unfilled fields and template text.
