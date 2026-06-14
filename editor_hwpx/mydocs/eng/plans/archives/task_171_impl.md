# Task 171: Paragraph Shape Advanced — Implementation Plan

## Implementation Steps (2 Steps)

### Step 1: Format Bar Distribute/Split Buttons

**`rhwp-studio/index.html`** — Add 2 buttons after justify alignment in alignment button group:
```html
<button id="btn-align-distribute" class="sb-btn" title="Distribute Alignment">
  <span class="sb-align sb-al-distribute"></span>
</button>
<button id="btn-align-split" class="sb-btn" title="Split Alignment">
  <span class="sb-align sb-al-split"></span>
</button>
```

**`rhwp-studio/src/styles/style-bar.css`**:
- `.sb-al-distribute` — 2 dashed line icon (border-top: dashed)
- `.sb-al-split` — Solid+dotted mixed line icon

**`rhwp-studio/src/ui/toolbar.ts`** — Add 2 to setupAlignButtons array

**`rhwp-studio/src/command/commands/format.ts`** — Register 2 commands:
- `format:align-distribute` → `ih.applyParaAlign('distribute')`
- `format:align-split` → `ih.applyParaAlign('split')`

### Step 2: Line Break Mode Pipeline

**`src/model/style.rs`** — Add 2 fields to ParaShapeMods:
```rust
pub english_break_unit: Option<u8>,  // 0=word, 1=hyphen, 2=character
pub korean_break_unit: Option<u8>,   // 0=word phrase, 1=character
```
Manipulate attr1 bits 5-6 (English), 7 (Korean) in apply_to().

**`src/document_core/commands/formatting.rs`** — build_para_properties_json:
- Extract `(a1 >> 5) & 0x03` (englishBreakUnit), `(a1 >> 7) & 0x01` (koreanBreakUnit) from attr1
- Include in JSON

**`src/document_core/helpers.rs`** — parse_para_shape_mods:
- `"englishBreakUnit"` → `mods.english_break_unit`
- `"koreanBreakUnit"` → `mods.korean_break_unit`

**`rhwp-studio/src/core/types.ts`** — ParaProperties interface:
```typescript
englishBreakUnit?: number;
koreanBreakUnit?: number;
```

**`rhwp-studio/src/ui/para-shape-dialog.ts`**:
- Private fields: `englishBreakSelect`, `koreanBreakSelect`
- Extended tab buildExtendedTab(): Add "Line Break Criteria" fieldset
  - Korean: select (word phrase/character)
  - English: select (word/hyphen/character)
- show(): Initialize from backend values
- collectMods(): Collect changed values

## Verification

| Scenario | Expected Result |
|----------|----------------|
| Click distribute alignment button in format bar | Paragraph becomes distribute-aligned (equal character spacing) |
| Click split alignment button in format bar | Paragraph becomes split-aligned |
| Change line break mode in paragraph shape dialog | Korean/English line break criteria changed |
| Open HWP file with line break mode set | Dialog shows accurate values |
| Save HWP and reopen | Line break mode values preserved |
