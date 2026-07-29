# PDF Editor

`editor_pdf/` is the independent `/pdf/` engine. The browser uses
EmbedPDF/PDFium for viewing and interactive tools. The server combines PDFium,
PDF.js, `pdf-lib`, and LibPDF behind the same revision-bound REST/MCP contract
used by DOCX and HWPX.

## User-visible editing

The top bar exposes **본문·이미지 편집** separately from PDF annotations. This
panel inventories real PDF page objects and supports:

- replacing an existing text object's Unicode text;
- selecting an approved TTF/OTF font, size, color, and opacity;
- embedding Korean fonts instead of rasterizing Korean text;
- replacing an existing PNG/JPEG while preserving its placement;
- moving, scaling, rotating, or skewing an object with its PDF matrix;
- deleting an inspected text, image, path, shading, or form object;
- saving, independently reopening, and refreshing the viewer after each edit.

The standard PDFium toolbar remains responsible for search, selection,
annotations, shapes, ink, comments, stamps, forms, page operations,
attachments, signatures, and redaction. A handwritten signature appearance is
not a certificate-backed digital signature.

## Font policy

PDF embedding uses actual TTF/OTF files. Browser-only WOFF2 files are not
silently converted. The runtime searches `EDITOR_PDF_FONTS_DIR`, the existing
Academic Editor font roots, and then OS font directories. Only the explicit
open-font registry is offered:

- Noto Sans KR / Noto Serif KR — OFL-1.1
- Nanum Gothic / Nanum Myeongjo — OFL-1.1
- Pretendard — OFL-1.1
- Carlito — OFL-1.1; Calibri/Aptos substitute
- Caladea — Apache-2.0; Cambria substitute
- Liberation Sans/Serif/Mono — OFL-1.1
- DejaVu Sans — Bitstream Vera license

Aliases reuse the DOCX/HWPX policy: for example `Malgun Gothic -> Noto Sans
KR`, `Batang -> Noto Serif KR`, `Calibri -> Carlito`, and `Cambria ->
Caladea`. Proprietary fonts are never copied into output merely because they
exist on a developer machine.

## Feature matrix

| Area | Status | Implementation boundary |
| --- | --- | --- |
| Existing text object editing | Supported | PDFium object inventory, exact object/revision precondition, embedded font |
| Existing image replacement/transform | Supported | PDFium image object and transformation matrix |
| Add text/image/highlight/ink | Supported | Transactional server commands and standard toolbar |
| Pages, crop, duplicate, move, merge | Supported | `pdf-lib` page tree operations |
| Forms, annotations, comments, redaction | Supported in browser | PDFium toolbar; flattening is also available server-side |
| Attachments and metadata | Supported | LibPDF and `pdf-lib` |
| AES-256 permissions | Supported | LibPDF |
| Visible and PKCS#12 PAdES signatures | Supported | Appearance and certificate signing are separate commands |
| Render comparison | Supported | Poppler baseline/current page rendering |
| Paragraph reflow across multiple PDF objects | Conditional | PDF is fixed-layout; object-level edits do not invent Word-like reflow |
| Scanned-page OCR | Not bundled | Requires a separately reviewed OCR engine and Korean language data |
| Automatic tagged-PDF remediation | Not bundled | Reading existing tags is possible; trustworthy automatic retagging is not |
| Signature trust-chain verification | Not bundled | Signing exists; independent trust validation remains an external acceptance step |
| Linearization and aggressive lossy image recompression | Not bundled | Normal stream compression is used; qpdf/codec deployment remains optional |

The last five rows deliberately fail closed. They must not be represented as
working merely because a toolbar icon or third-party binary exists.

## Supported commands

```text
text.add
text.replaceObject
highlight.add
ink.add
image.add
image.replaceObject
object.transform
object.delete
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

Object mutations require `target/inspect` at the current revision and carry
both `objectId` and `objectIndex`. Text replacement also carries
`expectedText`. A stale or changed object fails before any partial write.

## Browser security

The internal `/v1/pdf/...` routes remain Bearer-protected. `/pdf/` receives a
short-lived HttpOnly, SameSite=Strict browser-session cookie and can use only
the PDF-scoped `/pdf/api/...` facade. Same-origin checks prevent the UI from
exposing the internal MCP bearer token.

## Verification

```powershell
npm.cmd run test:pdf-api
npm.cmd run test:runtime
```

Acceptance includes exact object inspection, atomic mutation, Korean font
embedding, save/reopen through PDFium and PDF.js, Poppler rendering, and a real
browser workflow that reloads the edited bytes. Release signing still requires
a real customer-compatible `.p12`/`.pfx` and an independent validator.

License and distribution obligations are recorded in
[editor_pdf/OPEN_SOURCE_NOTICE.md](../editor_pdf/OPEN_SOURCE_NOTICE.md).
