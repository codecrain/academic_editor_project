# HWPX Agent final validation authority

## Status

**CANONICAL — CURRENT**

This directory is the single source of truth for HWPX Agent validation.

## Authoritative records

| Purpose | Authoritative record |
| --- | --- |
| Case input | `scenarios.jsonl` |
| Attachment input | Referenced entries in `attachments.json` |
| Per-case completion criteria | Matching `gold/HWPX-PS-*.json` |
| Lossless readable view | `HWPX_AGENT_SCENARIO_REPORT.md` |
| Dataset metadata | `manifest.json` |

The case input is the complete scenario record, not only its `question`.
The completion criteria are the complete matching gold record. No additional
criterion may be inferred from historical plans, reports, model responses, or
other evaluation datasets.

## Permitted claims

1. `test:hwpx-dataset` passing means the canonical inputs, attachments, and
   gold contracts are internally valid.
2. `test:hwpx-evaluation` passing means the editor can replay the oracle plan
   through the required REST/MCP gates.
3. **HWPX Agent pass** requires a real Agent run that receives only the case
   input and referenced attachment bytes, cannot access `gold/` or oracle
   commands, and produces an artifact that passes the unchanged matching gold
   contract.
4. **Final corpus pass** requires all 20 real Agent cases to pass. A subset,
   static validation, API success, tool completion, saved file, nonblank
   render, or deterministic oracle replay is not a final corpus pass.

## Latest verified execution

Verified on 2026-07-30:

| Gate | Result | Meaning |
| --- | --- | --- |
| Canonical dataset validation | PASS — 6 tests; 20 scenarios (18 edit, 2 generation), 11 attachments | Inputs and completion contracts are internally valid |
| Deterministic full-render editor replay | FAIL — 18/20; 97 average; 69,609 ms | Editor execution gate is not fully passing |
| Real HWPX Agent corpus run | NOT RUN | No HWPX Agent pass claim is permitted |

The final-20 deterministic replay failed only `HWPX-PS-054` and
`HWPX-PS-061`.
Both preserved the required content, grounding, styles, tables, images,
package identity, privacy constraints, save/reopen behavior, and MCP checks.
Both increased the 11-page source to 13 pages while the unchanged gold
contract permits at most a one-page increase. The gold records were not
weakened. Machine-readable final-20 details are in
`results/latest-summary.json` and `results/latest-results.jsonl`. The old
100-case result is retained only under the legacy archive.

Detailed timing percentiles and feature-group timings are recorded in
`PERFORMANCE_REPORT.md`.

## Superseded or non-authoritative material

- Tlooto `public_sector_multifile_extreme_v1` and its Electron question file
  are ResearchAgent multi-artifact evaluation assets. They are legacy and
  prohibited as evidence for an HWPX Agent claim.
- Historical HWPX Agent overhaul plans and design documents describe earlier
  proposals. They are legacy and cannot override this directory.
- The retired 80 cases and historical 100-case generator under
  `../legacy/hwpx-public-sector-v1-retired-80` are prohibited for current
  validation or performance claims.
- Unit, package, MCP, rendering, and runtime regression tests remain active
  engineering tests, but they are not substitutes for this Agent validation
  contract.

## Change control

Changes to scenario wording, attachment records, facts, target files, oracle
commands, expected targets, invariants, render checks, scores, or hard-failure
rules require a dataset version change. Do not weaken a gold record to make an
implementation pass.
