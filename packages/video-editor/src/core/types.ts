// ============================================
// Core Types for React Native Video Editor
// ============================================

// --- Video Segments ---

export interface VideoSegment {
  id: string;
  sourceUri: string;
  startTime: number;
  endTime: number;
  speed: number;
  volume: number;
  rotation: 0 | 90 | 180 | 270;
  filter: FilterState;
}

// --- Overlays ---

export interface TextOverlay {
  id: string;
  text: string;
  font: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  position: { x: number; y: number }; // Normalized 0-1
  rotation: number;
  scale: number;
  alignment: 'left' | 'center' | 'right';
  startTime: number;
  endTime: number;
}

export interface StickerOverlay {
  id: string;
  uri: string;
  position: { x: number; y: number }; // Normalized 0-1
  size: { width: number; height: number };
  rotation: number;
  scale: number;
  startTime: number;
  endTime: number;
}

export type Overlay = TextOverlay | StickerOverlay;

// --- Audio ---

export interface AudioTrack {
  id: string;
  uri: string;
  startTime: number;
  duration: number;
  volume: number;
  type: 'music' | 'voiceover';
}

// --- Filters ---

export type FilterPreset =
  | 'normal'
  | 'norway'
  | 'neon'
  | 'retro'
  | 'warm'
  | 'cool'
  | 'bw'
  | 'vintage'
  | 'sunset'
  | 'film'
  | 'fade';

export interface FilterState {
  preset: FilterPreset;
  intensity: number; // 0-1
}

// --- Effects ---

export type EffectType =
  | 'zoom_in'
  | 'zoom_out'
  | 'glitch'
  | 'vhs'
  | 'soul'
  | 'shake'
  | 'flash';

export interface Effect {
  id: string;
  type: EffectType;
  startTime: number;
  duration: number;
  intensity: number; // 0-1
}

// --- Crop ---

export type CropPreset = 'original' | '1:1' | '4:5' | '9:16' | '16:9';

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// --- Export ---

export type ExportQuality = 'low' | 'medium' | 'high';
export type ExportFormat = 'mp4' | 'mov';

export interface ExportConfig {
  quality: ExportQuality;
  format: ExportFormat;
  maxDuration?: number;
  bitRate?: number;
  frameRate?: number;
  resolution?: { width: number; height: number };
  /** Screen width used during preview — needed to scale text font sizes to video resolution */
  previewWidth?: number;
  onProgress?: (progress: number) => void;
}

export interface ExportResult {
  uri: string;
  duration: number;
  size: number;
  width: number;
  height: number;
}

// --- Editor Config ---

export interface FeatureConfig {
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

export interface ThemeConfig {
  backgroundColor?: string;
  accentColor?: string;
  textColor?: string;
  toolbarColor?: string;
  iconColor?: string;
}

export interface EditorConfig {
  features?: FeatureConfig;
  export?: Omit<ExportConfig, 'onProgress'>;
  theme?: ThemeConfig;
}

// --- Editor Mode ---

export type EditorMode =
  | 'edit'
  | 'audio'
  | 'text'
  | 'filters'
  | 'effects'
  | 'stickers';

// --- Editor State ---

export interface EditorState {
  // Source
  sourceUri: string;
  sourceDuration: number;
  sourceWidth: number;
  sourceHeight: number;

  // Segments
  segments: VideoSegment[];

  // Playback
  currentTime: number;
  isPlaying: boolean;

  // Overlays
  textOverlays: TextOverlay[];
  stickerOverlays: StickerOverlay[];

  // Audio
  audioTracks: AudioTrack[];
  originalVolume: number;

  // Effects
  effects: Effect[];

  // Crop
  crop: CropRegion | null;

  // UI
  activeMode: EditorMode;
  selectedSegmentId: string | null;
  selectedOverlayId: string | null;

  // Export
  isExporting: boolean;
  exportProgress: number;

  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
}

// --- Utility ---

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
