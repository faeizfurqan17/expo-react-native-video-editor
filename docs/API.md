# Public API Reference

## Main Component

### `<VideoEditor />`

The root component that renders the full video editor UI.

```tsx
import { VideoEditor } from '@anthropic/react-native-video-editor';

<VideoEditor
  source={videoUri}
  onExportComplete={(result) => console.log(result.uri)}
  onCancel={() => navigation.goBack()}
  config={{
    features: {
      trim: true,
      split: true,
      speed: true,
      volume: true,
      crop: true,
      rotate: true,
      audio: true,
      voiceover: true,
      text: true,
      filters: true,
      effects: true,
      stickers: true,
    },
    export: {
      quality: 'high', // 'low' | 'medium' | 'high'
      format: 'mp4',
      maxDuration: 60, // seconds
    },
    theme: {
      backgroundColor: '#000',
      accentColor: '#007AFF',
      textColor: '#FFF',
    },
  }}
/>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | Yes | Video file URI (local or remote) |
| `onExportComplete` | `(result: ExportResult) => void` | Yes | Called when export finishes |
| `onExportProgress` | `(progress: number) => void` | No | Export progress (0-1) |
| `onCancel` | `() => void` | No | Called when user cancels editing |
| `config` | `EditorConfig` | No | Configuration options |

### Export errors

`editor.exportVideo()` (and the underlying `ExportPipeline`) **reject with an `Error`** if FFmpeg exits non-zero while encoding a segment, running concat, or mixing audio. The message includes a tail of FFmpeg’s log output for debugging.

## Hooks

### `useVideoEditor(options)`

Programmatic access to editor functionality without the UI.

```tsx
import { useVideoEditor } from '@anthropic/react-native-video-editor';

const editor = useVideoEditor({ source: videoUri });

// Edit operations
editor.split(5.0);                    // Split at 5 seconds
editor.setSpeed(0, 2.0);             // Segment 0 at 2x speed
editor.setVolume(0.5);               // 50% volume
editor.setCrop({ x: 0, y: 0, width: 1080, height: 1080 });
editor.rotate(90);                    // Rotate 90° CW
editor.deleteSegment(1);             // Delete segment at index 1

// Audio
editor.addAudio({ uri: audioUri, startTime: 0, volume: 0.8 });
editor.removeAudio(audioId);

// Text overlays
const textId = editor.addText({
  text: 'Hello World',
  font: 'Arial-Bold',
  fontSize: 24,
  color: '#FFFFFF',
  backgroundColor: 'rgba(0,0,0,0.5)',
  position: { x: 0.5, y: 0.5 },  // Normalized 0-1
  alignment: 'center',
  startTime: 0,
  endTime: 5,
});
editor.updateText(textId, { color: '#FF0000' });
editor.removeText(textId);

// Stickers
const stickerId = editor.addSticker({
  uri: stickerImageUri,
  position: { x: 0.3, y: 0.3 },
  size: { width: 100, height: 100 },
  rotation: 0,
  startTime: 0,
  endTime: 10,
});

// Filters
editor.setFilter('norway');           // Apply filter preset
editor.setFilterIntensity(0.7);       // 70% intensity
editor.clearFilter();

// Effects
editor.addEffect({
  type: 'zoom_in',
  startTime: 2,
  duration: 1,
});

// Undo/Redo
editor.undo();   // Revert last edit action
editor.redo();   // Re-apply reverted action
// Check availability:
editor.canUndo;  // boolean
editor.canRedo;  // boolean

// Export
try {
  const result = await editor.export({
    quality: 'high',
    format: 'mp4',
    onProgress: (progress) => console.log(`${progress * 100}%`),
  });
  console.log(result.uri); // file:///path/to/exported.mp4
} catch (e) {
  // ExportPipeline throws if FFmpeg returns a non-zero exit code (failed segment, concat, or audio mix).
  console.error(e);
}
```

### `useExport()`

Standalone export hook.

```tsx
const { exportVideo, progress, isExporting, cancel } = useExport();

const result = await exportVideo(editorState, {
  quality: 'high',
  format: 'mp4',
});
```

## Types

```typescript
interface EditorConfig {
  features?: FeatureConfig;
  export?: ExportConfig;
  theme?: ThemeConfig;
}

interface FeatureConfig {
  trim?: boolean;
  split?: boolean;
  speed?: boolean;
  volume?: boolean;
  crop?: boolean;
  rotate?: boolean;
  audio?: boolean;
  voiceover?: boolean;
  text?: boolean;
  filters?: boolean;
  effects?: boolean;
  stickers?: boolean;
}

interface ExportConfig {
  quality?: 'low' | 'medium' | 'high';
  format?: 'mp4' | 'mov';
  maxDuration?: number;
  bitRate?: number;
  frameRate?: number;
  resolution?: { width: number; height: number };
}

interface ThemeConfig {
  backgroundColor?: string;
  accentColor?: string;
  textColor?: string;
  toolbarColor?: string;
}

interface ExportResult {
  uri: string;
  duration: number;
  size: number;  // bytes
  width: number;
  height: number;
}

interface VideoSegment {
  id: string;
  sourceUri: string;
  startTime: number;
  endTime: number;
  speed: number;
  volume: number;
}

interface TextOverlay {
  id: string;
  text: string;
  font: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  position: { x: number; y: number };
  rotation: number;
  alignment: 'left' | 'center' | 'right';
  startTime: number;
  endTime: number;
}

interface StickerOverlay {
  id: string;
  uri: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  startTime: number;
  endTime: number;
}

interface AudioTrack {
  id: string;
  uri: string;
  startTime: number;
  duration: number;
  volume: number;
  type: 'music' | 'voiceover';
}

type FilterPreset = 'normal' | 'norway' | 'neon' | 'retro' | 'warm' | 'cool' | 'bw' | 'vintage' | 'sunset' | 'film' | 'fade';

type EffectType = 'zoom_in' | 'zoom_out' | 'glitch' | 'vhs' | 'soul' | 'shake' | 'flash';

interface Effect {
  type: EffectType;
  startTime: number;
  duration: number;
  intensity?: number;
}
```
