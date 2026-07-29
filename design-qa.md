# PDF editor redesign QA

## Evidence

- Reference: `output/pdf-ui-redesign/reference-acrobat-edit.jpg`
- Implementation: `output/pdf-ui-redesign/final-selection-toolbar.png`
- Combined comparison: `output/pdf-ui-redesign/comparison-reference-vs-final.png`
- Viewport: 1280 × 720 desktop
- State: a real PDF is open, direct-edit mode is active, and a text object is selected

## Reference contract

The Acrobat reference establishes a compact global task bar, a narrow tool
rail, a page-dominant workspace, direct selection on the page, and contextual
text formatting near the selected content. Academic PDF follows that task
model while retaining the existing EmbedPDF document controls.

## Findings and iterations

1. The previous 420 px object inventory made the document secondary and forced
   text editing into a property form. Replaced it with a 314 px optional tool
   drawer and a page-first direct-edit overlay.
2. Text objects were not selectable on the rendered page. Added revision-bound
   object hit regions, selection handles, a floating font/size/color toolbar,
   and a double-click inline text editor.
3. Images had no canvas interaction. Added direct selection, drag-to-move,
   replacement, advanced properties, and deletion.
4. The first icon pass was not served because `/pdf/vendor/*` is intentionally
   allowlisted. Moved the MIT Tabler assets under the normal static asset path
   and verified the actual icon font renders.
5. A hidden image action was still visible for text selections because an
   author display rule overrode the HTML hidden state. Added an explicit hidden
   rule to the contextual toolbar.

## Verification

- Real document: `editor_hwpx/pdf/eq-01-2022.pdf`
- Canvas objects discovered: 283 visible text/image hit regions
- Direct edit: double-click opened one inline editor on the selected page object
- Persistence: edited text was applied, saved, reopened, and independently
  quality-checked by the existing revision-bound PDF pipeline
- Browser console: no error or warning entries after the edit flow
- Tool preservation: all 46 catalogued capabilities remain reachable; 31
  advanced command forms remain in the optional tool drawer

## Final result

Passed. No open P0, P1, or P2 visual or interaction defects remain in the
verified desktop flow.
