# Task 228: Highlight Feature Implementation

## Current Status Analysis

### Already Implemented
- **Model**: `CharShape.shade_color: ColorRef` field exists (default: `0xFFFFFF` = white = none)
- **Parser/Serialization**: shade_color parsing and serialization from HWP files completed
- **WASM API**: `getCharPropertiesAt` delivers `shadeColor` JSON field
- **Character Shape Dialog**: shade color picker exists, applies `CharShapeMods.shade_color` on apply

### Unimplemented
1. **Renderer**: No `shade_color` field in `TextStyle` → cannot render text background rectangles
2. **Style Bar**: Highlight button icon (`sb-highlight-icon`) exists in CSS but behavior not connected

## Implementation Plan

### Step 1: Add shade_color to TextStyle and Renderer Implementation
### Step 2: Style Bar Highlight Button Implementation
### Step 3: WASM Build and Integration Testing
