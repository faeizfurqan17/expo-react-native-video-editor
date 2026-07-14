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
- [x] FilterTools (scrollable filter list, full-strength presets)
- [x] EffectTools (effect grid + active list)
- [x] StickerTools (sticker picker + active list)
- [x] DraggableTextOverlay (drag on preview via gesture-handler)
- [x] StickerOverlayRenderer (Skia canvas rendering)
- [x] SpeedControl, CropControl
- [x] Undo/Redo buttons in header (CapCut-style)

## Phase 4: Filters & Effects ✅
- [x] Skia color matrix definitions for 11 filter presets (`presets.ts`)
- [x] Preview: Skia `useVideo` + `fitbox` (rotation) + `ColorMatrix` (single decoder when filtered)
- [x] Export: `colorchannelmixer`/`lut` from same matrix as preview (`ffmpeg-command-builder.ts`)
- [x] 7 effect types with FFmpeg filter chains
- [ ] Optional: PNG / `.cube` LUTs for higher fidelity than matrix + geq
- [x] Effect preview approximations (`utils/effect-preview.ts` + preview transforms/washes; see FILTERS_AND_EFFECTS.md for fidelity notes)

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
- Crop rectangle UI maps to the **unrotated** source frame; export clamps crop against post-rotation dims, but combining crop + 90°/270° rotation on the same clip may not match the preview exactly.

## Pending Features (TODO)
- [x] Audio picker integration (expo-document-picker, `handleAddAudio`)
- [x] Voiceover recording with expo-audio (record/stop in AudioTools; waveform UI still TODO)
- [x] Sticker image picker integration (expo-image-picker)
- [x] Volume slider panel for edit mode (per-segment `VolumeControl`)
- [x] Effect preview during playback (transform/wash approximations, not full Skia parity)
- LUT-based filter preview (higher quality than color matrix)

## Hardening Pass (Completed)
- [x] Effects/stickers enable windows localized to segment time after `-ss` cuts (were absolute → never fired past the first split)
- [x] Effects selected by overlap so they span split boundaries
- [x] zoompan sized from real dims (was hardcoded `s=hd1080`); gated via `it` since zoompan has no timeline support
- [x] shake keeps constant frame dims (concat `-c copy` safe)
- [x] Rotate is per-segment (was rotating all clips in lockstep)
- [x] `-c:a aac` explicit on audio mix output
- [x] crop clamped to frame bounds, even dims
- [x] drawtext escaping for `\` and `%`; path quoting for embedded quotes
- [x] Trim clamped in store (no zero-length segments); export skips degenerate segments
- [x] Live draggable crop rectangle with Apply/Cancel
- [x] Init failure shows error + Retry (no more silent 30s/1080p fallback)
- [x] Unit tests: command builder, store (split/delete/remap/undo), playback-sync, effect-preview (`yarn test`)
