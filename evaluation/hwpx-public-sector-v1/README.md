# HWPX public-sector acceptance corpus v1

This corpus evaluates whether the HWPX editor can complete difficult,
multi-source public-sector work through its public REST and MCP surfaces.

## Contents

- 100 scenarios: 90 edits and 10 template-based generation cases.
- 100 gold answer contracts under `gold/`.
- Questions between 100 and 1,000 characters; the generated v1 range is
  426–453 characters.
- Ten public-sector domains.
- Every scenario has an HWPX target and at least three additional source
  formats.
- Thirteen versioned attachments across HWPX, HWP, PDF, DOCX, XLSX, CSV, TXT,
  PNG, and JPG.
- JSON Schemas for scenarios and attachment metadata.
- A separate encrypted/distribution HWPX rejection audit.

The official editable briefing has 11 pages, 14 tables, 7 image entries, and 9
picture objects. The large legacy HWP attachment is approximately 10 MB.

## Run

```powershell
npm.cmd run test:hwpx-dataset
npm.cmd run test:hwpx-evaluation
```

The first command validates IDs, question length, format diversity, source-fact
extraction and result-grounding linkage, attachment hashes, command contracts,
and all 100 gold files. Every `sourceFact.factId` maps through `factUsage` to a
reopen-verifiable oracle target containing both its locator and value. The
second executes every scenario through both the public REST API and the public
MCP tool surface. Focused investigation:

```powershell
node evaluation/hwpx-public-sector-v1/scripts/run-api-evaluation.mjs `
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

## Regeneration

```powershell
node evaluation/hwpx-public-sector-v1/scripts/generate-dataset.mjs
```

Regeneration recomputes attachment hashes, extracts the beneficiaries workbook
`#REF!` error count and representative cells, and rebuilds scenarios plus all
gold data. Treat changes to scenario wording, targets, scoring, or attachments
as a dataset-version change; do not weaken an oracle merely to make a failure
pass.

See [METHODOLOGY.md](METHODOLOGY.md) and [PROVENANCE.md](PROVENANCE.md).
