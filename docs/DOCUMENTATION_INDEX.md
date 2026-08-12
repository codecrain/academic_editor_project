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
- [evaluation/hwpx-agent-final-20-v1/README.md](../evaluation/hwpx-agent-final-20-v1/README.md):
  canonical 20-case HWPX Agent stress-validation contract and editor replay
  gate.
- [evaluation/hwpx-agent-final-20-v1/FINAL_VALIDATION.md](../evaluation/hwpx-agent-final-20-v1/FINAL_VALIDATION.md):
  authoritative inputs, completion criteria, claim boundary, and latest
  verified execution.
- [evaluation/hwpx-agent-final-20-v1/METHODOLOGY.md](../evaluation/hwpx-agent-final-20-v1/METHODOLOGY.md):
  attachment grounding, scoring, and evidence limits.

## Executable sources of truth

- `editor_docx/scripts/docx-command-catalog.mjs`: 31 canonical DOCX commands, including stable reference controls.
- `editor_hwpx/scripts/hwpx-command-catalog.mjs`: 42 canonical HWPX commands, including revision-bound field updates.
- `docs/HWPX_MCP_API.md`: contract 3.0.0 lifecycle, inspection views, policy-bound review/finalization, and stable failure semantics.
- `docs/HWPX_EDITOR.md`: current engine ownership, complete command inventory, safe workflow, and verification commands.
- `editor_pdf/scripts/pdf-command-catalog.mjs`: 46 canonical PDF commands for
  PDFium browser tools and transactional advanced document operations.
- `editor_common/editor-mcp-tool-factory.mjs`: shared MCP schema factory.
- `editor_server/hwpx-mcp-contract.mjs`: single executable HWP/HWPX MCP identity,
  tool/view/mode lists, command enum, lifecycle, and initialization guidance.
- `editor_server/editor-mcp.mjs`: 17 DOCX, 9 HWPX, 16 PDF, and 7 Image Studio
  public MCP tools (49 total).
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
does not call OpenAI or any other model API. It replays checked-in oracle
commands and verifies every declared source fact after reopen, so it is an
editor gate rather than an HWPX Agent run.
