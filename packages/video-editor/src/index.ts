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
export { FILTER_PRESETS, applyIntensity, getFilterByPreset, IDENTITY_MATRIX } from './filters/presets';
export type { FilterDefinition } from './filters/presets';

// Types
export type {
  VideoSegment,
  TextOverlay,
  StickerOverlay,
  Overlay,
  AudioTrack,
  FilterPreset,
  FilterState,
  EffectType,
  Effect,
  CropPreset,
  CropRegion,
  ExportQuality,
  ExportFormat,
  ExportConfig,
  ExportResult,
  FeatureConfig,
  ThemeConfig,
  EditorConfig,
  EditorMode,
  EditorState,
} from './core/types';

// Utils
export { formatTime, formatTimestamp, clamp } from './utils/time';
export { generateThumbnails } from './utils/thumbnails';
