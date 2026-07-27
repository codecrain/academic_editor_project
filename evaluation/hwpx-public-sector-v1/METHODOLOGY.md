# Evaluation methodology

## Scenario design

Each scenario combines an HWPX output target with at least three heterogeneous
attachments. Tasks include date reconciliation, formula-error traps, budget
recalculation, privacy controls, paragraph and multi-table edits, style
cloning, image replacement, pagination constraints, package preservation, and
large legacy-HWP reference handling.

The 90 edit cases target an official 11-page HWPX briefing. The 10 generation
cases start from a minimal valid HWPX template and build a structured public
report through the same API. HWPX-PS-091 through HWPX-PS-100 are generation
cases.

## Oracle

Every gold file defines:

- traceable source facts and locators with stable fact IDs;
- explicit fact-to-result usage and verification-target links;
- exact canonical command templates;
- exact paragraph or table-cell targets;
- expected text after save and reopen;
- page, table, image, picture, section, XML, and binary-entry invariants;
- requested baseline/current render pages;
- scoring and hard-failure rules.

Cell fitting may introduce visual line breaks. The evaluator therefore compares
whitespace-normalized text at the exact inspected cell location. Inserted
top-level paragraphs can shift later numeric paragraph positions after reopen,
so paragraph content is resolved by an exact, case-sensitive paragraph-only
search. The evaluator never ignores missing or extra words.

## REST and MCP execution

For each case the runner:

1. Verifies every referenced attachment's registry entry, byte length, SHA-256,
   file signature, format diversity, and source-fact linkage.
2. Starts one ephemeral loopback gateway.
3. Opens source bytes through `/v1/hwpx/documents/open`.
4. Reads the document/object inventory and queries the operation catalog.
5. Inspects every target/style source and applies one atomic REST batch.
6. Runs quality checks and requested baseline/current SVG rendering.
7. Saves, reads the artifact through the trusted REST endpoint, verifies its
   SHA-256, reopens it, and validates exact targets, every fact locator/value
   grounding, and package invariants.
8. Repeats the complete open/catalog/inspect/inventory/apply/quality/render/
   save/artifact-read/hash/delete lifecycle through `editor_hwpx_*` MCP tools.
9. Compares every preexisting binary entry byte-for-byte and rejects any
   introduced email, phone number, or resident-registration number.
10. Discards all sessions, deletes temporary outputs, and closes the gateway
    in `finally`.

No OpenAI model is required or called by this deterministic acceptance runner.

## Scoring

- Content accuracy: 35
- Layout and render evidence: 20
- Style consistency: 15
- Object preservation: 10
- Package integrity: 10
- Reopen and API usability: 10

Pass threshold: 85.

Any of these is a hard failure regardless of score:

- saved HWPX cannot be reopened;
- a batch failure partially commits earlier edits;
- an unrequested table, image, picture, section, XML entry, or binary entry
  disappears;
- output contains personal data prohibited by the scenario.
- REST and MCP output hashes differ or either transport skips a required gate;
- any unrequested preexisting binary entry changes byte-for-byte.

## Evidence boundary

A nonblank RHWP SVG is useful renderer evidence, not proof of pixel identity in
Hancom Office. Final acceptance for typography or print-production parity still
requires Hancom-side human review. The corpus marks this explicitly instead of
converting structural success into a visual-parity claim.
