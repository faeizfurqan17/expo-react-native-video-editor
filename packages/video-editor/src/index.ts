// Main component
export { VideoEditor } from './components/video-editor';

// Hooks
export { useVideoEditor } from './hooks/use-video-editor';

// Core
export { FFmpegEngine } from './core/ffmpeg-engine';
export { FFmpegCommandBuilder } from './core/ffmpeg-command-builder';
export { ExportPipeline } from './core/export-pipeline';

// Store
export { createEditorStore } from './store/editor-store';
export type { EditorStore, EditorActions } from './store/editor-store';

// Filters
export { FILTER_PRESETS, getFilterByPreset, IDENTITY_MATRIX } from './filters/presets';
export type { FilterDefinition } from './filters/presets';

// Types
export type {
  TextOverlay,
  StickerOverlay,
  Overlay,
  AudioTrack,
  FilterPreset,
  FilterState,
  SourceType,
  ExportQuality,
  ExportFormat,
  ExportConfig,
  ExportResult,
  FeatureConfig,
  ThemeConfig,
  EditorConfig,
  EditorSheet,
  EditorState,
} from './core/types';
export { IMAGE_SOURCE_DURATION_SECONDS } from './core/types';

// Utils
export { formatTime, formatTimestamp, clamp } from './utils/time';
export { fitRect, clamp01 } from './utils/layout';
