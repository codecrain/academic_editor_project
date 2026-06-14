# Task 4 — Execution Plan: Renderer Implementation (Text/Tables/Fonts)

## Goal

Accurately render the Document IR extracted by the parser (Task 3) to SVG.
Text, tables, and fonts from the original HWP document must be correctly reflected in the SVG output.

## Design Principles

HWP is a word processor document structure. Rendering must follow this exact order:

### Correct Processing Order

```
Phase 0: Style List Construction (Style Resolution)
    Resolve DocInfo reference table
    → FontFace[lang][id] → font name
    → CharShape[id] → { font name, size, bold, italic, color, letter spacing, width ratio }
    → ParaShape[id] → { alignment, line spacing, indent, margins }
    → BorderFill[id] → { border lines, background color }
    → Resolved style list (ResolvedStyleSet)

Phase 1: Document Structure Composition (Document Composition)
    Paragraph + ResolvedStyleSet
    → Line-by-line text splitting (based on LineSeg.text_start)
    → Style segment splitting within lines (CharShapeRef → ResolvedStyleSet reference)
    → Inline control position identification (table/shape insertion points)
    → Composed document structure (ComposedDocument)

Phase 2: Layout Composition
    Based on ComposedDocument
    → Pagination (page placement of paragraphs/tables/shapes)
    → Coordinate calculation (absolute position of each element)
    → Render tree construction

Phase 3: Output (SVG Rendering)
    Render tree → Reference style list → SVG element conversion
```

### Current Pipeline Problems

```
Current: Paragraph → Pagination → Layout (TextStyle::default) → SVG
             ↑ No style list    ↑ Tables ignored  ↑ Fonts/sizes ignored

Fixed: DocInfo → Style list → Document composition → Pagination → Layout (style reference) → SVG
```

## Current State Analysis

### Original Document (Consolidated Fiscal Statistics 2014.8) vs Current SVG Output

| Item | Original | Current SVG | Status |
|------|----------|-------------|--------|
| Title text | Present | Missing | Not implemented |
| Subtitle | Present | Present | Working |
| Table (consolidated fiscal income/expenditure) | Present | Missing | Not implemented |
| Body text (fiscal balance explanation) | Present | Present | Working |
| Footnotes 1)~5) | Present | Missing | Not implemented |
| Font (HamChoRom Dotum, etc.) | Applied | Fixed sans-serif | Not implemented |
| Text size (title 24pt, etc.) | Varied | Fixed 12px | Not implemented |
| Bold/italic | Applied | Not applied | Not implemented |

### Root Causes

1. **Style list not constructed**: DocInfo reference table not resolved → style lookup impossible during rendering
2. **Document structure not composed**: No line-by-line text splitting or style segment splitting → entire paragraph is one TextRun
3. **Inline controls not identified**: Table/shape insertion positions within paragraphs not recognized → table rendering impossible
4. **Rendering pipeline disconnected**: DocInfo not passed to layout/rendering stages

## Implementation Scope

### Primary Implementation (This Task)

**Style list construction:**
- DocInfo → ResolvedStyleSet conversion
- CharShape + FontFace → resolved character style (font name, size, bold/italic, color, letter spacing)
- ParaShape → resolved paragraph style (alignment, line spacing)
- BorderFill → resolved border/background style

**Document structure composition:**
- Line-by-line text splitting based on LineSeg.text_start
- Multiple TextRun creation based on CharShapeRef boundaries within lines (each TextRun references a style ID)
- Inline control position identification → table/shape insertion position mapping

**Layout composition:**
- Table PageItem creation and cell layout calculation
- Recursive layout of paragraphs within cells
- Reflect resolved styles in the render tree

**SVG output:**
- Apply TextStyle with reference to style list (font, size, bold, color)
- Table border and cell text rendering
- Text decoration (underline, strikethrough)

### Not Implemented (Future)

- Shape rendering (lines, rectangles, ellipses, etc.)
- Image insertion (Base64 data URI)
- Footnote/endnote area rendering
- Header/footer content
- Text alignment (center, right)

## Expected Results

The following elements from the original HWP document should be visible in SVG:
- Title/body text displayed with correct font, size, and bold
- Tables rendered with cell borders
- Text displayed within cells
- Full page output at A4 size

## Verification Criteria

- Text/table rendering in `rhwp export-svg` output SVG at a level comparable to original screenshot
- Maintain existing 177 tests + add new tests

## Status

- Written: 2026-02-05
- Status: Approved
