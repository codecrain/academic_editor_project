# PDF editor redesign QA

## Evidence

- Reference: `output/pdf-ui-redesign/reference-acrobat-edit.jpg`
- User issue reference:
  `C:/Users/HAEYON~1/AppData/Local/Temp/codex-clipboard-582f97ae-c06b-43b3-955d-d01021a4fae5.png`
- Implementation: `output/pdf-ui-redesign/one-click-inline-edit-1488x893.png`
- Refined implementation:
  `output/pdf-ui-redesign/inline-editor-polished-eq-86.png`
- Continuous editing implementation:
  `output/pdf-ui-redesign/continuous-text-editing.png`
- Combined comparison:
  `output/pdf-ui-redesign/comparison-inline-editor-before-after.png`
- Viewport: 1488 × 893 desktop for both issue and implementation captures
- State: a real PDF is open and its page text has been clicked once

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
   and an inline text editor.
3. Images had no canvas interaction. Added direct selection, drag-to-move,
   replacement, advanced properties, and deletion.
4. The first icon pass was not served because `/pdf/vendor/*` is intentionally
   allowlisted. Moved the MIT Tabler assets under the normal static asset path
   and verified the actual icon font renders.
5. A hidden image action was still visible for text selections because an
   author display rule overrode the HTML hidden state. Added an explicit hidden
   rule to the contextual toolbar.
6. The top Edit tab looked active before the PDF object session existed. This
   sent the user into EmbedPDF annotation selection even though the product UI
   claimed to be in edit mode. Document-open now starts the object session
   automatically, activates Text mode only when ready, and shows a persistent
   one-click instruction until the first edit.
7. Direct text entry was hidden behind a double-click and the new one-click
   path initially failed its exact-target save precondition. A single click now
   selects the revision-bound object before opening the inline editor, so the
   same action supports input, save, reopen, and verification.
8. Raw PDF font size made the inline control appear much larger than the
   rendered text. The editor now derives its screen font size from the rendered
   object bounds, matching the visible line at the current zoom.
9. The first direct editor still looked like a generic white textarea: it
   forced a full blue selection, exposed a native resize handle, and offered no
   visible commit model. Replaced it with a thin Acrobat-style object boundary,
   natural click-position caret, page-background sampling, and a compact
   floating action bar with explicit cancel/save controls. The native resize
   affordance is removed and keyboard shortcuts remain available.
10. Confirming any text edit previously ran quality check, saved the entire
    PDF, closed the active viewer document, and opened the edited buffer as a
    new document. This reset the page and made repeated edits feel like full
    reloads. Inline text and style edits now remain in one continuous viewer
    session, update a page-aligned preview, and mark a single top-level PDF
    save action as pending.
11. The text area previously stayed at one line and the PDF backend treated
    replacement text as one object. The editor now grows with input, wraps
    Korean and Latin text to the available page width, writes consecutive PDF
    text-line objects, and reopens those continuation objects as one editable
    text group on subsequent edits.

## Verification

- Real document: `editor_hwpx/pdf/eq-01-2022.pdf`
- Canvas objects discovered: 283 visible text/image hit regions
- Automatic entry: no Edit or Text button click was required after opening
- Direct edit: one text click opened one inline editor on the selected page object
- Editor state: selection start/end were equal after entry (natural caret);
  resize computed to `none`; cancel and save controls were both uniquely
  accessible
- Background integration: the editor shell samples the rendered PDF around the
  selected text and uses the median page color instead of a fixed white popup
- Continuity: two consecutive edits retained the original
  `eq-01-2022.pdf` viewer tab and runtime status; the page was not closed,
  reopened, renamed, or repositioned
- Wrapping: a long Korean sentence grew the textarea from 28 px to 46 px and
  produced four editable PDF lines; reopening and editing that group again
  produced three lines without leaving orphan continuation objects
- Explicit save: pending edits turn on the top PDF save indicator; saving
  clears the indicator while the current page and editable preview remain
- Persistence: edited text was applied, saved, reopened, and independently
  quality-checked by the existing revision-bound PDF pipeline
- Browser console: no error or warning entries after the edit flow
- Tool preservation: all 46 catalogued capabilities remain reachable; 31
  advanced command forms remain in the optional tool drawer

## Final result

final result: passed

No open P0, P1, or P2 visual or interaction defects remain in the verified
desktop flow.
