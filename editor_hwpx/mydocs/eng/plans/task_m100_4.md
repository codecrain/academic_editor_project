# Task #4: Non-TAC Picture (Text Wrap Layout) Height Not Reflected — Plan

## Goal

When a non-TAC picture (treat_as_char=false) is placed in the body, ensure the picture height is reflected in the y-coordinate of subsequent elements.

## Symptoms

- `samples/tac-img-02.hwpx` page 21, `s0:pi=330`
- Non-TAC picture (172.1x88.2mm) and subsequent table (pi=334) overlap in rendering

## Root Cause

- `layout_shape_item()` is a void function that doesn't return y_offset
- `layout_body_picture()` returns updated y_offset for `VertRelTo::Para` cases, but the caller ignores it

## Implementation

### Step 1: Change layout_shape_item Return Type and Reflect y_offset

- Change `layout_shape_item()` return type to `f64`
- Capture and return `layout_body_picture()`'s return value
- Reflect in `y_offset` at the call site

## Verification Criteria

- Picture and table do not overlap on page 21
- `cargo test` all passing
- Full 67-page export normal
