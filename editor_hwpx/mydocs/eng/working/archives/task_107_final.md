# Task 107 Final Completion Report

## Goal

Re-implement page border/background + shape fill opacity features on the baseline (de21268).

## Work Details

### Stage 1: Page Border/Background Rendering (cherry-pick cd2aa20 → 38c0b14)

- layout.rs: PageBorderFill → background fill + border line node generation
- render_tree.rs: PageBackgroundNode extension (gradient, image, border)
- svg.rs: Gradient/border line SVG rendering
- web_canvas.rs: Canvas background color/gradient rendering
- height_measurer.rs: Page border related height adjustment

### Stage 2: Page Background Image Fill (cherry-pick 6758772 → f6e6a71)

- layout.rs: Image fill (BinData) support
- svg.rs: Image background SVG rendering

### Stage 3: Shape Fill Opacity + BinData ID Mapping (cherry-pick 667a71c → bcdecc1)

- parser/control.rs, parser/doc_info.rs: Opacity parsing
- model/style.rs: Opacity field added
- renderer/mod.rs, style_resolver.rs: Opacity application
- svg.rs: SVG opacity attribute output
- web_canvas.rs: Canvas globalAlpha application
- serializer/doc_info.rs: Serialization support

### Supplement: Canvas Page Background Image Rendering (3d92691)

- web_canvas.rs: Added PageBackground image fill draw_image() call
- Restored Canvas image background feature missed during cherry-pick

## Modified Files (22)

| File | Changes |
|------|---------|
| src/renderer/layout.rs | PageBorderFill → background/border node generation |
| src/renderer/render_tree.rs | PageBackgroundNode extension |
| src/renderer/svg.rs | Gradient/border/image SVG rendering |
| src/renderer/web_canvas.rs | Canvas background color/gradient/image/opacity |
| src/renderer/height_measurer.rs | Page border height adjustment |
| src/renderer/mod.rs | Opacity support |
| src/renderer/style_resolver.rs | Opacity style resolution |
| src/renderer/canvas.rs | Opacity support |
| src/model/style.rs | opacity field added |
| src/parser/control.rs | Opacity parsing |
| src/parser/doc_info.rs | Opacity parsing |
| src/parser/hwpx/header.rs | HWPX header change |
| src/serializer/doc_info.rs | Serialization support |
| src/wasm_api.rs | WASM API page_border_fill passing |

## Verification Results

- 565 tests passed
- WASM build success
- Worldcup_FIFA2010_32.hwp background image rendering confirmed (SVG + Canvas)
- k-water-rfp.hwp no regression

## Commit History

| Commit | Content |
|--------|---------|
| 38c0b14 | Stage 1: Page border/background rendering |
| f6e6a71 | Stage 2: Page background image fill support |
| bcdecc1 | Stage 3: Shape fill opacity + BinData ID mapping |
| 3d92691 | Supplement: Canvas page background image rendering added |

## Branch

- Work: `local/task107` (branched from devel)
- Merge: `devel` ← `local/task107` (no-ff merge)
