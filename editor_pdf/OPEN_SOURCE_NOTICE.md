# PDF editor open-source notice

The PDF editor is part of the MPL-2.0 Academic Editor runtime. It uses these
permissively licensed upstream components:

- Mozilla PDF.js 6.2.108 - Apache-2.0
- pdf-lib 1.17.1 - MIT
- @napi-rs/canvas 0.1.80 - MIT

Exact transitive dependency versions are recorded in `package-lock.json`.
Copyright and license files shipped by those packages must be retained in
binary distributions and reflected in the service-level open-source notice.

The first release intentionally supports additive page-content edits. It does
not claim to replace arbitrary existing PDF text or image objects. Those
operations remain blocked until the independent PDFium object-editing path is
implemented and passes save/reopen/render compatibility checks.
