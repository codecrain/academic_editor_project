# Open-source notice: Image Studio

This repository includes miniPaint as a Git submodule at `vendor/minipaint`.

| Component | License | Pinned revision | Purpose |
| --- | --- | --- | --- |
| [miniPaint](https://github.com/viliusle/miniPaint) | MIT | `a79733eb803fc97084ef0ee4faa96b031e69e1c0` (4.14.3) | Local raster editing UI and processing |

The complete upstream MIT license is retained at `vendor/minipaint/MIT-LICENSE.txt`. Any downstream distribution of this integration must retain that notice and the upstream notices for miniPaint's own bundled dependencies.

No OCR engine, hosted image API, generative model, or background-removal model is bundled in this foundation.

SVG-Edit was evaluated for the vector-editor portion and deliberately not included: its repository license expression includes LGPL-3.0-or-later alongside other licenses, which does not satisfy this project's permissive-only intake rule. Vector editing will be added only after selecting a component whose complete shipped dependency set is permissive and independently pinned.
