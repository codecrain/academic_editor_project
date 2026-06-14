# Task 172: Paragraph Numbering/Bullets — Implementation Plan

## Implementation Steps (4 Steps)

### Step 1: WASM API + JSON Pipeline

- `formatting.rs`: Add `numbering_id` to build_para_properties_json
- `helpers.rs`: Add `"numberingId"` parsing
- `wasm_api.rs`: New WASM APIs — getNumberingList, getBulletList, ensureDefaultNumbering, ensureDefaultBullet(char)
- `wasm-bridge.ts`: 4 wrappers
- `types.ts`: Add numberingId to ParaProperties

### Step 2: Toolbar Buttons + Toggle Logic

- `index.html`: Numbering/bullet/level buttons in #icon-toolbar
- `icon-toolbar.css`: Icon CSS
- `input-handler.ts`: toggleNumbering(), toggleBullet()
- `format.ts`: Command registration
- `toolbar.ts`: Event binding

### Step 3: Bullet Selection Popup

**`rhwp-studio/src/ui/bullet-popup.ts`** (new):
- 18-type bullet character grid popup
- Characters: filled/open circle, filled/open square, filled/open diamond, filled/open triangle, star, open star, spade, club, heart, diamond, checkmark, arrow, dash, dot

### Step 4: Numbering Format Dialog

**`rhwp-studio/src/ui/numbering-dialog.ts`** (new):
- Hancom-compatible number format presets (6~8 types)
- Start number input + preview panel

## Verification

| Scenario | Expected Result |
|----------|----------------|
| Click "Numbering" button in toolbar | Default numbering applied to current paragraph |
| Click again on numbered paragraph | Numbering removed |
| Click "Bullet" button in toolbar | Default bullet (filled circle) applied |
| Select open square from bullet dropdown | Character changed |
| Click "Level Up/Down" | Level changed |
| Select preset in numbering format dialog | Pattern applied |
