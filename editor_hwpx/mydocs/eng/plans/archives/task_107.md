# Task 107: Page Border/Background + Shape Fill Transparency Implementation

## Goal

Re-implement features from Tasks 105/105-supplement on the baseline (de21268).

1. Page border/background (PAGE_BORDER_FILL) rendering
2. Page background image fill support
3. Shape fill transparency + BinData ID mapping fix

## Strategy

Cherry-pick changes from existing commits (cd2aa20, 6758772, 667a71c), manually merge on conflict.
The segment_width filter change from `130b1df` (KTX 2-column layout) is not included.

## Implementation Plan

### Phase 1: Page Border/Background Rendering (cd2aa20)

- layout.rs: PageBorderFill → background fill + border line node generation
- render_tree.rs: PageBackgroundNode extension (gradient, image, border)
- svg.rs: Gradient/border line SVG rendering
- web_canvas.rs: Canvas rendering extension
- height_measurer.rs: Page border related height correction

### Phase 2: Page Background Image Fill (6758772)

- layout.rs: Image fill (BinData) support
- svg.rs/web_canvas.rs: Image background rendering

### Phase 3: Shape Fill Transparency + BinData ID Mapping (667a71c)

- parser/control.rs, parser/doc_info.rs: Transparency parsing
- model/style.rs: Transparency field addition
- renderer/mod.rs, style_resolver.rs: Transparency application
- svg.rs: SVG opacity attribute output
- serializer/doc_info.rs: Serialization counterpart

### Phase 4: Verification

- Verify samples/basic/Worldcup_FIFA2010_32.hwp SVG
- Regression test with samples/k-water-rfp.hwp
- Confirm all tests pass

## Branch

`local/task107` (branched from devel)
