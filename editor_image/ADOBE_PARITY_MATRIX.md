# Adobe image-editing parity contract

Baseline date: 2026-07-29

This is the no-silent-omission contract for Photoshop/Illustrator-class local
editing. It covers desktop, non-generative image editing. OCR, Firefly and other
hosted generative services, Adobe Stock/Libraries/cloud documents,
collaboration/review, marketplace plugins, and Adobe account/telemetry features
are explicit product exclusions rather than missing editor work.

Status meanings:

- **Verified**: reachable UI or MCP command, save/reopen preservation, rendered
  output check, and automated regression check all exist.
- **Partial**: useful implementation exists but one or more parity behaviors or
  verification boundaries are missing.
- **Planned**: included in scope and must not be dropped.

## Raster / Photoshop-class scope

| Capability family | Required behaviors | Status |
| --- | --- | --- |
| Documents and canvas | new/open, resize/resample, crop/trim/reveal, rotate/flip, guides/grid/rulers/measure, multiple views | Partial |
| Pixel and layer model | pixel, text, shape, group, background and smart-object-equivalent layers; visibility, lock, opacity, blend modes, order, link, merge/flatten | Partial |
| Editable persistence | lossless layer/project save, reopen, flattened export, history-safe serialization | Partial |
| Selections | rectangle/ellipse/row/column marquee, lasso/polygon/magnetic lasso, magic wand, quick/object select, color/focus range, feather/grow/similar/transform, refine edge | Partial |
| Masks and channels | layer/vector/clipping masks, enable/link/invert/refine, alpha/spot channels, channel operations | Planned |
| Paint and erase | brush/pencil/mixer/color replacement, custom brush dynamics, pressure/tilt, symmetry, eraser/background/magic eraser, fill/gradient/pattern | Partial |
| Retouch and restoration | clone/pattern stamp, healing/spot healing/patch, content-aware move/fill, remove object, red-eye, dodge/burn/sponge | Partial |
| Transform and distortion | scale/rotate/skew/distort/perspective/warp, free transform, puppet warp, perspective warp, liquify | Partial |
| Tone and color | histogram, levels, curves, exposure, vibrance, hue/saturation, balance, black-and-white, channel mixer, selective color, gradient map, LUT/photo filter, shadows/highlights, HDR toning | Partial |
| Non-destructive adjustments | adjustment/fill layers, editable parameters, clipping, smart-filter-equivalent stack and masks | Planned |
| Filters and effects | blur/sharpen/noise/distort/pixelate/render/stylize/other, lens/camera correction, filter gallery, layer styles and blend-if | Partial |
| Drawing and paths | pen/freeform/curvature, anchor editing, path operations, shape tools, stroke/fill path, clipping path | Partial |
| Typography | point/paragraph/path text, character and paragraph styles, OpenType/variable fonts, glyphs, warp, vertical text | Partial |
| Timeline | frame animation, timeline/video layers, tween, onion skin, GIF/video import/export | Partial |
| Color management | RGB/CMYK/Lab/grayscale/indexed/duotone/multichannel, 8/16/32-bit, ICC assign/convert/proof, gamut warning | Planned |
| Formats and metadata | PSD/PSB layered round-trip, TIFF, JPEG, PNG, WebP, GIF, BMP, TGA, OpenEXR/HDR, AVIF/HEIF where available, EXIF/IPTC/XMP | Planned |
| Automation | recorded actions, conditional steps, batch/image processor, variables/data sets, scripts and headless command catalog | Planned |
| Output | export-as, quick export, slices/assets, print sizing, contact sheet, configurable compression/color/profile metadata | Partial |

## Vector / Illustrator-class scope

| Capability family | Required behaviors | Status |
| --- | --- | --- |
| Documents and artboards | multiple artboards, presets, bleed, rulers/guides/grid, measure/dimensions, rotate view, isolation mode | Planned |
| Object model | select/direct/group/isolate, order, align/distribute, lock/hide, duplicate, transform, layers/sublayers | Partial |
| Paths and anchors | pen/pencil/curvature, add/delete/convert anchor, join/average/simplify/smooth, scissors/knife/eraser | Partial |
| Shapes and construction | primitive/live shapes, shape builder, pathfinder/compound paths, offset path, blend, envelope distort | Partial |
| Fill and stroke | solid/gradient/freeform gradient/mesh, patterns, multiple appearance fills/strokes, width profiles, dashed/arrowhead strokes | Partial |
| Brushes | calligraphic/scatter/art/bristle/pattern/blob brushes, pressure dynamics, expand appearance | Partial |
| Paint systems | live paint groups/bucket/selection, recolor artwork, color groups/harmony/global and spot colors | Planned |
| Masks and transparency | clipping/opacity masks, blend modes, knockout groups, flatten transparency | Planned |
| Typography | point/area/path/vertical text, threading, styles, tabs, OpenType/variable fonts, glyphs, outline text | Partial |
| Symbols and data | symbols, dynamic symbols, symbol sprayer tools, variables/data-driven graphics, graphs | Planned |
| Image interoperability | place/link/embed, crop/rasterize, image trace with presets and expansion, relink/package | Planned |
| Effects | live appearance stack, raster/vector effects, distort/transform/pathfinder effects, 3D/extrude/revolve/inflate/materials | Planned |
| Perspective | perspective grid/selection/drawing, free transform/perspective distort | Planned |
| Color and prepress | RGB/CMYK/spot/global colors, ICC proofing, overprint preview, separations, trapping, ink/print attributes | Planned |
| Formats | SVG/SVGZ, PDF, EPS, layered raster interchange, DXF/DWG and common raster place/export formats | Partial |
| Export and print | export for screens/assets, responsive SVG, slices, package, print marks/bleed/separations | Partial |
| Automation and extensibility | actions, batch, scripts, stable MCP command catalog and deterministic replay | Planned |

## Current verified foundation

- Raster route and vector route are same-origin and self-hosted.
- Raster source loading, layered miniPaint JSON save, flattened PNG save, and
  capability-scoped readback are browser-verified.
- Vector rectangle creation, object duplication, layer listing, undo, redo, SVG
  import/export, editable JSON, and PNG export are browser-verified.
- MCP can open, inspect, save/read flattened bytes, save/read editable project
  bytes, and delete image sessions.
- Deployment refuses to start a replacement gateway when pinned miniPaint,
  vector UI, or Fabric.js runtime assets are missing.

The rows marked Partial or Planned are release blockers for an unqualified
“Adobe-complete” claim. They are deliberately kept visible instead of being
silently treated as out of scope.

## Primary product references

- Photoshop layers:
  <https://helpx.adobe.com/photoshop/desktop/create-manage-layers/get-started-layers/layers-overview.html>
- Photoshop masks:
  <https://helpx.adobe.com/photoshop/desktop/create-masks/layer-masks/add-layer-masks.html>
- Photoshop filters:
  <https://helpx.adobe.com/photoshop/desktop/effects-filters/get-started-with-filters/apply-filters.html>
- Photoshop actions:
  <https://helpx.adobe.com/photoshop/desktop/automate-tasks/automation-settings-and-presets/actions-overview.html>
- Illustrator tool inventory:
  <https://helpx.adobe.com/illustrator/using/tools-in-illustrator.html>
- Illustrator supported formats:
  <https://helpx.adobe.com/illustrator/desktop/get-started/learn-the-basics/supported-file-formats.html>
