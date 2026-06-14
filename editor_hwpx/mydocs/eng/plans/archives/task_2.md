# Task 2 - Execution Plan: Viewer Rendering Engine Design

## Goal

Design the architecture of an engine that can parse HWP files and render them in a web browser. Based on the HWP 5.0 spec, construct a parser → intermediate representation (IR) → renderer pipeline.

## HWP Spec Analysis Summary

### File Structure
- OLE/CFB container based
- Main streams: FileHeader, DocInfo, BodyText (per Section), BinData
- Record-based structure (TagID + Level + Size + Data)
- Units: HWPUNIT (1/7200 inch), Characters: UTF-16LE

### Core Data Required for Rendering
1. **DocInfo**: Fonts (FACE_NAME), Character Shapes (CHAR_SHAPE), Paragraph Shapes (PARA_SHAPE), Styles, Borders/Backgrounds
2. **BodyText**: Page Definition (PAGE_DEF), Paragraph Headers/Text, Tables (TABLE), Drawing Objects (SHAPE_COMPONENT_*)
3. **BinData**: Images, OLE objects

### Rendering Pipeline
```
HWP File → CFB Parsing → Record Parsing → Intermediate Representation (IR) → Render Tree → Graphics Rendering
```

## Rendering Backend Candidate Analysis

### Option A: ThorVG (C++ Vector Graphics Engine)
| Item | Content |
|------|---------|
| Pros | Lightweight (~150KB), rich vector primitives, official WASM support, MIT license |
| Cons | No official Rust bindings (C API FFI needed), no document layout engine, increased build complexity from C++ dependency |
| Integration | C API → rust-bindgen → Rust FFI → wasm32-unknown-emscripten |
| Precedent | dotlottie-rs (Rust + ThorVG + WASM production case) |
| Suitability | Medium - strong at low-level rendering, but layout engine must be separately implemented |

### Option B: Pure Rust Graphics Library (tiny-skia, etc.)
| Item | Content |
|------|---------|
| Pros | Pure Rust with no C++ dependency, simple wasm32-unknown-unknown target build, easy Cargo ecosystem integration |
| Cons | May have limited features compared to ThorVG, text rendering requires separate crate |
| Candidates | tiny-skia (2D rasterizer), vello (GPU accelerated), femtovg (NanoVG port) |
| Suitability | Medium-High - build simplicity + excellent Rust ecosystem compatibility |

### Option C: Canvas API Direct Call (web-sys)
| Item | Content |
|------|---------|
| Pros | No external library needed, browser-native rendering, lightest WASM output |
| Cons | Rendering logic must be implemented directly, no native build (web-only) |
| Integration | wasm-bindgen + web-sys → Canvas 2D / SVG API calls |
| Suitability | Medium - feasible since final target is web-only, but high implementation volume |

## Scope

- Rendering pipeline architecture design
- Final rendering backend selection (comparative verification of 3 options above)
- Intermediate representation (IR) data structure design
- Rust module structure design (parser, model, renderer)
- WASM ↔ JavaScript interface design
- Define first-pass support scope (text, tables, images, basic shapes)

## Expected Deliverables

- Rendering engine architecture design document (`mydocs/tech/rendering_engine_design.md`)
- Rust module structure (parser, model, renderer module skeleton code)
- WASM interface definition

## Status

- Created: 2026-02-05
- Status: Approved
