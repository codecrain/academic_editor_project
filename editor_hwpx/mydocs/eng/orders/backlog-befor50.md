# Backlog

A list of tasks for future implementation, organized by priority and dependencies.

---

## 1. Rendering Quality Improvements

| No | Task | Description | Difficulty |
|----|------|-------------|------------|
| B-101 | ~~Async image loading~~ | ~~Blob -> Object URL -> HtmlImageElement conversion, render actual images on Canvas~~ | ~~Medium~~ | **Done (Task 15)** |
| B-102 | Embedded font support | Extract and apply fonts embedded in HWP files | High |
| B-103 | Multi-column layout | Support 2-column/3-column document rendering | Medium |
| B-104 | Header/footer rendering | Render header/footer areas per page | Medium |
| B-105 | Footnote rendering completion | Footnote number linking, footnote area separation display | Medium |
| B-106 | Highlight processing | Add CharShape.shade_color to TextStyle, render text background rectangles | Low |

---

## 2. Additional Control Support

| No | Task | Description | Difficulty |
|----|------|-------------|------------|
| B-201 | Equation rendering | HWP equation (eqEdit) parsing and MathML/LaTeX conversion | High |
| B-202 | Chart rendering | Chart data parsing, SVG/Canvas chart generation | High |
| B-203 | Drawing objects | Lines, curves, arcs, polygons, and other vector shapes | Medium |
| B-204 | OLE objects | External document embedding (Excel, PPT, etc.) | High |
| B-205 | WordArt | Text effects (shadow, outline, etc.) | Medium |
| B-206 | Field codes | Date, page number, document info fields | Low |

---

## 3. WYSIWYG Editing Features

| No | Task | Description | Difficulty | Dependencies |
|----|------|-------------|------------|--------------|
| B-301 | ~~Text selection~~ | ~~Canvas hit-test, mouse/touch selection area~~ | ~~Medium~~ | **Done (Task 17)** |
| B-302 | ~~Caret display~~ | ~~Blinking cursor at edit position~~ | ~~Low~~ | ~~B-301~~ | **Done (Task 19)** |
| B-303 | ~~Text input~~ | ~~Keyboard input -> paragraph modification~~ | ~~Medium~~ | ~~B-302~~ | **Done (Task 20)** |
| B-304 | ~~Text deletion~~ | ~~Backspace/Delete handling~~ | ~~Low~~ | ~~B-303~~ | **Done (Task 21)** |
| B-305 | Copy/paste | Clipboard integration | Medium | B-303 |
| B-306 | Undo/redo | Undo/Redo stack management | Medium | B-303 |
| B-307 | Formatting changes | Font, size, color, bold/italic, etc. | Medium | B-303 |
| B-308 | Auto-caret placement on document load | Restore last caret position from HWP file, auto-scroll to that page (Hancom Web Gian-gi style) | Low | B-302 |
| B-309 | MovePos 28+ movement types | Paragraph/line/word/page unit cursor movement, Home/End key support (Hancom API MovePos equivalent) | Medium | B-302 |

---

## 4. Save Features

| No | Task | Description | Difficulty | Dependencies |
|----|------|-------------|------------|--------------|
| B-401 | ~~HWP serialization~~ | ~~Document IR -> HWP binary conversion~~ | ~~High~~ | ~~-~~ | **Done (Task 23)** |
| B-402 | ~~CFB writing~~ | ~~Compound File Binary generation~~ | ~~Medium~~ | ~~B-401~~ | **Done (Task 23)** |
| B-403 | ~~Stream compression~~ | ~~zlib compression applied~~ | ~~Low~~ | ~~B-401~~ | **Done (Task 23)** |
| B-404 | New document creation | Empty document template generation | Low | B-401 |

---

## 5. Export Features

| No | Task | Description | Difficulty |
|----|------|-------------|------------|
| B-501 | PDF export | SVG -> PDF conversion or direct PDF generation | Medium |
| B-502 | Image export | PNG/JPEG raster image generation | Low |
| B-503 | Text extraction | Plain text export | Low |
| B-504 | HTML export | HTML document generation with styles | Medium |

---

## 6. Browser Integration

| No | Task | Description | Difficulty |
|----|------|-------------|------------|
| B-601 | ~~Browser test page~~ | ~~HTML page for Canvas rendering verification~~ | ~~Low~~ | **Done** |
| B-602 | Zoom/scroll UI | Zoom in/out, page navigation UI | Low |
| B-603 | Print functionality | window.print() integration | Medium |
| B-604 | Fullscreen mode | Fullscreen API integration | Low |
| B-605 | Responsive layout | Mobile/tablet support | Medium |

---

## 7. Performance Optimization

| No | Task | Description | Difficulty |
|----|------|-------------|------------|
| B-701 | Virtual scrolling | Render only visible pages | Medium |
| B-702 | Render caching | Cache unchanged pages | Medium |
| B-703 | Web Worker separation | Separate parsing/layout into dedicated threads | High |
| B-704 | Progressive loading | Streaming load for large documents | High |

---

## 8. Development Infrastructure

| No | Task | Description | Difficulty |
|----|------|-------------|------------|
| B-801 | E2E testing | Browser automation testing (Playwright) | Medium |
| B-802 | Visual regression testing | Rendering result snapshot comparison | Medium |
| B-803 | Auto documentation generation | rustdoc + mdBook integration | Low |
| B-804 | CI/CD pipeline | GitHub Actions build/deploy | Medium |
| B-805 | npm package publishing | wasm-pack -> npm publish | Low |

---

## 9. Table Editing Features

| No | Task | Description | Difficulty | Dependencies |
|----|------|-------------|------------|--------------|
| B-901 | ~~Control object selection~~ | ~~Object selection mode on table/image/shape click, selection handle display~~ | ~~Medium~~ | - | **Done (Task 25)** |
| B-902 | ~~Cell selection mode~~ | ~~F5/drag cell-unit selection, multi-cell range selection~~ | ~~Medium~~ | ~~B-901~~ | **Done (Task 25)** |
| B-903 | Cell navigation | Tab/Shift+Tab cell movement, arrow key cell boundary movement | Low | B-902 |
| B-904 | ~~Row/column add/delete~~ | ~~Insert/remove rows/columns based on selection, IR modification~~ | ~~High~~ | ~~B-902~~ | **Done (Task 26)** |
| B-905 | ~~Cell merge/split~~ | ~~Merge selected cells, horizontal/vertical split of single cell~~ | ~~High~~ | ~~B-902~~ | **Done (Task 26)** |
| B-906 | Table/cell property editing | Borders, backgrounds, margins, size adjustment | Medium | B-901 |

---

## Recommended Priority

### Priority 1 (Foundation) -- Done
- ~~B-601: Browser test page -> Canvas renderer verification~~
- ~~B-301: Text selection -> First step of WYSIWYG~~

### Priority 2 (Core Editing) -- Done
- ~~B-302~B-304: Caret, input, deletion~~ (Done in Tasks 19~21)
- ~~B-101: Async image loading~~ (Done in Task 15)

### Priority 3 (Completeness) -- Partially Done
- ~~B-401~B-403: HWP save~~ (Done in Task 23)
- B-501: PDF export

### Priority 4 (Table Editing) -- Partially Done
- ~~B-901~B-902: Control object selection, cell selection~~ (Done in Task 25)
- B-903: Cell navigation
- ~~B-904~B-905: Row/column add, cell merge~~ (Done in Task 26)
- B-906: Table/cell property editing

---

*Last updated: 2026-02-08*
