# React Native Video Editor

An open-source React Native video editor library with full editing capabilities — trim, split, speed, crop, rotate, filters, effects, text overlays, stickers, and audio mixing.

Built as an open-source replacement for Banuba Video Editor SDK.

## Features

| Category | Features |
|----------|----------|
| **Edit** | Split, Speed (0.25x-3x), Volume, Crop (1:1, 4:5, 9:16, 16:9), Rotate, Delete |
| **Audio** | Add background music, Record voiceover, Volume mixer |
| **Text** | Custom fonts, Color picker, Alignment, Highlight/background |
| **Filters** | Norway, Neon, Retro, Warm, Cool, B&W, Vintage, Sunset, Film, Fade |
| **Effects** | Zoom In/Out, Glitch, VHS, Soul, Shake, Flash |
| **Stickers** | Drag, resize, rotate image overlays |

## Installation

```bash
yarn add @anthropic/react-native-video-editor
```

### Peer Dependencies

```bash
yarn add @shopify/react-native-skia react-native-reanimated react-native-gesture-handler expo-video expo-audio expo-file-system @react-native-community/slider
```

### FFmpeg (required for export)

Since `ffmpeg-kit-react-native` was archived, install a community fork:

```bash
# iOS + Android support
yarn add ffmpreg-kit-react-native@github:beedeez/ffmpreg-kit-react-native
```

> **Note**: Requires Expo dev builds (not Expo Go) due to native modules.

## Quick Start

```tsx
import { VideoEditor } from '@anthropic/react-native-video-editor';

function EditorScreen({ videoUri }) {
  return (
    <VideoEditor
      source={videoUri}
      onExportComplete={(result) => {
        console.log('Exported:', result.uri);
      }}
      onCancel={() => navigation.goBack()}
    />
  );
}
```

## Programmatic API

```tsx
import { useVideoEditor } from '@anthropic/react-native-video-editor';

function MyEditor() {
  const editor = useVideoEditor();

  // Initialize with video
  editor.initialize(videoUri, duration, width, height);

  // Edit operations
  editor.split(5.0);
  editor.setSpeed(segmentId, 2.0);
  editor.setVolume(0.5);
  editor.setCrop({ x: 0, y: 0, width: 1080, height: 1080 });
  editor.rotate();

  // Text overlay
  editor.addText({
    text: 'Hello',
    font: 'System',
    fontSize: 24,
    color: '#FFF',
    position: { x: 0.5, y: 0.5 },
    rotation: 0,
    scale: 1,
    alignment: 'center',
    startTime: 0,
    endTime: 5,
  });

  // Filter
  editor.setFilter('norway');
  editor.setFilterIntensity(0.8);

  // Export
  const result = await editor.exportVideo({
    quality: 'high',
    format: 'mp4',
    onProgress: (p) => console.log(`${p * 100}%`),
  });
}
```

## Tech Stack

| Library | Purpose |
|---------|---------|
| `beedeez/ffmpreg-kit-react-native` | FFmpeg video processing (iOS + Android) |
| `@shopify/react-native-skia` | Overlays canvas; filtered preview (`useVideo` + color matrix) |
| `expo-video` | Default preview playback (`VideoView`) |
| `expo-audio` | Voiceover / audio recording (where used) |
| `expo-file-system` | Export output and temp files |
| `react-native-reanimated` | Gestures, Skia playback sync |
| `react-native-gesture-handler` | Touch gestures |
| `zustand` | State management |

## Project Structure

```
packages/video-editor/src/
  core/           # FFmpeg engine, command builder, export pipeline
  components/     # React Native UI components
  filters/        # Filter preset color matrices (+ intensity helper)
  hooks/          # useVideoEditor, useExport
  store/          # Zustand editor state
  utils/          # Helpers

example/          # Expo example app
docs/             # Documentation
```

## Running the Example

```bash
# Install dependencies
yarn install

# Start example app (requires dev build)
cd example
npx expo start --dev-client
```

## License

MIT
