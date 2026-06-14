# Task 264 Plan: Paragraph Numbering/Bullet Dialog Tab Integration

## Current State

- Paragraph numbering dialog: Single tab (numbering only)
- Bullet application: Only via toolbar popup
- Context menu "Paragraph Number Style" → Can only set numbering
- Bullet presets: 22 types (including 4 checkbox types)

## Implementation Plan

### Step 1: Dialog Tab Structure Extension
- Title change: "Paragraph Number Style" → "Paragraph Numbering/Bullets"
- Add tab bar: "Numbering" / "Bullets" tab switching
- Auto-select initial tab based on current headType

### Step 2: Bullets Tab Implementation
- 18 bullet preset grid (identical to Hancom)
- "(None)" selection option
- Display using displayChar in browser (PUA→Unicode mapping)
- Show current bullet character selection state (rawCode-based matching)

### Step 3: Preset Cleanup
- Remove 4 checkbox bullet types (not in Hancom)
- Fix displayChar: Correct icons that don't match PUA mapping (star, pointing hand)
- Simplify BulletPreset interface (remove isCheckbox/checkedChar)

### Step 4: Callback Connection
- Add onApplyBullet callback → call applyBullet(bulletChar)
- Add rawCode field to getBulletList (PUA original code)
- Match current bullet when opening dialog from a Bullet paragraph

## Reference Files

| File | Role |
|------|------|
| rhwp-studio/src/ui/numbering-dialog.ts | Dialog (tab structure + bullets panel) |
| rhwp-studio/src/core/numbering-defaults.ts | Bullet preset definitions |
| rhwp-studio/src/command/commands/format.ts | Command connection (onApplyBullet) |
| rhwp-studio/src/core/wasm-bridge.ts | getBulletList type |
| rhwp-studio/src/styles/numbering-dialog.css | Tab/grid CSS |
| src/wasm_api.rs | getBulletList rawCode addition |
