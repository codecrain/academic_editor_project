# PDF Editor

`editor_pdf/` is an independent PDF engine. The gateway serves its browser UI
at `/pdf/` and exposes the same revision-bound REST/MCP session pattern as the
DOCX and HWPX engines. The browser uses EmbedPDF/PDFium; the server combines
PDF.js, `pdf-lib`, and LibPDF behind one validated command boundary.

## Scope and safety boundary

The browser exposes search, text selection, annotations, shapes, ink, stamps,
comments, form editing, page operations, attachments, and destructive
redaction. The server additionally supports transactional page composition,
metadata, attachments, flattening, AES-256 permissions, and PKCS#12-backed
PAdES signing. A visible signature appearance remains distinct from a digital
signature. A digitally signed session is sealed: reopen the signed output to
start a later revision.

Arbitrary reflow of existing PDF text is not claimed. Browser “insert/replace
text” tools are PDF edit annotations, while destructive redaction is applied
by PDFium. Unsupported source-object rewrites fail closed rather than silently
rasterizing a page.

Coordinates are PDF points measured from the rendered page's top-left origin.
The engine converts them to the PDF page's lower-left coordinate system when
writing. Coordinate edits on already rotated pages are rejected until the
rotation-aware object transform path is implemented. Each
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
signature.addDigital
page.rotate
page.add
page.delete
page.duplicate
page.move
page.crop
document.merge
metadata.set
document.flattenAll
attachment.add
attachment.remove
security.encrypt
security.remove
```

The executable catalog at `editor_pdf/scripts/pdf-command-catalog.mjs` is the
authoritative schema, required fields, and numeric-limit source.

## Verification

```powershell
npm.cmd run test:pdf-api
npm.cmd run test:runtime
```

These deterministic tests cover catalog validation, atomic failure, structural
editing, encryption permissions, save/reopen/render invariants, and browser UI
wiring. Certificate-backed signing is implemented, but release acceptance must
still exercise a real customer-compatible `.p12`/`.pfx` credential and verify
the final signature in an independent validator.

## Dependencies and notices

`sh.start` installs the exact isolated PDF dependencies from its lockfile and
installs Poppler's `pdftoppm` automatically on a first-time Ubuntu deployment.
For local development, install them manually with `npm ci --prefix editor_pdf`.
License and distribution obligations are recorded in
[editor_pdf/OPEN_SOURCE_NOTICE.md](../editor_pdf/OPEN_SOURCE_NOTICE.md).
