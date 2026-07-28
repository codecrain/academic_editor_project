# Academic Editor Documentation

This index lists the current product contracts. Dated implementation plans and
superseded design notes are intentionally not published as documentation.

## Canonical documents

- [README.md](../README.md): repository ownership, runtime topology, deployment,
  and verification commands.
- [API.md](../API.md): complete REST, MCP, WOPI, revision, quality, and artifact
  contracts.
- [HWPX_EDITOR.md](HWPX_EDITOR.md): HWPX engine capabilities, limits, and
  acceptance criteria.
- [HWPX_MCP_API.md](HWPX_MCP_API.md): concise HWPX MCP workflow and examples.
- [PDF_EDITOR.md](PDF_EDITOR.md): PDF engine scope, safe-edit limits, and
  save/reopen/render acceptance criteria.
- [PDF_MCP_API.md](PDF_MCP_API.md): concise PDF MCP workflow and examples.
- [DOCX_IFRAME_INTEGRATION.md](DOCX_IFRAME_INTEGRATION.md): mixed-section page
  preservation, the implemented iframe bridge, and the proposed host/editor
  context-menu messaging contract.
- [evaluation/hwpx-public-sector-v1/README.md](../evaluation/hwpx-public-sector-v1/README.md):
  100-case public-sector evaluation corpus.
- [evaluation/hwpx-public-sector-v1/METHODOLOGY.md](../evaluation/hwpx-public-sector-v1/METHODOLOGY.md):
  attachment grounding, scoring, and evidence limits.

## Executable sources of truth

- `editor_docx/scripts/docx-command-catalog.mjs`: 31 canonical DOCX commands, including stable reference controls.
- `editor_hwpx/scripts/hwpx-command-catalog.mjs`: 37 canonical HWPX commands.
- `editor_pdf/scripts/pdf-command-catalog.mjs`: 6 canonical PDF commands for
  additive page-content edits.
- `editor_common/editor-mcp-tool-factory.mjs`: shared MCP schema factory.
- `editor_server/editor-mcp.mjs`: 16 public MCP tools for each of DOCX, HWPX,
  and PDF (48 total).
- `editor_server/editor-gateway.mjs`: shared HTTP transport, WOPI, session, and
  artifact gateway.
- `editor_common/document-api-core.mjs`: format-neutral revision and session
  contract.

The executable catalogs and `tools/list` take precedence over prose if a
release accidentally drifts. `npm run test:runtime` includes documentation
contract gates so such drift is treated as a test failure.

## Source and product boundary

`editor_docx/`, `editor_hwpx/`, and `editor_pdf/` are separate editor engines.
They do not import each other's implementation. Engine code shares only the
format-neutral modules under `editor_common/` and the server transport under
`editor_server/`. Repository-wide orchestration belongs in
`editor_common/scripts/`; it may start, stop, deploy, or verify engines without
becoming part of any engine.
Compatibility entrypoints under each engine are thin re-exports; they do not
duplicate gateway or MCP implementation.

The large README trees inside the vendored editor engines are upstream source
documentation. They are useful when modifying those engines but are not the
Academic Editor API contract.

## Evaluation boundary

The public-sector v1 runner uses local deterministic REST and MCP calls. It
does not call OpenAI or any other model API. The calling agent reads the
question and evidence; the runner verifies that every declared source fact is
present at the expected saved target after reopen.
