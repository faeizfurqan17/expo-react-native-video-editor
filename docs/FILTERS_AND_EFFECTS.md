# Filters & Effects System

## Filter system overview

One **color matrix per preset** lives in `packages/video-editor/src/filters/presets.ts` (4×5 row-major, same idea as SVG / Skia `ColorMatrix`).

1. **Preview** — For non-`normal` presets, frames come from Skia **`useVideo`** decoding the source directly at full resolution. The frame is placed with **`fitbox`** (re-rotates storage-orientation frames using the decoder-reported rotation — phone footage is often landscape pixels + a display-rotation flag) inside a **`Group`**, then **`Image` → `ColorMatrix`** applies the preset matrix at full strength. `BackdropFilter` over a native `VideoView` is **not** used (native video is not sampled by Skia backdrops on React Native). Full-res Skia decode is a known OOM risk on some Android devices — the preview has a stall watchdog that falls back to native (unfiltered) playback if `useVideo` hangs, while export still burns in the real filter regardless.

2. **Export** — The **same** matrix is applied in FFmpeg via **`colorchannelmixer`** (+ `lut` for brightness offsets) — built in `ffmpeg-command-builder.ts` (`colorMatrixToFastFilter`), 10–20× faster than the `geq` RGB-plane approach it replaced. No per-preset `colorbalance` / `colortemperature` strings; preview and export share one matrix per preset.

3. **Intensity** — removed. Filters always apply at full strength; there is no slider or blend-toward-identity step.

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

## LUTs (optional / future)

For higher fidelity you could add `.cube` LUTs and FFmpeg `lut3d=…`, or PNG LUTs with a custom Skia shader. The **current** implementation uses **matrices only** (`colorchannelmixer` + `lut` on export, `ColorMatrix` on preview)—no bundled LUT files.

## Effects system

Effect types and FFmpeg strings are defined in `ffmpeg-command-builder.ts` (`effect()`).

**Timing:** segments are exported with `-ss segment.startTime`, which resets FFmpeg's clock to 0 per segment. `effect()`, `drawText()` and `overlayImage()` therefore take `timeOffset` (the segment start) and `speed`, and localize every `enable`/window expression to segment-local time. Effects are attached to a segment by **overlap**, so one effect can span a split boundary and fire on both pieces.

### Zoom In / Zoom Out
- FFmpeg `zoompan` sized from the actual post-rotation/crop dims (`s=WxH`, even). `zoompan` does **not** support timeline `enable`, so the window is gated inside the `z` expression via `it` (input time), ramping 1 ↔ 1.5 over the effect window with `d=1`.

### Glitch / VHS / Soul / Flash
- FFmpeg filters as built in `effect()` with localized `enable` windows.

### Shake
- Constant-dimension design: the whole clip is cropped to a fixed `iw-20:ih-20` canvas whose x/y offsets jitter only inside the effect window, then scaled back to the input size. Frame dims never change mid-stream, so concat `-c copy` stays valid across segments with and without shake.

## Effect preview (approximation)

`utils/effect-preview.ts` (`computeEffectPreview`) drives a live preview per frame:

| Effect | Preview | Fidelity vs export |
|--------|---------|--------------------|
| zoom_in / zoom_out | scale transform on the video layer | close (same 1↔1.5 linear ramp) |
| flash | white overlay, positive half of the same 4Hz sine | close |
| shake | deterministic ±5px jitter transform | close (export uses `random()`) |
| soul | 1s scale-pulse on the video layer | loose — export is a ghost/echo overlay |
| glitch | RGB-split tint washes + horizontal jitter | loose — export shifts real channels |
| vhs | scanline + tint overlay | loose — export adds real noise/eq |

The washes render in `components/Preview/effect-overlay.tsx`; transforms wrap the video layer in `video-preview.tsx`. No extra decode or Skia pass is used.

### Adding a custom filter

1. Add `FilterPreset` in `types.ts` if needed.
2. Append a `FilterDefinition` to `FILTER_PRESETS` in `presets.ts` with `colorMatrix`.
3. No manual FFmpeg preset string is required — `buildFilterGraph` builds **`geq`** from that matrix.
4. Optionally extend `FilterTools` UI.

### Adding a custom effect

1. Add `EffectType` and handling in `types.ts` / store.
2. Implement `FFmpegCommandBuilder.effect()`.
3. (Optional) Skia preview in `VideoPreview` or a dedicated overlay.
