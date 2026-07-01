# expo-react-native-video-editor

An open-source React Native video editor library replacing Banuba Video Editor SDK.

## Quick Context for New Sessions

This is a **monorepo** with:
- `packages/video-editor/` — The npm library (core engine + UI components)
- `example/` — Expo example app for testing all features

## Features (Replicating Banuba)
- **Edit**: split, speed, volume, crop, rotate, delete segments
- **Audio**: add audio/voiceover (UI hooks; export mixes via FFmpeg)
- **Text**: font, highlight, alignment, color
- **Filters**: color-matrix presets (Norway, Neon, Retro, …) — Skia preview + FFmpeg `geq` export
- **Effects**: zoom in, glitch, VHS, soul, etc. (FFmpeg export; limited Skia preview)
- **Stickers**: drag/resize/rotate overlays

## Tech Stack
| Package | Purpose |
|---------|---------|
| `beedeez/ffmpreg-kit-react-native` | FFmpeg processing (iOS + Android) |
| `@shopify/react-native-skia` | Stickers canvas; **filtered** preview (`useVideo` + `ColorMatrix`) |
| `expo-video` | Default preview playback (`useVideoPlayer` + `VideoView`) |
| `expo-audio` | Voiceover / audio recording (where integrated) |
| `expo-file-system` | Export paths, temp files |
| `react-native-reanimated` | Gestures, Skia playback shared values, timeline sync |
| `react-native-gesture-handler` | Touch/drag/pinch |
| `zustand` | Editor state |

## Architecture
Read `docs/ARCHITECTURE.md` for full details.

## Key Decisions
- FFmpeg-kit was archived June 2025. Using `beedeez/ffmpreg-kit-react-native` fork (iOS + Android)
- `@spreen/ffmpeg-kit-react-native` is iOS-only — do NOT use
- Filter preview/export share **one matrix per preset** (`filters/presets.ts`); export uses FFmpeg **`geq`**, not per-preset `colorbalance` strings
- Timeline thumbnails: **FFmpeg** frame strip (`packages/video-editor/src/utils/thumbnails.ts`)
- `expo-av` is deprecated — prefer `expo-audio` for recording
- Requires Expo dev builds (not Expo Go) due to native modules

## Commands
```bash
# Install all dependencies
yarn install

# Run example app
cd example && npx expo start --dev-client

# Build library
cd packages/video-editor && yarn build
```

## Read These Docs
- `docs/ARCHITECTURE.md` — System architecture & data flow
- `docs/FEATURES.md` — Feature specs & FFmpeg commands
- `docs/API.md` — Public API reference
- `docs/FILTERS_AND_EFFECTS.md` — Filter/effect system
- `docs/ROADMAP.md` — Progress tracking
