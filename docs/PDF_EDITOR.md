# PDF Editor

`editor_pdf/` is an independent PDF engine. The gateway serves its browser UI
at `/pdf/` and exposes the same revision-bound REST/MCP session pattern as the
DOCX and HWPX engines. It uses PDF.js for rendering and `pdf-lib` for writes.

## Scope and safety boundary

The current engine supports additive page-content edits and page rotation. It
does not claim arbitrary replacement or reflow of existing PDF text, images,
form content, or the PDF object graph. Such commands are rejected rather than
silently rasterizing or reconstructing source pages. A visible signature
appearance is an image overlay, not a certificate-backed digital signature.

Coordinates are PDF points measured from the page's lower-left origin. Each
write requires the session's current `baseRevision`. After every write, reopen
the saved bytes, inspect the declared page/object invariants, render the
affected pages, and run `quality_check` before `save_source` or `export_pdf`.

## Supported commands

```text
text.add
highlight.add
ink.add
image.add
signature.addAppearance
page.rotate
```

The executable catalog at `editor_pdf/scripts/pdf-command-catalog.mjs` is the
authoritative schema, required fields, and numeric-limit source.

## Verification

```powershell
npm.cmd run test:pdf-api
npm.cmd run test:runtime
```

These deterministic tests cover catalog validation, save/reopen/render
invariants, and browser UI wiring. They do not certify a certificate-backed
signature or arbitrary source-object replacement, neither of which is offered.

## Dependencies and notices

Install the isolated PDF runtime dependencies with `npm install --prefix
editor_pdf`. License and distribution obligations are recorded in
[editor_pdf/OPEN_SOURCE_NOTICE.md](../editor_pdf/OPEN_SOURCE_NOTICE.md).
