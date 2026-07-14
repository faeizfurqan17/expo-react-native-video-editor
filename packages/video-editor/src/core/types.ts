// ============================================
// Core Types — Instagram Stories-style editor
// One clip (≤60s) or one still image, text + stickers + filter + music.
// ============================================

export type SourceType = 'video' | 'image';

/** Fixed export/preview duration for an image source (no natural duration of its own). */
export const IMAGE_SOURCE_DURATION_SECONDS = 15;

// --- Overlays ---

export interface TextOverlay {
  id: string;
  text: string;
  font: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  position: { x: number; y: number }; // Normalized 0-1, anchored at center
  rotation: number;
  scale: number;
  alignment: 'left' | 'center' | 'right';
  /** Visibility window in seconds; defaults to the whole clip. */
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
  /** Animated GIF (Giphy) — looped via -stream_loop on export. */
  animated?: boolean;
}

export type Overlay = TextOverlay | StickerOverlay;

// --- Audio ---

export interface AudioTrack {
  id: string;
  uri: string;
  /** Display name (file name or Giphy/track title). */
  title?: string;
  /** Delay (seconds) before the track starts on the OUTPUT timeline —
   * i.e. how long into the video before the music kicks in. Not to be
   * confused with trimStart (below), which picks a point in the SOURCE file. */
  startTime: number;
  /** Full length (seconds) of the source audio file, as probed. */
  duration: number;
  /** Where in the source file playback begins (seconds) — the IG-style
   * "which 22 seconds of this song" trim window picked in MusicSheet.
   * Defaults to 0 (start of the file). */
  trimStart: number;
  volume: number;
  type: 'music';
  /** User-toggled mute on the music track itself (independent of the
   * original video's own mute state — see EditorState.originalMuted). */
  muted: boolean;
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
  /**
   * Text overlays rasterized to PNGs at export time (Skia view snapshots).
   * The shipped FFmpeg builds have no freetype/drawtext, so text is burned
   * in as image overlays — which also makes it pixel-identical to preview.
   */
  rasterizedTexts?: StickerOverlay[];
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
  text?: boolean;
  filters?: boolean;
  stickers?: boolean;
  music?: boolean;
}

export interface ThemeConfig {
  backgroundColor?: string;
  accentColor?: string;
  textColor?: string;
}

export interface EditorConfig {
  features?: FeatureConfig;
  export?: Omit<ExportConfig, 'onProgress'>;
  theme?: ThemeConfig;
  /** Giphy API key for the sticker picker; without it, stickers fall back to the photo library. */
  giphyApiKey?: string;
}

// --- UI sheets ---

export type EditorSheet = 'none' | 'text' | 'stickers' | 'music';

// --- Editor State ---

export interface EditorState {
  // Source
  sourceUri: string;
  sourceType: SourceType;
  /** Video: probed clip length. Image: fixed at IMAGE_SOURCE_DURATION_SECONDS. */
  sourceDuration: number;
  sourceWidth: number;
  sourceHeight: number;
  /** False for a video with no audio track (silent recordings) — export
   * must skip any `[0:a]`-referencing filter graph for these. Always true
   * for an image source (no audio concept applies). */
  sourceHasAudio: boolean;

  // Playback
  currentTime: number;
  isPlaying: boolean;

  // Edits
  filter: FilterState;
  textOverlays: TextOverlay[];
  stickerOverlays: StickerOverlay[];
  musicTrack: AudioTrack | null;
  /** Whether the original video's own audio is silent. Auto-set true the
   * moment music is added and restored to its pre-music value when music is
   * removed — see editor-store's setMusic/removeMusic. */
  originalMuted: boolean;
  /**
   * originalMuted's value from just before a music track was added, so
   * removeMusic can restore it exactly (rather than always unmuting, which
   * would incorrectly un-mute a video the user had deliberately muted
   * BEFORE adding music). Null when no music track is active.
   */
  originalMutedBeforeMusic: boolean | null;

  // UI
  selectedOverlayId: string | null;
  activeSheet: EditorSheet;

  // Export
  isExporting: boolean;
  exportProgress: number;
}

// --- Utility ---

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
