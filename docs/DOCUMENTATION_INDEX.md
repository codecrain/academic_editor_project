# Document editor documentation

This index is the only supported starting point for the current editor
contract. Files under vendored upstream source trees may describe upstream
experiments or historical internals; they are not the product API contract.

## Current contracts

- [`../API.md`](../API.md): complete REST and MCP transport contract shared by
  DOCX and HWPX.
- [`HWPX_EDITOR.md`](HWPX_EDITOR.md): HWPX architecture, preservation rules,
  capability matrix, and known limits.
- [`HWPX_MCP_API.md`](HWPX_MCP_API.md): concise HWPX agent workflow, tool list,
  request examples, PDF export, Studio safety boundary, finalization, and
  failure behavior.
- [`../evaluation/hwpx-public-sector-v1/README.md`](../evaluation/hwpx-public-sector-v1/README.md):
  acceptance-corpus entry point.
- [`../evaluation/hwpx-public-sector-v1/METHODOLOGY.md`](../evaluation/hwpx-public-sector-v1/METHODOLOGY.md):
  scoring, hard failures, and reproducibility.
- [`../evaluation/hwpx-public-sector-v1/PROVENANCE.md`](../evaluation/hwpx-public-sector-v1/PROVENANCE.md):
  attachment sources, licenses, hashes, and adversarial fixtures.

## Contract source of truth

Documentation explains behavior, but executable catalogs and tests decide
whether a command is supported:

- `editor_hwpx/scripts/hwpx-command-catalog.mjs`
- `editor_hwpx/scripts/hwpx-runtime-readiness.mjs`
- `editor_hwpx/scripts/hwpx-mcp-tools.mjs`
- `editor_hwpx/scripts/hwpx-native-pdf.mjs`
- `editor_docx/scripts/docx-command-catalog.mjs`
- `editor_docx/scripts/editor-mcp.mjs`
- `editor_docx/scripts/editor-gateway.mjs`
- `npm run test:runtime`
- `npm run test:hwpx-evaluation`

Generated evaluation results, browser downloads, Hancom evidence, PDFs, caches,
and temporary artifacts are intentionally excluded from source control.

When prose and an executable catalog differ, fix the prose and code together.
Do not infer product support from lower-level RHWP tests alone.
