# BinData ID Mapping Error -- Wrong Background Image Linked

## Date
2026-02-17

## Related Task
Task 105 (Page Border/Background Feature Implementation) -- Follow-up fix

## Symptoms

- When exporting `Worldcup_FIFA2010_32.hwp` to SVG, the page background image was displayed incorrectly
- Expected background: Soccer-themed JPEG image (full page size)
- Actual output: A flag GIF image (104x64px) stretched to fill the entire page

## Root Cause Analysis

### The Meaning of bin_data_id

The `bin_data_id` used to reference images in HWP documents is a **1-indexed ordinal of BinData records in doc_info**.

```
BinData record list:
  [0] storage_id=3, extension=jpg  <- Referenced by bin_data_id=1
  [1] storage_id=1, extension=gif  <- Referenced by bin_data_id=2
  [2] storage_id=2, extension=gif  <- Referenced by bin_data_id=3
  ...
```

`storage_id` determines the filename within the CFB storage (`BIN0003.jpg`, `BIN0001.gif`, etc.) and may not match the record ordinal.

### Incorrect Code

The `BinDataContent` struct stored `id: storage_id`, and images were looked up by `storage_id`:

```rust
// parser/mod.rs -- BinDataContent creation
contents.push(BinDataContent {
    id: bd.storage_id,  // Stores storage_id
    data: decompressed,
    extension: ext.to_string(),
});

// renderer/layout.rs -- Image reference (5 locations)
bin_data_content.iter()
    .find(|c| c.id == img_fill.bin_data_id)  // Searches by storage_id (error!)
```

For the Worldcup file:
- Background ImageFill: `bin_data_id = 1` (first BinData = JPEG background)
- Searching for `storage_id=1` -> matches the second BinData (flag GIF)

### Why It Worked by Coincidence

In most HWP files, `storage_id` is assigned sequentially starting from 1, matching the ordinal. The bug only manifests when `storage_id` is non-sequential, as in the Worldcup file.

## Resolution

Instead of searching by `storage_id`, use `bin_data_id` as a 1-indexed array index:

```rust
/// Finds BinDataContent by bin_data_id (1-indexed ordinal).
fn find_bin_data<'a>(bin_data_content: &'a [BinDataContent], bin_data_id: u16) -> Option<&'a BinDataContent> {
    if bin_data_id == 0 {
        return None;
    }
    bin_data_content.get((bin_data_id - 1) as usize)
}
```

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Added `find_bin_data()` helper, replaced 5 `iter().find(c.id==)` with array index access |
| `src/wasm_api.rs` | 1 location with same fix |

### 6 Locations Fixed

1. Page background image (layout.rs:231)
2. Standalone picture object -- no anchor (layout.rs:3714)
3. Standalone picture object -- with caption (layout.rs:3853)
4. Picture object inside group (layout.rs:4912)
5. Shape image fill (layout.rs:4949)
6. WASM clipboard image (wasm_api.rs:6839)

## Verification Results

| File | Before Fix | After Fix |
|------|-----------|-----------|
| Worldcup background | Flag GIF (104x64) stretched | JPEG background image correct |
| request.hwp shapes | Correct | Correct |
| k-water-rfp page 28 | Correct | Correct |
| All tests | 565 passing | 565 passing |

## Lessons Learned

- `bin_data_id` is a record ordinal, not `storage_id` -- the HWP spec's ID referencing mechanism must be precisely understood
- Code that works by coincidence in most files is hard to detect -> verify with diverse sample files
- When image reference logic is scattered across multiple locations, consistency is difficult to maintain -> centralize with a helper function
