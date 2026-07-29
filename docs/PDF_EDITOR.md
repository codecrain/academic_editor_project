# PDF Editor

`editor_pdf/` is the independent `/pdf/` engine. The browser uses
EmbedPDF/PDFium for viewing and interactive tools. The server combines PDFium,
PDF.js, `pdf-lib`, and LibPDF behind the same revision-bound REST/MCP contract
used by DOCX and HWPX.

## User-visible editing

The top bar exposes **전체 PDF 도구** separately from PDF annotations. The
panel has dedicated **본문·이미지** and **고급 문서 도구** areas. It inventories
real PDF page objects and supports:

- replacing an existing text object's Unicode text;
- selecting an approved TTF/OTF font, size, color, and opacity;
- embedding Korean fonts instead of rasterizing Korean text;
- replacing an existing PNG/JPEG while preserving its placement;
- moving, scaling, rotating, or skewing an object with its PDF matrix;
- deleting an inspected text, image, path, shading, or form object;
- saving, independently reopening, and refreshing the viewer after each edit.
- permanent object-removing redaction and document sanitization;
- local Korean/English OCR with an invisible searchable text layer;
- global text replacement, persistent comments, and standards-based text markup;
- text watermarks, opaque page backgrounds, headers, footers, and Bates numbers;
- page extraction, replacement, and Media/Crop/Bleed/Trim/Art box editing;
- page resizing, logical page labels, and initial viewer preferences;
- external links, top-level bookmarks, and AcroForm field authoring;
- lossless object-stream optimization.
- one-click save/reopen, font-embedding, active-content, OCR, document-language,
  title, and tagged-PDF preflight plus a rendered original/current comparison.

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
| Scanned-page OCR | Supported | Local Tesseract.js Korean/English recognition; existing text pages are skipped unless forced |
| Add text/image/highlight/ink | Supported | Transactional server commands and standard toolbar |
| Global text replacement | Supported | Inspected object-level replacement with page, case, and open-font controls |
| Text notes and markup annotations | Supported | Persistent Text/Highlight/Underline/Squiggly/StrikeOut annotations |
| Pages, crop, duplicate, move, extract, replace, merge | Supported | `pdf-lib` page tree operations |
| Forms, annotations, comments, redaction | Supported in browser | PDFium toolbar; flattening is also available server-side |
| Secure object redaction and sanitization | Supported | Intersecting objects are removed; annotations and active document actions are discarded |
| Watermark, background, header/footer, Bates | Supported | Approved embedded fonts and page content streams |
| Links, bookmarks, AcroForm authoring | Supported | PDF annotations, outlines, and form field dictionaries |
| Media/Crop/Bleed/Trim/Art boxes | Supported | Explicit page box operations |
| Page resize, logical labels, initial view | Supported | Content/annotation scaling, page label number tree, viewer preferences |
| Lossless PDF optimization | Supported | Compressed streams and object-stream rewrite |
| Attachments and metadata | Supported | LibPDF and `pdf-lib` |
| AES-256 permissions | Supported | LibPDF |
| Visible and PKCS#12 PAdES signatures | Supported | Appearance and certificate signing are separate commands |
| Render comparison | Supported | Poppler baseline/current page rendering |
| Quality, accessibility, and print preflight | Supported | Save/reopen plus title, language, tags, image-only pages, active content, and font embedding checks |
| Paragraph reflow across multiple PDF objects | Conditional | PDF is fixed-layout; object-level edits do not invent Word-like reflow |
| Automatic tagged-PDF remediation | Not bundled | Reading existing tags is possible; trustworthy automatic retagging is not |
| Signature trust-chain verification | Not bundled | Signing exists; independent trust validation remains an external acceptance step |
| Linearization and aggressive lossy image recompression | Not bundled | Normal stream compression is used; qpdf/codec deployment remains optional |

The last four rows deliberately fail closed. They must not be represented as
working merely because a toolbar icon or third-party binary exists.

## Supported commands

```text
text.add
ocr.recognize
text.replaceObject
text.replaceAll
highlight.add
ink.add
comment.add
textMarkup.add
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
page.resize
page.setLabels
page.extract
page.replace
page.setBoxes
document.merge
document.setInitialView
redaction.apply
watermark.add
background.set
headerFooter.add
bates.add
link.add
bookmark.add
form.addTextField
form.addCheckBox
form.addDropdown
form.remove
metadata.set
document.flattenAll
document.sanitize
document.optimize
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
