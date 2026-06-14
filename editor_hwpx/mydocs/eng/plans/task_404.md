# Task 404: English Character Width Measurement and Line Break Reverse Engineering

## Objective

Identify and resolve the root cause of re-03 (English ts+/-1) and re-05 (mixed Korean-English ts-8) mismatches. Systematic reverse engineering using fixed-width/variable-width English font samples.

## Implementation Plan

### Step 1: Generate Per-English-Font Samples

Variable-width: Arial, Times New Roman, Hamchorom Batang
Fixed-width: Courier New, Dotum Che, Gulim Che

### Step 2: Compare with Hancom Ground Truth → Derive Difference Patterns

### Step 3: Fix Difference Causes
