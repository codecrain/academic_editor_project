# Image Studio

Image Studio is the self-hosted, non-generative image-editing engine beside the
DOCX, HWPX, and PDF editors.

- `/image/` serves the layer-based raster editor built on pinned miniPaint.
- `/image/vector/` serves the object-based vector workbench built on pinned
  Fabric.js.
- Image-session REST and MCP contracts preserve both a flattened result and an
  editable layered project.

The target is Photoshop/Illustrator-class local editing, not a claim that the
current build already implements every Adobe feature. The authoritative,
testable parity scope and current gaps are tracked in
[ADOBE_PARITY_MATRIX.md](ADOBE_PARITY_MATRIX.md). A feature is not marked
complete until it has a UI or MCP entrypoint, survives save/reopen, produces the
expected rendered output, and has a regression check.

## Intentional boundaries

- OCR is excluded by product decision.
- Adobe cloud services, Stock, Libraries, collaboration, and Firefly/generative
  features are excluded. No OpenAI API or hosted image service is invoked.
- The gateway content-security policy permits only the gateway origin, `blob:`,
  and `data:`. Image bytes are not sent to third-party search, font, or asset
  services.
- Editing is local and deterministic; broad semantic generation remains a
  Codex responsibility.

## Run

Install the pinned vector dependency, initialize the pinned raster source, start
the existing gateway, and open the two editor routes:

```powershell
git submodule update --init --recursive editor_image/vendor/minipaint
npm.cmd --prefix editor_image ci --omit=optional
node editor_server/editor-gateway.mjs
```

- Raster: `http://127.0.0.1:11004/image/`
- Vector: `http://127.0.0.1:11004/image/vector/`

Production deployment performs the same dependency checks and refuses to
replace a healthy gateway if either editor's tracked assets are unavailable.

## Image-session bridge

1. `POST /api/image-sessions` with a filename and PNG/JPEG/GIF/WebP
   `bytesBase64`.
2. Open the returned capability-scoped `editorUrl`.
3. **Save editable project** stores miniPaint JSON without flattening layers.
4. **Save flattened image** stores the rendered PNG for document insertion.
5. Read the selected artifact through REST or MCP, then insert it into DOCX or
   HWPX and perform that document engine's save/reopen/render verification.

Sessions are memory-only, unguessable, expire after two hours by default, and
cannot be enumerated by the browser. Source/result images are capped at 25 MiB;
editable projects are capped at 100 MiB.

MCP tools:

- `editor_image_open`
- `editor_image_session_read`
- `editor_image_session_save`
- `editor_image_session_result_read`
- `editor_image_session_project_save`
- `editor_image_session_project_read`
- `editor_image_session_delete`

See [OPEN_SOURCE_NOTICE.md](OPEN_SOURCE_NOTICE.md) for the pinned components and
license intake rule.
