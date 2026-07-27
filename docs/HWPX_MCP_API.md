# HWPX MCP and REST quick contract

## MCP tools

Call `tools/list` at runtime. The current HWPX tools are:

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
editor_hwpx_save_source
editor_hwpx_save_checkpoint
editor_hwpx_artifact_read
editor_hwpx_artifact_delete
```

HWPX deliberately has no `export_pdf` tool.

## Required agent sequence

```text
open
  -> read_json
  -> command_catalog
  -> target_map/find
  -> target_inspect
  -> object_inventory when required
  -> apply
  -> quality_check
  -> render_pages
  -> save_checkpoint for review, or save_source for final output
  -> artifact_read by the trusted application
  -> artifact_delete
```

On cancellation or any unresolved failure, call `editor_hwpx_discard`.

## MCP examples

Open:

```json
{
  "name": "editor_hwpx_open",
  "arguments": {
    "filename": "briefing.hwpx",
    "bytesBase64": "<base64>"
  }
}
```

Inspect and apply:

```json
{
  "name": "editor_hwpx_target_inspect",
  "arguments": {
    "documentId": "doc_...",
    "locations": [
      {"paragraph":{"section":0,"number":31}},
      {"tableId":"tbl_12","cell":{"number":21}}
    ]
  }
}
```

```json
{
  "name": "editor_hwpx_apply",
  "arguments": {
    "documentId": "doc_...",
    "revision": 1,
    "commands": [
      {
        "commandId": "summary",
        "op": "text.replaceParagraph",
        "location": {"paragraph":{"section":0,"number":31}},
        "text": "검증된 요약"
      },
      {
        "commandId": "status",
        "op": "table.writeCell",
        "location": {"tableId":"tbl_12","cell":{"number":21}},
        "text": "검증 완료",
        "fit": true,
        "fitOptions": {"maxLines":2,"truncate":false}
      }
    ]
  }
}
```

Every apply is all-or-nothing and advances the revision exactly once.

## REST mapping

REST uses `POST /v1/hwpx`:

```text
/documents/open
/documents/{id}/documents/read-json
/documents/{id}/documents/discard
/documents/{id}/target/map
/documents/{id}/target/find
/documents/{id}/target/inspect
/documents/{id}/object/inventory
/documents/{id}/commands/catalog
/documents/{id}/commands/apply
/documents/{id}/quality/check
/documents/{id}/quality/render-compare
/documents/{id}/documents/save-source
/documents/{id}/documents/save-checkpoint
```

REST `open` accepts the nested source form:

```json
{
  "filename": "briefing.hwpx",
  "source": {"bytesBase64":"<base64>"}
}
```

MCP `open` does not: its `bytesBase64` or `bytesRef` field is top-level.

## Finalization and artifact safety

Save returns an opaque artifact identifier and hashes; it never exposes a
server-local file path to the model. Only the trusted application reads the
artifact. Delete it after handoff. Abandoned artifacts expire by
`EDITOR_MCP_ARTIFACT_TTL_MS`.

Exact schemas, cursor rules, response budgets, authorization, and error
envelopes are defined in [`../API.md`](../API.md).
