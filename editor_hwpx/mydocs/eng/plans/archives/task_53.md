# Task 53 Execution Plan: Bottom Status Bar UI Implementation

## Goal

Implement a bottom status bar UI identical to Hancom's WebGian editor.

## Current State

- Zoom controls and page info are positioned at the right side of the style bar (`#style-bar`)
- Status messages are positioned at the right side of the icon toolbar (`#icon-toolbar`)
- No dedicated bottom status bar exists

## Implementation Scope

- Add a status bar at the bottom of the screen identical to Hancom's WebGian
- Left side: page info, section info, insert/overwrite mode
- Right side: zoom fit icon, zoom ratio, zoom in/out icons
- Use Hancom SVG sprite icons (zoom-related row 24)
- Remove zoom/page elements from existing style bar

## Changed Files

| File | Changes |
|------|---------|
| `rhwp-studio/index.html` | Add status bar HTML, remove zoom/page from style bar |
| `rhwp-studio/src/style.css` | Status bar CSS, zoom sprite icons |
| `rhwp-studio/src/main.ts` | Migrate event listeners, zoom fit, status messages |
| `rhwp-studio/src/engine/input-handler.ts` | Insert key mode toggle |

## Verification

- Vite build successful
- Runtime: bottom status bar displayed, zoom/page functionality working
