# Task 243 Plan: Shape Property Editing UI

## Current State

6 Shape tabs already implemented in the existing `PicturePropsDialog`:
- Basic (size/position/rotation/flip), Margins/Caption, Line (border/arrow/corner), Fill (solid/gradient), Text Box (margin/alignment), Shadow

## Implementation Items

### Completed
1. **`line` type-specific tab list** — `LINE_TAB_NAMES = ['Basic', 'Margins/Caption', 'Line', 'Shadow']`
   - Fill/Text Box tabs excluded (unnecessary for straight lines)
2. **`line` type property save** — Added `setShapeProperties` call path
3. **Initial value loading** — `line` type also uses `getShapeProperties`

### To Verify
- Select line → right-click or toolbar > Object Properties → Property dialog opens
- Change border color/thickness/style/arrows in "Line" tab and apply
- Change size/position in "Basic" tab and apply
