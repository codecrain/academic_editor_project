# HWPX Agent final-20 performance report

## Run

- Run time: 2026-07-30 19:06:48–19:07:56 KST
- Command: `npm.cmd run test:hwpx-evaluation -- --render full`
- Execution: model-free deterministic REST/MCP editor replay
- Cases: 20 (18 edit, 2 generation)
- Dataset gate before run: 6/6 tests passed

## Summary

| Metric | Result |
| --- | ---: |
| Passed | 18/20 (90%) |
| Failed | 2/20 (10%) |
| Total case time | 67,782 ms |
| Mean | 3,389 ms |
| Median (p50) | 3,681 ms |
| p95 | 4,384 ms |
| Minimum | 89 ms |
| Maximum | 4,770 ms |
| Average score | 97/100 |

## Mode comparison

| Mode | Cases | Total | Mean | p50 | p95 | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Edit | 18 | 67,583 ms | 3,755 ms | 3,703 ms | 4,770 ms | 3,142–4,770 ms |
| Generation | 2 | 199 ms | 100 ms | 89 ms | 110 ms | 89–110 ms |

Generation is much faster because it starts from a minimal HWPX template;
those timings must not be averaged with full briefing edits when diagnosing
edit latency.

## Feature groups

| Group | Cases | Mean | Range |
| --- | ---: | ---: | ---: |
| Pagination / long summary | 2 | 4,283 ms | 3,796–4,770 ms |
| Atomic multi-table rollback | 3 | 3,824 ms | 3,681–4,063 ms |
| Large legacy HWP boundary | 4 | 3,792 ms | 3,413–4,169 ms |
| Formula-error trap | 4 | 3,616 ms | 3,142–4,384 ms |

## Failures

| Scenario | Result | Exact failed check | Evidence |
| --- | --- | --- | --- |
| `HWPX-PS-054` | FAIL, 70 | Structure: page delta | 11 → 13 pages; gold permits at most +1 |
| `HWPX-PS-061` | FAIL, 70 | Structure: page delta | 11 → 13 pages; gold permits at most +1 |

For both failures, content, grounding, style, table/image preservation,
package identity, privacy, save/reopen, and MCP checks passed. The gold
criteria were not relaxed.

Machine-readable evidence:

- `results/latest-summary.json`
- `results/latest-results.jsonl`
