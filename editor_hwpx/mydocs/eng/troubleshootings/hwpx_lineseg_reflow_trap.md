# HWPX LINE_SEG Reflow Trap

## Discovery Date: 2026-03-31

## Symptoms

In `samples/tac-img-02.hwpx` pi=837, a paragraph with text + forced line break (\n) + TAC table was rendered differently from Hancom.
- The text line's height was calculated as the table height (187.9px), consuming excessive space
- Text was clipped and only partially rendered

## Cause

### HWPX Original LINE_SEG

```xml
<hp:linesegarray>
  <hp:lineseg textpos="0" vertsize="1000" textheight="1000" baseline="850"
              spacing="800" horzpos="0" horzsize="1836" flags="393216"/>
</hp:linesegarray>
```

LINE_SEG: **1 entry**, `vertsize=1000` (text height only). Table height is not included.

### LINE_SEG After Reflow

```
ls[0]: ts=0,  lh=14094, th=1300  <- Table height (14094) included!
ls[1]: ts=55, lh=14376, th=14376
```

`reflow_line_segs` split the original single LINE_SEG into 2, and included the table height in LINE_SEG[0]'s `lh`.

### HWP Binary (Ground Truth)

```
ls[0]: ts=0,  lh=1300, th=1300   <- Text height only!
ls[1]: ts=55, lh=14376, th=14376
```

In HWP, LINE_SEG[0] has `lh=1300`, using only the text height.

## The Trap

1. **HWPX's LINE_SEG contains only minimal information** (vertsize=1000, single entry)
2. **reflow_line_segs recalculates it**, including the TAC table height in the text line
3. **HWP binary has LINE_SEG directly calculated by Hancom** -> text and table heights are properly separated
4. Therefore, **the reflow result from HWPX should not be trusted; the correct heights must be referenced from HWP**

## Lessons Learned

- When interpreting HWPX, always **cross-check against the HWP binary as ground truth**
- When HWPX's LINE_SEG is insufficient, reflow is used to recalculate, but reflow does not produce correct results for paragraphs containing TAC tables
- In the composer, when LINE_SEG `lh` is significantly larger than `th` (table height included), a correction to use `th` is needed

## Resolution

- composer `compose_lines()`: Correct LINE_SEG `lh` to `th` for TAC table paragraphs (Task #19)
- composer `compose_lines()`: Merge text before forced line break (\n) into the previous ComposedLine (Task #20)
- pagination: Calculate `para_height_for_fit` based on measured table height + text th (Task #19)

## Related Issues

- [#19](https://github.com/edwardkim/rhwp/issues/19) TAC table mixed paragraph pagination height double calculation
- [#20](https://github.com/edwardkim/rhwp/issues/20) composer forced line break followed by TAC table ComposedLine separation
