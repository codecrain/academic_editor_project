# Code Quality Dashboard Manual

## Overview

A dashboard system that collects code quality metrics with `scripts/metrics.sh` and visualizes them with `scripts/dashboard.html`.

## Component Files

| File | Role |
|------|------|
| `scripts/metrics.sh` | Metrics collection script (Bash) |
| `scripts/dashboard.html` | Chart.js-based dashboard (HTML) |
| `output/metrics.json` | Collected metrics data (auto-generated) |
| `output/dashboard.html` | Dashboard copy (auto-generated) |

## How to Run

### Docker Environment (Recommended)

```bash
docker compose --env-file .env.docker run --rm dev bash /app/scripts/metrics.sh
```

### Local Environment

```bash
./scripts/metrics.sh
```

### Opening the Dashboard

After execution, open `output/dashboard.html` in a browser.

```bash
# macOS
open output/dashboard.html

# Linux
xdg-open output/dashboard.html

# WSL
explorer.exe output/dashboard.html
```

> `dashboard.html` reads `metrics.json` from the same directory via `fetch()`,
> so it may fail to load due to CORS restrictions when using the file protocol (`file://`).
> In that case, use a local web server:
> ```bash
> cd output && python3 -m http.server 8080
> # Open http://localhost:8080/dashboard.html in browser
> ```

## Collection Items (5 Stages)

### Stage 1: Lines per File

- Targets: `src/**/*.rs`, `rhwp-studio/src/**/*.{ts,css}`
- `font_metrics_data.rs` is automatically filtered out in the dashboard (auto-generated file)

### Stage 2: Clippy Warnings

- Runs `cargo clippy` and counts `warning:` lines
- Target: 0

### Stage 3: Cognitive Complexity

- Uses Clippy's `cognitive_complexity` lint
- Temporarily sets `cognitive-complexity-threshold = 5` in `clippy.toml` to collect all functions with CC >= 5
- `clippy.toml` is restored to its original state after collection

### Stage 4: Tests

- Runs `cargo test` and parses passed/failed/ignored counts

### Stage 5: Coverage

- Only collected when `cargo-tarpaulin` is installed
- Displayed as `null` when not installed

## Dashboard Layout

### Top Cards (4)

| Card | Criteria | Color |
|------|----------|-------|
| Files over 1,200 lines | 0 = green, 1+ = red | Excludes `font_metrics_data` |
| Clippy warnings | 0 = green, 1-49 = yellow, 50+ = red | |
| Functions with CC > 25 | 0 = green, 1+ = red | Shows max value and collected function count |
| Tests | 0 failures = green, 1+ = red | Shows passed/total |

### Charts (4)

#### File Size Distribution (Top 30)

- Horizontal bar chart
- Red dashed line: 1,200-line upper limit
- Files exceeding the limit are highlighted with red bars

#### Cognitive Complexity Top 22

- Horizontal bar chart
- Yellow dashed line: Target upper limit (15)
- Red dashed line: Warning threshold (25)
- Colors: blue (<=15), yellow (16-25), red (>25), dark red (>100)

#### Test Status

- Donut chart
- Passed (green), failed (red), ignored (gray)

#### File Size Distribution (by Range)

- Vertical bar histogram
- Ranges: 0-200, 201-500, 501-800, 801-1200, 1201-2000, 2001-5000, 5001+
- Ranges exceeding 1,200 lines are shown in red

## metrics.json Schema

```json
{
  "timestamp": "2026-02-23T...",
  "file_lines": [
    { "file": "src/wasm_api.rs", "lines": 1770 }
  ],
  "clippy": {
    "warnings": 0,
    "autofix": 0
  },
  "cognitive_complexity": [
    { "file": "src/renderer/layout/table_partial.rs", "line": 25, "complexity": 85 }
  ],
  "tests": {
    "passed": 608,
    "failed": 0,
    "ignored": 0
  },
  "coverage": null,
  "thresholds": {
    "max_lines": 1200,
    "max_cognitive_complexity": 15,
    "warn_cognitive_complexity": 25,
    "target_clippy_warnings": 0,
    "target_coverage": 70
  }
}
```

## Changing Thresholds

Modify the `thresholds` block at the bottom of `metrics.sh`:

```bash
"thresholds": {
    "max_lines": 1200,              # File line count upper limit
    "max_cognitive_complexity": 15,  # CC target (yellow dashed line)
    "warn_cognitive_complexity": 25, # CC warning (red dashed line)
    "target_clippy_warnings": 0,    # Clippy target
    "target_coverage": 70           # Coverage target (%)
}
```

## Notes

- `metrics.sh` temporarily modifies `clippy.toml` and restores it afterward. If an existing `clippy.toml` is present, its contents are backed up and restored.
- The `output/` directory is listed in `.gitignore`, so `metrics.json` and `dashboard.html` are not tracked by Git.
- `scripts/dashboard.html` is the source of truth; `output/dashboard.html` is automatically copied when `metrics.sh` runs.
