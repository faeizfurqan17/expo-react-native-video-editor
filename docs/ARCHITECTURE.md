# Architecture

## Overview

```
┌─────────────────────────────────────────────────────┐
│                   VideoEditor                        │
│  (Main container — state, modes, export)             │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │              VideoPreview                    │    │
│  │  No filter:                                 │    │
│  │    expo-video VideoView (decode + audio)     │    │
│  │  With filter:                               │    │
│  │    expo VideoPlayer paused + muted (clock)   │    │
│  │    Skia useVideo (decode + audio)            │    │
│  │    Canvas: Fill → ImageShader → ColorMatrix  │    │
│  │  Overlays:                                  │    │
│  │    Skia Canvas — stickers                    │    │
│  │    RN views — draggable text                  │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │              Timeline                         │    │
│  │  FFmpeg strip thumbnails, trim, playhead    │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │              Toolbar                          │    │
│  │  Edit | Audio | Text | Filters | Effects |   │    │
│  │  Stickers                                     │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Module Responsibilities

### Core Engine (`packages/video-editor/src/core/`)
- **ffmpeg-engine.ts** — Thin wrapper around `ffmpreg-kit-react-native` / `ffmpeg-kit-react-native`. Executes commands, optional progress via statistics callback.
- **ffmpeg-command-builder.ts** — Builds `-vf` / `-filter_complex` strings (trim bounds, speed `setpts`, rotate `transpose`, crop, **color matrix via `geq`**, effects, `drawtext`, sticker overlay chains, audio `atempo`/`volume`/`amix`).
- **export-pipeline.ts** — Per-segment encode, concat, optional audio mix, writes final file. **Throws** if FFmpeg returns a non-zero exit code (segment, concat, or mix step).
- **types.ts** — `VideoSegment`, overlays, `FilterPreset`, `Effect`, `EditorConfig`, etc.

### Components (`packages/video-editor/src/components/`)
- **video-editor.tsx** — Root UI: preview, timeline, toolbar, export flow.
- **Preview/video-preview.tsx** — Playback, segment-aware time sync (`playback-sync.ts`), Skia filtered path vs native `VideoView`, overlays.
- **Timeline/** — Thumbnails, scrub, split/trim UI.
- **Toolbar/** — Mode panels (`filter-tools`, `edit-tools`, etc.).
- **Controls/** — Speed, crop modals.

### Filters (`packages/video-editor/src/filters/`)
- **presets.ts** — `FILTER_PRESETS`: each preset has a **4×5 color matrix** (same semantics as Skia). `applyIntensity()` blends matrix toward identity. `getFilterByPreset()` lookup.

### Store & hooks
- **store/editor-store.ts** — Zustand: segments, playback, filter, overlays, undo/redo (debounced for sliders).
- **hooks/use-video-editor.ts** — Subscribes to store; exposes actions and `exportVideo()`.

### Utils
- **utils/thumbnails.ts** — FFmpeg frame strip for timeline thumbs (not `expo-video` thumbnails).
- **utils/playback-sync.ts** — `resolvePlaybackTick`, `clampSourceTimeToSegments` for multi-segment preview.

## Data Flow

```
User action → editor-store (Zustand) → UI re-render

Export:
  segments + filter + overlays + crop
       → ExportPipeline.processSegment (FFmpeg per segment)
       → concat → optional audio mix → final path
       → onProgress / ExportResult
```

## Preview vs Export

| Aspect | Preview | Export |
|--------|---------|--------|
| **Video decode** | `expo-video` **or** Skia `useVideo` (never both decoding at full rate for the same picture) | FFmpeg only |
| **Filters** | Same matrix as `presets.ts`: `Fill` → `ImageShader` → `ColorMatrix` on Skia frames | Same matrix → **`format=rgb24,geq=…,format=yuv420p`** built in `FFmpegCommandBuilder.colorMatrixToGeqFilter()` after `applyIntensity()` |
| **Intensity** | `applyIntensity(matrix, intensity)` | Same interpolation, then geq |
| **Text** | RN `Animated.Text` + gestures | FFmpeg `drawtext` |
| **Stickers** | Skia `Image` on overlay canvas | FFmpeg `overlay` in `-filter_complex` when sticker inputs exist |
| **Speed** | Player / Skia playback | `setpts` + `atempo` chain |
| **Audio (filtered preview)** | Skia `useVideo` volume | Re-encoded in export pipeline |

## Key Libraries

### `expo-video`
- **`useVideoPlayer` + `VideoView`**: default preview (no filter).
- With a color grade: player stays mounted for seeks / state, but **paused and muted**; **`VideoView` unmounted** so only Skia decodes video for display. Timeline time while filtered is driven from Skia’s clock (`useAnimatedReaction`) through the same `resolvePlaybackTick` logic as `timeUpdate`.

### `@shopify/react-native-skia`
- Stickers on `Canvas`; filtered preview uses **`useVideo`**, **`Fill`**, **`ImageShader`**, **`ColorMatrix`** (see Skia [Video](https://shopify.github.io/react-native-skia/docs/video/) docs). **Android: Skia video APIs target API 26+.**

### `ffmpreg-kit-react-native` (or `ffmpeg-kit-react-native`)
- Invoked as a command string from `FFmpegEngine.execute` / `executeWithProgress`.

### Other
- **`react-native-reanimated`** — Gestures, Skia playback options (`paused` / `seek` / `volume` as shared values), `useAnimatedReaction` for filtered timeline sync.
- **`react-native-gesture-handler`** — Timeline scrub, text drag.
- **`zustand`** — Editor state.

### Optional / not in the example app today
- **`react-native-video-trim`** — Could be integrated for a native trim sheet; trimming in this repo is timeline + FFmpeg on export.
- **`@azzapp/react-native-skia-video`** — Not wired; export is FFmpeg-based.
