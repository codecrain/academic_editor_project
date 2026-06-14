# Task 94: Object Position Alignment Attribute Parsing and Rendering Fix

## Background

A text box (rectangle) object in BookReview.hwp is set to "19.24mm from page bottom" but the current code always calculates position based on top reference only, causing the object to be placed at the very top of the page.

Comparison with hwplib confirmed that vert/horz alignment modes (vertRelativeArrange, horzRelativeArrange) from CommonObjAttr's attr bit field are not being parsed.

## hwplib GsoHeaderProperty Bit Structure (Reference)

| Bits | Field | Values |
|------|-------|--------|
| 0 | likeWord (treat as character) | boolean |
| 2 | applyLineSpace | boolean |
| 3-4 | vertRelTo (vertical reference) | Paper(0), Page(1), Para(2) |
| **5-7** | **vertRelativeArrange** (vertical alignment) | Top(0), Center(1), **Bottom(2)**, Inside(3), Outside(4) |
| 8-9 | horzRelTo (horizontal reference) | Paper(0), Page(1), Column(2), Para(3) |
| **10-12** | **horzRelativeArrange** (horizontal alignment) | Left(0), Center(1), **Right(2)**, Inside(3), Outside(4) |
| 13 | vertRelToParaLimit | boolean |
| 14 | allowOverlap | boolean |
| 15-17 | widthCriterion | Paper(0), Page(1), Column(2), Para(3), Absolute(4) |
| 18-19 | heightCriterion | Paper(0), Page(1), Absolute(2) |
| 20 | protectSize | boolean |
| 21-23 | textFlowMethod | Wrap(0), Block(1), BehindText(2), InFrontOfText(3) |
| 24-25 | textHorzArrange | Both(0), LeftOnly(1), RightOnly(2), LargerOnly(3) |
| 26-28 | objectNumberSort | None(0), Figure(1), Table(2), Equation(3) |
| 29 | hasCaption | boolean |

## Symptoms

- BookReview.hwp page 1: red rectangle rendered at y~0 (page top)
- Expected position: 19.24mm above page bottom

## Modified Files

| File | Changes |
|------|---------|
| `src/model/shape.rs` | Add vert_align, horz_align fields to CommonObjAttr |
| `src/parser/control.rs` | Parse attr bits 5-7 (vert_align), 10-12 (horz_align) |
| `src/renderer/layout.rs` | Calculate coordinates based on alignment mode in compute_object_position() |
| `src/serializer/control.rs` | Reflect new fields in serialization (already included in attr bits, so minimal change) |

## Verification

- `docker compose --env-file /dev/null run --rm test` — existing tests pass
- `export-svg samples/basic/BookReview.hwp` — rectangle correctly placed at page bottom
