# PDF editor open-source notice

The PDF editor is part of the MPL-2.0 Academic Editor runtime. It uses these
permissively licensed upstream components:

- Mozilla PDF.js 6.2.108 - Apache-2.0
- pdf-lib 1.17.1 - MIT
- @napi-rs/canvas 0.1.80 - MIT
- @embedpdf/snippet 2.14.4 - MIT
- PDFium WebAssembly distributed by EmbedPDF - permissive PDFium and bundled
  third-party notices retained in the pinned package
- @libpdf/core 0.3.4 - MIT; its `src/fontbox/` component is Apache-2.0

Exact transitive dependency versions are recorded in `package-lock.json`.
Copyright and license files shipped by those packages must be retained in
binary distributions and reflected in the service-level open-source notice.

The browser editor uses PDFium for rendering, annotations, forms, signatures,
search, attachments, and destructive redaction. Server-side commands continue
to fail closed for operations that have not yet passed the independent
save/reopen/render compatibility checks.
