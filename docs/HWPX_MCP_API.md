# HWPX MCP API

The shared gateway exposes HWPX tools through Streamable HTTP at `/mcp`.
Transport requests are stateless; opened documents are isolated,
revision-bound server sessions.

## Tools

```text
editor_hwpx_open
editor_hwpx_discard
editor_hwpx_read_json
editor_hwpx_target_map
editor_hwpx_target_find
editor_hwpx_target_inspect
editor_hwpx_object_inventory
editor_hwpx_command_catalog
editor_hwpx_apply
editor_hwpx_render_pages
editor_hwpx_quality_check
editor_hwpx_export_pdf
editor_hwpx_save_source
editor_hwpx_save_checkpoint
editor_hwpx_artifact_read
editor_hwpx_artifact_delete
editor_hwpx_semantic_context
editor_hwpx_prepare_plan
editor_hwpx_execute_plan
editor_hwpx_verify_plan
```

Call `tools/list` for the exact JSON Schema. The schema is generated from the
same factory used by DOCX, while format-specific command payloads come from the
HWPX catalog.

## Open

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "editor_hwpx_open",
    "arguments": {
      "filename": "briefing.hwpx",
      "bytesBase64": "<base64>"
    }
  }
}
```

`filename` is required and exactly one of `bytesBase64` or `bytesRef` must be
present. A nested REST-style `source` object is invalid.

## Inspect and apply

Inspect the target before mutation. The `apply` call uses `baseRevision`, not
`revision`.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "editor_hwpx_apply",
    "arguments": {
      "documentId": "doc_...",
      "baseRevision": 1,
      "commands": [
        {
          "commandId": "replace-title",
          "op": "text.replaceParagraph",
          "location": {
            "paragraph": { "section": 0, "number": 4 }
          },
          "text": "2026년 공공기관 업무계획"
        }
      ]
    }
  }
}
```

The complete batch succeeds or fails as one revision. A failed batch produces
no partial mutation.

## Semantic plan and receipt

For ordinary text, paragraph-style, and cell-style editing, use the semantic
sequence rather than constructing raw locations: `semantic_context` returns
stable target IDs and current evidence; `prepare_plan` compiles typed
requirements at one revision; `execute_plan` returns target-level before/after
receipts; and `verify_plan` re-inspects the requirements, runs quality, and
renders every current page. The current typed actions are `replace_text`,
`copy_text_style`, and `copy_cell_style`. A plan token is valid only for its
prepared revision and cannot fall back to a raw command if validation fails.

```json
{
  "name": "editor_hwpx_prepare_plan",
  "arguments": {
    "documentId": "doc_...",
    "baseRevision": 1,
    "requirements": [{
      "id": "replace-title",
      "action": "replace_text",
      "targetId": "s0_p4",
      "text": "2026년도 업무 추진계획"
    }]
  }
}
```

## Quality, render, and artifact lifecycle

Run `editor_hwpx_quality_check` for the returned revision, then render the
required pages. `save_source`, `save_checkpoint`, and `export_pdf` return an
opaque `artifactId`, hashes, and metadata; they never expose a server-local
path.

`artifact_read` returns bounded Base64 bytes. The caller verifies the reported
hash and saved package, then calls `artifact_delete`. Artifacts are not deleted
automatically by `artifact_read`; opportunistic TTL pruning occurs during
artifact-producing operations. Application-level user approval is a caller
policy, not an implicit gateway action.

If the edit is cancelled, discard the current revision explicitly:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "editor_hwpx_discard",
    "arguments": {
      "documentId": "doc_...",
      "baseRevision": 2
    }
  }
}
```

Discard is idempotent and creates no artifact.

## Authentication

When the gateway binds beyond loopback, `/mcp` requires
`Authorization: Bearer <ACADEMIC_EDITOR_MCP_BEARER_TOKEN>`. This internal API
token is separate from short-lived WOPI document tokens. The repository does
not use OpenAI API keys or model calls for editor execution or evaluation.
