# Phase 3 Histogram Range Slider

**Date:** 2026-06-12  
**Status:** Approved

## Summary

Phase 3 (`P3.1`, `P3.2`) histogram sliders in `ScoreHistogramPanel` should allow filtering from both ends (lo and hi handles). Phase 2 (`ALFilterPanel`) remains unchanged with threshold (single lo handle) sliders.

## Background

`HistogramSlider` already supports `mode="range"` (two handles) and `mode="threshold"` (single lo handle). `ScoreHistogramPanel` and its inner `PropertyRow` hardcode `mode="threshold"`, ignoring the hi handle and always emitting `[lo, 1]`.

## Design

### `PropertyRow` changes

Add `mode?: "range" | "threshold"` prop (default `"threshold"`):
- Forward `mode` to `HistogramSlider`
- Header label: `≥ lo` when threshold, `lo – hi` when range

### `ScoreHistogramPanel` changes

Add `sliderMode?: "range" | "threshold"` prop (default `"threshold"`):
- Thread `sliderMode` into every `PropertyRow` instance
- **P3.1 handler** (`handleSingleSlider`): emit `[newNorm[0], newNorm[1]]` instead of `[newNorm[0], 1]` when `sliderMode === "range"`
- **P3.2 render loop**: pass `newNorm` directly to `handleMultiSlider` instead of `[newNorm[0], 1]` when `sliderMode === "range"`
- **`singleNormRange`**: use `[alFilters.visibility.range?.[0] ?? 0, alFilters.visibility.range?.[1] ?? 1]` (hi was already stored in Redux, just ignored)

### Call site

Pass `sliderMode="range"` to `ScoreHistogramPanel` wherever it is rendered for Phase 3. No changes to `ALFilterPanel`, `phases.ts`, `HistogramSlider`, or Redux state shape.

## Files to change

| File | Change |
|------|--------|
| `src/components/al/HistogramSlider.tsx` | No change |
| `src/components/al/ScoreHistogramPanel.tsx` | Add `sliderMode` prop, fix handlers and `singleNormRange` |
| `src/components/al/ALFilterPanel.tsx` | No change |
| `src/studyPhases/phases.ts` | No change |
| Call site rendering `ScoreHistogramPanel` | Pass `sliderMode="range"` |
