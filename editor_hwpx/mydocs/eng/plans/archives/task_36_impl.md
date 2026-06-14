# Task 36: Table Border Processing Enhancement - Implementation Plan

## Step 1: Gradient Fill Rendering (P0)
- Extend data models with GradientFillInfo
- Modify style resolver for gradient fill
- Extend SVG renderer with `<defs>`, `<linearGradient>` support

## Step 2: Adjacent Cell Border Deduplication (P1)
- Edge-based border collection
- Adjacent cell border merging rules
- Switch to edge-based rendering

## Step 3: Border Corner Handling and Page Split Boundary (P2, P3)
- Corner z-order for different thicknesses
- Apply table border styles to split table boundaries

## Step 4: Diagonal Border Rendering (P4)
- Convert DiagonalLine → SVG Line (Slash/BackSlash/Crooked)
