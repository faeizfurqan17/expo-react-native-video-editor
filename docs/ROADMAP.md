# Roadmap

## Phase 1: Project Setup ✅
- [x] Create CLAUDE.md for context persistence
- [x] Create docs/ folder with architecture, features, API, filters docs
- [x] Set up monorepo with yarn workspaces
- [x] Create library package scaffold
- [x] Create example Expo app

## Phase 2: Core Engine ✅
- [x] Define TypeScript types (VideoSegment, Overlay, Filter, Effect, etc.)
- [x] Implement Zustand editor store
- [x] Implement FFmpegEngine wrapper (around beedeez/ffmpreg-kit)
- [x] Implement FFmpegCommandBuilder (all operations)
- [x] Implement ExportPipeline with progress tracking
- [x] Undo/redo history system with debouncing for continuous actions

## Phase 3: UI Components ✅
- [x] VideoEditor container (root component)
- [x] VideoPreview (expo-video or Skia `useVideo` when filtered; segment time sync; overlays)
- [x] Timeline (FFmpeg thumbnail track + trim handles + playhead)
- [x] TextTimeline (animated drag/trim for text overlays)
- [x] Toolbar (tab bar with tool panels)
- [x] EditTools (split, speed, volume, crop, rotate, delete)
- [x] AudioTools (add audio, voiceover, mixer)
- [x] TextTools (font, color, alignment, highlight)
- [x] FilterTools (scrollable filter list + intensity slider)
- [x] EffectTools (effect grid + active list)
- [x] StickerTools (sticker picker + active list)
- [x] DraggableTextOverlay (drag on preview via gesture-handler)
- [x] StickerOverlayRenderer (Skia canvas rendering)
- [x] SpeedControl, CropControl
- [x] Undo/Redo buttons in header (CapCut-style)

## Phase 4: Filters & Effects ✅
- [x] Skia color matrix definitions for 11 filter presets (`presets.ts`)
- [x] Filter intensity via `applyIntensity()` (preview + export)
- [x] Preview: Skia `useVideo` + `ImageShader` + `ColorMatrix` (single decoder when filtered)
- [x] Export: FFmpeg `geq` from same matrix as preview (`ffmpeg-command-builder.ts`)
- [x] 7 effect types with FFmpeg filter chains
- [ ] Optional: PNG / `.cube` LUTs for higher fidelity than matrix + geq
- [ ] Implement effect preview animations (Skia + Reanimated)

## Phase 5: Example App ✅
- [x] Home screen (pick video from gallery or record)
- [x] Editor screen (full editor integration)
- [x] Preview screen (export result display)
- [ ] Test all features on iOS simulator
- [ ] Test all features on Android emulator

## Phase 6: Polish & Publishing
- [ ] Write comprehensive README with screenshots
- [ ] Installation guide
- [ ] npm package publishing setup
- [ ] GitHub Actions CI
- [ ] MIT License
- [x] Contributing guide

## Recent Fine-tuning (Completed)
- [x] VideoPreview: player time sync (playhead moves during playback)
- [x] VideoPreview: overlays only visible within their time range
- [x] VideoPreview: filtered path uses Skia `useVideo` + matrix (no dual H.264 decode with `VideoView`)
- [x] Export pipeline: fast seek (-ss before -i)
- [x] Export pipeline: proper -filter_complex for sticker overlays
- [x] Export pipeline: audio filters (volume + atempo) built as single -af
- [x] Export pipeline: filter color via `geq` from preset matrix; FFmpeg errors throw (non-zero return code)
- [x] CropControl: active preset highlighting
- [x] TextTimeline: uses effective duration (matches video timeline after splits)
- [x] TextTimeline: smooth animated drag/trim with memoized tracks
- [x] TrimHandle: right-side clamp to source duration
- [x] Undo/redo: debounced for continuous actions (text, sliders, trim)
- [x] Thumbnail cleanup: stale files deleted on regeneration

## Known Issues / Watch-outs
- FFmpeg-kit original is archived (June 2025). Using beedeez fork.
- `@spreen/ffmpeg-kit-react-native` is iOS-only — do NOT use
- Skia `useVideo` requires **Android API 26+** (Shopify Skia docs).
- Timeline thumbnails use **FFmpeg** strips (`utils/thumbnails.ts`), not `expo-video` thumbnail APIs.
- `expo-av` deprecated — use `expo-audio` for recording where applicable.
- Requires Expo dev builds (not Expo Go) for native modules

## Pending Features (TODO)
- Audio picker integration (file picker for music tracks)
- Voiceover recording with expo-audio
- Sticker image picker integration
- Volume slider panel for edit mode
- Effect preview on Skia canvas during playback
- LUT-based filter preview (higher quality than color matrix)
