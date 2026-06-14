# Task 175 Implementation Plan: Options Dialog + Representative Fonts

## Implementation Steps (4 Steps)

### Step 1: UserSettings Service + Tools Menu

**Goal**: Build extensible settings save/load infrastructure + add Tools menu

**Tasks**:
1. Create `rhwp-studio/src/core/user-settings.ts` — UserSettings singleton class, localStorage-based, version management, 4 built-in font presets
2. Add "Tools" menu to `index.html` with "Options" item (`data-cmd="tool:options"`)
3. Create `rhwp-studio/src/command/commands/tool.ts` — `tool:options` command registration

### Step 2: Options Dialog (Font Tab)

**Goal**: Implement OptionsDialog (tab structure, font tab content)

**Tasks**:
1. Create `options-dialog.ts` — ModalDialog subclass, Font tab (recent fonts, representative font registration section)
2. Create `options-dialog.css` — `opt-` prefix CSS
3. Connect `tool:options` command to OptionsDialog

### Step 3: Representative Font Registration/Edit/Delete Dialogs

**Goal**: FontSetDialog + FontSetEditDialog implementation

**Tasks**:
1. Create `font-set-dialog.ts` — Font set list (built-in + user-defined), add/edit/delete buttons, built-in presets read-only
2. Create `font-set-edit-dialog.ts` — Font set name input, 7 language font dropdowns, add/edit mode branching
3. Create `font-set-dialog.css` — `fs-`, `fse-` prefix CSS
4. CRUD integration with UserSettings

### Step 4: Format Bar Integration + Verification

**Goal**: Reflect representative fonts in format bar font dropdown + final verification

**Tasks**:
1. Dynamic format bar font dropdown generation from UserSettings
2. "Representative Fonts" section divider + font set list in dropdown
3. On representative font selection, apply all 7 language fonts via wasm-bridge
4. cargo test + WASM build verification
