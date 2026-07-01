# Filters & Effects System

## Filter system overview

One **color matrix per preset** lives in `packages/video-editor/src/filters/presets.ts` (4×5 row-major, same idea as SVG / Skia `ColorMatrix`).

1. **Preview** — For non-`normal` presets with intensity > 0, frames come from Skia **`useVideo`**, then **`Fill` → `ImageShader` → `ColorMatrix`** with `applyIntensity(presetMatrix, intensity)`. `BackdropFilter` over a native `VideoView` is **not** used (native video is not sampled by Skia backdrops on React Native).

2. **Export** — The **same** matrix (after `applyIntensity`) is applied in FFmpeg via **`geq`** on RGB planes (`format=rgb24` → `geq` → `format=yuv420p`), built in `ffmpeg-command-builder.ts` (`colorMatrixToGeqFilter`). No per-preset `colorbalance` / `colortemperature` strings anymore; that keeps preview and export aligned to one source of truth.

3. **Intensity** — `applyIntensity()` interpolates each matrix entry toward the identity matrix. There is **no** separate FFmpeg `mix` blend for intensity.

## Built-in filter presets

All presets below share the pipeline above; names match `FilterPreset` in `types.ts`.

| Preset   | Intent (creative) |
|----------|---------------------|
| normal   | Identity — no op    |
| norway   | Cool blues, lifted shadows |
| neon     | High saturation / contrast |
| retro    | Warm, faded         |
| warm     | Golden warm         |
| cool     | Blue cool           |
| bw       | Grayscale           |
| vintage  | Sepia-like          |
| sunset   | Warm orange / pink  |
| film     | S-curve / muted     |
| fade     | Lifted blacks, soft |

Exact numbers: see `FILTER_PRESETS` in `presets.ts`.

## Skia color matrix format

20 floats (4×5):

```
[R_r, R_g, R_b, R_a, R_offset,
 G_r, G_g, G_b, G_a, G_offset,
 B_r, B_g, B_b, B_a, B_offset,
 A_r, A_g, A_b, A_a, A_offset]
```

### `applyIntensity`

```typescript
function applyIntensity(filterMatrix: number[], intensity: number): number[] {
  return filterMatrix.map((val, i) => {
    const identityVal = IDENTITY_MATRIX[i];
    return identityVal + (val - identityVal) * intensity;
  });
}
```

## LUTs (optional / future)

For higher fidelity you could add `.cube` LUTs and FFmpeg `lut3d=…`, or PNG LUTs with a custom Skia shader. The **current** implementation uses **matrices + geq** only—no bundled LUT files.

## Effects system

Effect types and FFmpeg strings are defined in `ffmpeg-command-builder.ts` (`effect()`). Preview does **not** yet mirror every effect on Skia; export applies the FFmpeg chain.

### Zoom In / Zoom Out
- FFmpeg `zoompan` with `enable='between(t,…)'` for timed window.

### Glitch / VHS / Soul / Shake / Flash
- FFmpeg filters as built in `effect()` (see source for exact expressions).

### Adding a custom filter

1. Add `FilterPreset` in `types.ts` if needed.
2. Append a `FilterDefinition` to `FILTER_PRESETS` in `presets.ts` with `colorMatrix`.
3. No manual FFmpeg preset string is required — `buildFilterGraph` builds **`geq`** from that matrix.
4. Optionally extend `FilterTools` UI.

### Adding a custom effect

1. Add `EffectType` and handling in `types.ts` / store.
2. Implement `FFmpegCommandBuilder.effect()`.
3. (Optional) Skia preview in `VideoPreview` or a dedicated overlay.
