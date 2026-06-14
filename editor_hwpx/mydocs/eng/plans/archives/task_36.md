# Task 36: Table Border Processing Enhancement - Execution Plan

## Current State
- BorderFill parsing, gradient fill parsing, cell border SVG rendering, border width mapping, dash patterns all completed
- Issues: P0 gradient fill not rendered, P1 adjacent cell border overdrawing, P2 corner handling, P3 page split boundary, P4 diagonal borders, P5 Wave/3D line types

## Improvement Priority

| Priority | Item | Impact | Difficulty |
|----------|------|--------|------------|
| 1 | Gradient fill rendering | High | Medium |
| 2 | Adjacent cell border dedup | High | Medium |
| 3 | Border corner handling | Medium | Medium |
| 4 | Page split boundary lines | Medium | Medium |
| 5 | Diagonal border rendering | Low | Low |
| 6 | Wave/3D line type support | Low | Medium |

## Approach
- 4.1: Add gradient support through entire pipeline (ResolvedBorderStyle → ShapeStyle → SVG linearGradient/radialGradient)
- 4.2: Edge-based border rendering to eliminate overdrawing
