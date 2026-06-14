# Task 175: Options Dialog + Representative Fonts

## Background

Requirement from B-011. Implement Hancom's "Tools > Options > Font" tab functionality in rhwp-studio.

### Core Requirements

1. **Extensible user settings storage** — accommodate future various settings beyond representative fonts
2. **Options dialog** — accessible from Tools menu, tab structure (Font tab first)
3. **Representative font sets** — presets for 7 languages (Korean/English/Chinese/Japanese/Foreign/Symbol/User) with register/edit/delete

### Current Codebase Status

- Settings storage infrastructure **absent** (no localStorage/IndexedDB usage)
- "Tools" menu **does not exist** (needs HTML addition)
- Font lists **hardcoded** (static arrays in toolbar and CharShapeDialog)
- ModalDialog-based dialog pattern established (dialog.ts)
- CSS prefix rules: `dialog-` (common), per-dialog prefixes (cs-, ps-, sd-)

## Scope

### Included
1. User settings save/load service (UserSettings)
2. Add "Tools" menu + "Options" menu item
3. Options dialog (tab structure, Font tab)
4. Representative font registration dialog (add/edit/delete)
5. Reflect representative fonts in format bar font dropdown

### Excluded (Future separate tasks)
- Font preview (render font name in that font)
- Frequently used fonts setting
- Font list per-tab display
- Edit/Other/File tabs and other options tabs

## Technical Design

### 1. UserSettings Service (localStorage-based)

Single key with full settings as JSON → only add sections for extension. Version field for migration support. Read/write API: `UserSettings.get(path)`, `UserSettings.set(path, value)`.

### 2. Built-in Representative Font Presets (4 sets)

| Name | Korean | English |
|------|--------|---------|
| HamChoRom | HamChoRom Batang | HamChoRom Batang |
| Dotum | HamChoRom Dotum | HamChoRom Dotum |
| Malgun Gothic | Malgun Gothic | Malgun Gothic |
| Batang | Batang | Batang |

User-defined sets are stored in localStorage.

### 3. CSS Prefixes

| Prefix | Target |
|--------|--------|
| `opt-` | Options dialog (OptionsDialog) |
| `fs-` | Font set registration dialog (FontSetDialog) |
| `fse-` | Font set edit dialog (FontSetEditDialog) |

## Risks

- Cannot dynamically get system installed fonts like desktop → provide based on registered web fonts + font-loader.ts list
- localStorage capacity limit (5MB) → more than sufficient for font settings
