# rhwp Project

"HWP for Everyone"

Until now, HWP/HWPX has been the exclusive domain of a single company.
rhwp aims to build an HWP editor for everyone — one that can read, view, and write documents — based on publicly available HWP/HWPX specifications, restructured in an AI-friendly manner, targeting a workspace where everyone can participate.

---

## Roadmap

Build the skeleton alone, flesh it out together, and complete it as everyone's asset.

```
0.5 ──── 1.0 ──── 2.0 ──── 3.0
Skeleton  Typesetting  Collaboration  Completion
Reverse   AI Pipeline   Community      Public Asset
Engineering
```

| Phase | Direction | Strategy |
|-------|-----------|----------|
| **0.5 -> 1.0** | Systematize the typesetting engine on top of read/write foundation | Build core architecture solidly as a solo effort |
| **1.0 -> 2.0** | Open community participation on top of AI typesetting pipeline | Lower barriers to entry for contributors |
| **2.0 -> 3.0** | Achieve public asset status on top of community-contributed features | Reach parity with Hancom |

### Why Complete the Skeleton Solo Before v0.5.0 Release

The core architecture must be solid first to prevent the direction from wavering when the community joins. An unfinished project attracting contributors too early creates chaos rather than progress.

---

## Milestones

Specific goals achieved at each version.

### v0.5.0 — Skeleton (2026-03 Release)

> Reverse engineering complete, read/write foundation established

- HWP 5.0 binary / HWPX parser complete
- Paragraph layout (line spacing, indentation, alignment, tabs)
- Table rendering (cell merge, borders, cell formulas)
- Multi-column layout, paragraph numbering/bullets
- Equation parser/layout/renderer
- Headers/footers, watermarks, footnotes/endnotes
- Object placement (TopAndBottom, TAC, in front of/behind text)
- Pagination (multi-column split, table row split)
- SVG export (CLI) + Canvas rendering (WASM/Web)
- Web editor (text editing, formatting dialogs, table editing)
- hwpctl compatible API (30 Actions, Field API)
- HWP serialization (save)
- 755+ tests

### v1.0.0 — Typesetting Engine

> AI typesetting pipeline, skeleton completion

- LINE_SEG recalculation + pagination re-typesetting systematization
- Dynamic re-typesetting stabilization during editing
- AI-based document generation/editing pipeline
- Document typesetting quality reaches Hancom viewer level

### v2.0.0 — Collaboration

> Stage where the community fills in features, fleshing out

- Contributor-friendly modular architecture
- Plugin/extension architecture
- Real-time collaborative editing
- Multiple output formats (PDF, DOCX, etc.)

### v3.0.0 — Completion

> Parity with Hancom, fully public asset

- Full HWP feature coverage
- Complete accessibility (a11y) support
- Mobile/tablet support
- Production-ready for government agencies
