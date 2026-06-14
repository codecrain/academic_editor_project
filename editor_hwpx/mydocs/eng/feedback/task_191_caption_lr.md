# Feedback: Table Caption Left/Right Placement Behavior (Related to Task 191)

## Hancom Behavior Verification Results

### Left/Right Caption Placement Rules

| Caption Position | Table Position Change | Caption Placement |
|-----------|-------------|-----------|
| Left (top/center/bottom) | Table shifts right by caption size | Caption placed to the left of the table |
| Right (top/center/bottom) | No change in table position | Caption placed to the right of the table |
| Top/Bottom | No change in table position | Caption placed above/below the table, caption size setting not required |

### Detailed Behavior

- Left caption set to 30mm: Table is rendered 30mm from the left
- Right caption set to 30mm: Table rendering position unchanged, caption placed to the right of the table
- If caption content exceeds caption size, line wrapping occurs
- When "single line input" attribute is set, no line wrapping

## Implementation Requirements

1. `captionWidth` -> store in Rust IR (`cap.width`)
2. Left caption: shift table x coordinate right by `cap.width`, place caption at original x
3. Right caption: maintain table x coordinate, place caption at table right edge + spacing
4. Dynamic line wrapping based on caption width (at compose_paragraph or layout stage)
5. Support single-line input attribute
