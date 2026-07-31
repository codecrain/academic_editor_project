# HWPX Agent final 20 validation contract v1

> **CANONICAL — CURRENT**
>
> This directory is the single authoritative source for HWPX Agent validation
> inputs and completion criteria. Use `scenarios.jsonl`, `attachments.json`,
> and the matching `gold/HWPX-PS-*.json` together. The readable, lossless
> expansion is `HWPX_AGENT_SCENARIO_REPORT.md`.
>
> Do not substitute Tlooto's `public_sector_multifile_extreme_v1`: that is a
> ResearchAgent multi-artifact dataset and is legacy for HWPX Agent claims.

This corpus evaluates whether the HWPX editor can complete difficult,
multi-source public-sector work through its public REST and MCP surfaces.

The deterministic REST/MCP runner replays the checked-in oracle commands. Its
success proves the editor execution gate only. A final **HWPX Agent pass**
additionally requires the Tlooto Agent to receive the scenario question and
attachments without oracle access, derive the plan, produce the HWPX, and
meet the matching gold contract. Do not report an editor replay as an Agent
pass.

See [FINAL_VALIDATION.md](FINAL_VALIDATION.md) for the authority boundary and
the only permitted completion claim.

## Contents

- 20 selected stress scenarios: 18 edits and 2 template-based generation
  cases.
- 20 matching gold answer contracts under `gold/`.
- Questions between 100 and 1,000 characters; the generated v1 range is
  426–453 characters.
- Ten public-sector domains.
- Every scenario has an HWPX target and at least three additional source
  formats.
- Eleven versioned attachments across HWPX, HWP, PDF, DOCX, XLSX, CSV, TXT,
  PNG, and JPG.
- JSON Schemas for scenarios and attachment metadata.

The 20 cases retain the two latest replay failures (`HWPX-PS-054`,
`HWPX-PS-061`), the previously incomplete rerun case (`HWPX-PS-081`), and
the strongest image, pagination, formula-error, atomic-rollback, large-HWP,
cross-file, privacy, style and generation cases. The excluded 80 cases are
isolated under `../legacy/hwpx-public-sector-v1-retired-80` and are prohibited
for current validation claims.

The official editable briefing has 11 pages, 14 tables, 7 image entries, and 9
picture objects. The large legacy HWP attachment is approximately 10 MB.

## Run

```powershell
npm.cmd run test:hwpx-dataset
npm.cmd run test:hwpx-evaluation
```

The first command validates IDs, question length, format diversity, source-fact
extraction and result-grounding linkage, attachment hashes, command contracts,
and all 20 gold files. Every `sourceFact.factId` maps through `factUsage` to a
reopen-verifiable oracle target containing both its locator and value. The
second executes every scenario through both the public REST API and the public
MCP tool surface. Focused investigation:

```powershell
node evaluation/hwpx-agent-final-20-v1/scripts/run-api-evaluation.mjs `
  --id HWPX-PS-044 --render full
```

`--render` is `full`, `sample`, or `none`. Final acceptance uses `full`.
The runner starts an ephemeral loopback gateway in-process, exercises REST and
MCP open/catalog/inspect/apply/quality/render/save/read/hash/delete workflows,
discards every session, deletes temporary outputs, and closes the server in
`finally`. It also rejects introduced direct identifiers and any changed
unrequested binary package entry.

Results are written to:

- `results/latest-results.jsonl`
- `results/latest-summary.json`

## Rebuild the exact final-20 split

```powershell
node evaluation/hwpx-agent-final-20-v1/scripts/select-final-20.mjs
```

This command rebuilds the exact checked-in 20/80 split without changing case
content or completion criteria. The superseded 100-case generator is stored
only in the legacy archive. Treat changes to scenario wording, targets,
scoring, or attachments as a dataset-version change; do not weaken an oracle
merely to make a failure pass.

See [METHODOLOGY.md](METHODOLOGY.md) and [PROVENANCE.md](PROVENANCE.md).
