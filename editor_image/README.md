# Image Studio foundation

`/image/` is the local, non-generative raster image editor that complements the DOCX and HWPX engines. It is deliberately separate from document editing: users can make precise image changes, export the result, and then reinsert the file into a document through the existing document workflows.

The first foundation uses the pinned miniPaint source in `vendor/minipaint`. It provides a practical professional raster baseline: layers, masks, selections, brush and clone tools, crop and resize, transforms, color adjustments, filters, text, shapes, compositing, import/export, and undo/redo.

## Intentional boundaries

- OCR is not included.
- No OpenAI API or other hosted AI service is invoked.
- The editor is served with a content-security policy that permits only this gateway origin, `blob:`, and `data:`. The upstream editor's online asset, font, and image-search links therefore cannot send image data to third parties.
- Semantic generation and broad image rewriting remain a Codex responsibility. This engine focuses on exact, user-controlled local editing that a document agent cannot reliably express through a prompt.

## Run

Start the existing gateway and open `http://127.0.0.1:11004/image/`:

```powershell
$env:EDITOR_IMAGE_BASE_PATH = '/image/'
$env:EDITOR_GATEWAY_IMAGE_STATIC_ROOT = "$PWD/editor_image/vendor/minipaint"
node editor_server/editor-gateway.mjs
```

The gateway configuration defaults to those same values, so the two environment variables are only needed for a custom deployment path.

## Local image-session bridge

The gateway also exposes an in-memory bridge for opening an existing local image and returning its edited PNG without exposing a global editor token to the browser.

1. `POST /api/image-sessions` with `{ "filename": "figure.png", "bytesBase64": "..." }`.
2. Open the returned `editorUrl`. It contains an unguessable, session-scoped capability in its path; miniPaint loads the source bytes automatically.
3. Use **Save image**. The flattened PNG is retained as the session result and is available at the returned `downloadUrl`.
4. Use the existing DOCX `image.replace` or `image.insertAfterParagraph` command with those result bytes, then save, reopen, and render the document as usual.

Sessions are memory-only, expire after two hours by default, accept only complete PNG/JPEG/GIF/WebP payloads, and cap each source/result at 25 MiB. The browser receives no MCP bearer token and cannot enumerate other sessions.

For Codex, the same bridge is exposed through MCP as `editor_image_open`, `editor_image_session_read`, `editor_image_session_result_read`, `editor_image_session_save`, and `editor_image_session_delete`. `editor_image_session_result_read` returns the saved bytes and SHA-256 only after an explicit save, so Codex can pass the exact bytes to DOCX `image.replace` or `image.insertAfterParagraph`. `editor_image_open` returns the isolated editor URL plus the session capability; it never puts image bytes into the tool-list response or a browser-visible global credential.

See [OPEN_SOURCE_NOTICE.md](OPEN_SOURCE_NOTICE.md) for the license and pinned revision.
