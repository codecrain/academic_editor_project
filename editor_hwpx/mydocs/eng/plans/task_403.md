# Task 403: Automated HWP Sample Generation for Reverse Engineering

## Objective

Programmatically generate controlled HWP test case files, have them verified in Hancom by the project lead, then analyze LINE_SEG to build a systematic reverse engineering process.

## Background

Tasks 398~400 improved line break accuracy through trial and error, but had limitations in reverse-engineering Hancom's exact algorithm. Controlled experiments that change only one variable while holding others constant are needed.

### Reverse Engineering Process

```
1. rhwp tests generate HWP sample files (samples/re-*.hwp)
2. Project lead opens in Hancom to verify rendering matches intent
3. Verified samples are analyzed via rhwp LINE_SEG comparison tests
4. Derive Hancom's calculation formulas from difference patterns
5. Apply to rhwp code → measure match rate → iterate
```

## Implementation Plan

### Step 1: HWP Sample Generation Test Framework

- Helper functions to programmatically create DocumentCore and save as HWP files
- Specify font, character size, line spacing, alignment, margins, indent, etc. as parameters
- Output to `samples/re-*.hwp`

### Step 2: First Sample Set — Basic Width Measurement

| File | Content | Verification Target |
|------|------|----------|
| re-01-hangul-only | Repeated Korean characters, 2~3 lines | Full-width Korean character width |
| re-02-space-count | "A B C D..." with spaces, 2~3 lines | Space width |
| re-03-latin-only | Repeated "abcdef...", 2~3 lines | Latin character width |
| re-04-digit-only | Repeated "12345...", 2~3 lines | Digit width |
| re-05-mixed-koen | Repeated "Korean+English", 2~3 lines | Mixed Korean-English |
| re-06-punctuation | "A,B.C!D?" repeated, 2~3 lines | Punctuation width |

### Step 3: Second Sample Set — Line Break Boundaries

| File | Content | Verification Target |
|------|------|----------|
| re-11-boundary-exact | Korean only, exactly 1 line + 1 character | Line break boundary |
| re-12-boundary-space | Line full + space + Korean | Space line break |

### Step 4: Third Sample Set — Per Font

Same text, different fonts (Batang/BatangChe/Dotum/Gulim)

## Common Settings

- Paper: A4 (210x297mm)
- Margins: Left 30, Right 30, Top 20, Bottom 15 mm
- Line break criterion: Character
- Minimum space: 100%
- Justify alignment
- No margins/indent (unless otherwise specified)

## Deliverables

- HWP sample generation tests (test module in `src/`)
- Generated `samples/re-*.hwp` files
- Reverse engineering analysis results document
