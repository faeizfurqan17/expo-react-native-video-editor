# Contributing

## Setup

```bash
# Clone the repo
git clone https://github.com/faeizfurqan17/expo-react-native-video-editor.git
cd expo-react-native-video-editor

# Install dependencies
yarn install

# Run example app
cd example
npx expo start --dev-client
```

## Project Structure

```
packages/video-editor/src/   # Library source code
  core/                       # FFmpeg engine, processor, export pipeline
  components/                 # React Native UI components
  filters/                    # LUT files and filter presets
  hooks/                      # React hooks (useVideoEditor, etc.)
  store/                      # Zustand state management
  utils/                      # Utilities

example/                      # Expo example app for testing
docs/                         # Documentation
```

## Development Workflow

1. Make changes in `packages/video-editor/src/`
2. Test in `example/` app
3. Write/update tests
4. Submit PR

## Adding a New Filter

1. Add color matrix to `src/filters/presets.ts`
2. Add FFmpeg command to `src/core/FFmpegCommandBuilder.ts`
3. Optionally add PNG LUT file to `src/filters/luts/`
4. Add filter name to `FilterPreset` type in `src/core/types.ts`
5. Test preview and export

## Adding a New Effect

1. Add effect type to `EffectType` in `src/core/types.ts`
2. Add Skia preview in effect component
3. Add FFmpeg filter chain in `src/core/FFmpegCommandBuilder.ts`
4. Test preview and export
