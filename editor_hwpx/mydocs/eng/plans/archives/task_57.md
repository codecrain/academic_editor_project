# Task 57: Dynamic Reflow Feedback Acceptance Strategy

## 1. Overview

Analyze 4 advanced architecture proposals from external feedback (`mydocs/feedback/dynamic_reflow.md`) against the current tech stack, and establish accept/workaround/defer strategies.

## 2. Current Tech Stack Summary

| Area | Current Implementation | Key Characteristics |
|------|----------------------|---------------------|
| **Document model** | Rust `Document` struct (mutable tree) | `Vec<Section>` -> `Vec<Paragraph>` -> `String text` + `Vec<LineSeg>` + `Vec<CharShapeRef>` |
| **Text layout** | Uses pre-calculated `LineSeg` values from HWP file | No dynamic line breaking. LineSeg not updated after editing |
| **State management** | Rust: current state only (direct mutation) / TS: CommandHistory | Not immutable. History managed on TypeScript side |
| **IME handling** | Hidden textarea + compositionstart/end events | WASM direct calls for composition text insert/delete. Real-time rendering implemented |
| **Rendering pipeline** | Composer -> Pagination (2-pass) -> Layout -> Canvas/SVG | 3-stage pipeline. layout.rs 5017 lines is the core |
| **WASM API** | ~30 APIs for editing/cursor/selection/movement | Auto recompose + repaginate triggered on edit |

## 3. Per-Proposal Analysis

### Proposal 1: Knuth-Plass Algorithm (Text Layout)
- **Verdict: Partial acceptance (workaround)** -- Implement Greedy line-break engine (HWP compatible) instead of full Knuth-Plass
- Accept CJK Kinsoku rules. Defer SIMD parallel computation.

### Proposal 2: Persistent Data Structures
- **Verdict: Defer (maintain current architecture)** -- Current inverse-operation Undo approach is sufficient. Add memory cap to CommandHistory only.

### Proposal 3: Virtual Input & IME Layer
- **Verdict: Partial acceptance** -- Hidden textarea IME already implemented. Accept real-time reflow during composition (linked with Proposal 1).

### Proposal 4: ECS Architecture
- **Verdict: Defer (current structure is similar)** -- Current model/renderer/serializer/wasm_api structure is effectively 4-layer already.

## 4. Urgent Finding: Content Page Boundary Splitting Not Implemented

When paragraphs exceed page boundaries, the **entire paragraph moves to the next page**. This leaves blank space at page bottom. HWP originals fill to the editing area boundary then continue on the next page.

**Root cause**: `PartialParagraph` is defined but never generated in the pagination loop. Paragraphs are treated as atomic units.

## 5. Overall Acceptance Strategy Matrix

| Proposal | Verdict | Priority | Key Action |
|----------|---------|----------|-----------|
| **Paragraph page splitting** | **Accept immediately** | **Urgent** | Implement `PartialParagraph` line-level splitting (existing LineSeg-based) |
| **1. Knuth-Plass** | Accept as Greedy line-break | **Top** | Implement `reflow_paragraph()` dynamic line-break engine |
| **2. Persistent DS** | Defer | Low | Add CommandHistory memory cap only |
| **3. IME Layer** | Partial accept | High | Add reflow trigger during composition |
| **4. ECS** | Defer | None | Maintain current structure |

## 5. Execution Method

This task is a **strategy document** deliverable with no code implementation included.
