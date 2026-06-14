# Task 189: Image Control Properties UI Enhancement

## Overview

Complete the properties binding and detail attribute change reflection for the image (Picture) control's context menu → "Object Properties" dialog.

## Current Status Analysis

### Dialog Tab Structure (for images)

| Tab | Status | Description |
|-----|--------|-------------|
| Basic | Partially complete | Size/position/layout works. Rotation/mirror/skew disabled |
| Margin/Caption | Partially complete | Margins work. Caption size/spacing/options disabled |
| Line | Complete | Border line properties |
| Picture | **Incomplete** | Stub panel ("to be implemented later") |
| Shadow | Complete | Shadow properties |

### Key Incomplete Items

1. **"Picture" tab not implemented**: No brightness, contrast, effect UI
2. **Basic tab disabled features**: Rotation, horizontal/vertical flip, skew, restrict to page, allow overlap, keep on same page
3. **Margin/Caption tab**: Caption detail settings disabled
4. **Rust properties API**: Only brightness/contrast supported, effect not supported

## Scope

### High Priority (This Task)
- Implement "Picture" tab (brightness, contrast, effect)
- Activate rotation/flip in basic tab
- Add Rust-side effect property support

### Low Priority (Future)
- Skew, page area restriction, and other advanced layout options
- Caption detail settings
- Picture fill (watermark, etc.)
