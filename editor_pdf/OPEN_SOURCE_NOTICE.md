# PDF editor open-source notice

The PDF editor is part of the MPL-2.0 Academic Editor runtime. It uses these
permissively licensed upstream components:

- Mozilla PDF.js 6.2.108 - Apache-2.0
- pdf-lib 1.17.1 - MIT
- @napi-rs/canvas 0.1.80 - MIT
- @embedpdf/snippet 2.14.4 - MIT
- @embedpdf/pdfium 2.14.4 - MIT wrapper around PDFium WebAssembly
- @embedpdf/fonts-kr 1.0.0 - OFL-1.1 Noto Sans KR font files
- PDFium WebAssembly distributed by EmbedPDF - permissive PDFium and bundled
  third-party notices retained in the pinned package
- @libpdf/core 0.3.4 - MIT; its `src/fontbox/` component is Apache-2.0

The PDF font registry exposes only redistributable font families and records
their license next to each UI option: Noto, Nanum, Pretendard, Carlito,
Liberation (OFL-1.1), Caladea (Apache-2.0), and DejaVu Sans (Bitstream Vera).
The service reads those files from the shared Academic Editor font pack or the
host font directory; it does not redistribute Microsoft or Apple system fonts.

Exact transitive dependency versions are recorded in `package-lock.json`.
Copyright and license files shipped by those packages must be retained in
binary distributions and reflected in the service-level open-source notice.

The browser editor uses PDFium for rendering, annotations, forms, signatures,
search, attachments, and destructive redaction. Server-side commands continue
to fail closed for operations that have not yet passed the independent
save/reopen/render compatibility checks.
