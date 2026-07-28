# PDF MCP API

The PDF editor is available through `POST /mcp` and direct REST routes under
`/v1/pdf/...`. Open a PDF into an isolated session, read or inspect it, apply
only a catalogued additive command using the current `baseRevision`, render and
quality-check the result, then save/export or discard the session.

## Tools

```text
editor_pdf_open
editor_pdf_discard
editor_pdf_read_json
editor_pdf_target_map
editor_pdf_target_find
editor_pdf_target_inspect
editor_pdf_object_inventory
editor_pdf_command_catalog
editor_pdf_apply
editor_pdf_render_pages
editor_pdf_quality_check
editor_pdf_export_pdf
editor_pdf_save_source
editor_pdf_save_checkpoint
editor_pdf_artifact_read
editor_pdf_artifact_delete
```

`editor_pdf_open` requires a top-level `filename` and exactly one of
`bytesBase64` or `bytesRef`. It never opens a fallback sample. Every mutation
uses `documentId` and `baseRevision`; stale revisions fail without a partial
write.

## Minimal workflow

```text
1. editor_pdf_open
2. editor_pdf_read_json and editor_pdf_object_inventory
3. editor_pdf_command_catalog
4. editor_pdf_apply with the current baseRevision
5. editor_pdf_render_pages and editor_pdf_quality_check
6. editor_pdf_save_source or editor_pdf_export_pdf
7. editor_pdf_artifact_read, verify SHA-256, then editor_pdf_artifact_delete
```

Call `editor_pdf_discard` instead of saving whenever the work is cancelled or
the quality check fails. Artifacts are opaque server-side references: callers
must retrieve and hash-check them before deleting them. The API intentionally
does not provide arbitrary existing-text or existing-image replacement; see
[PDF_EDITOR.md](PDF_EDITOR.md) for the supported command boundary.
