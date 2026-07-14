import { createStore } from 'zustand/vanilla';
import type {
  EditorState,
  EditorSheet,
  TextOverlay,
  StickerOverlay,
  AudioTrack,
  FilterPreset,
  SourceType,
} from '../core/types';
import { generateId } from '../core/types';

// --- Actions ---

export interface EditorActions {
  // Initialization
  initialize(
    uri: string,
    duration: number,
    width: number,
    height: number,
    sourceType?: SourceType,
    hasAudio?: boolean
  ): void;
  reset(): void;

  // Playback (not persisted in edits)
  setCurrentTime(time: number): void;
  setIsPlaying(playing: boolean): void;

  // Filter (one global filter for the clip)
  setFilter(preset: FilterPreset): void;

  // Text overlays
  addText(overlay: Omit<TextOverlay, 'id'>): string;
  updateText(id: string, updates: Partial<TextOverlay>): void;
  removeText(id: string): void;

  // Sticker overlays
  addSticker(overlay: Omit<StickerOverlay, 'id'>): string;
  updateSticker(id: string, updates: Partial<StickerOverlay>): void;
  removeSticker(id: string): void;

  // Music (single track)
  setMusic(track: Omit<AudioTrack, 'id' | 'type' | 'muted'>): string;
  updateMusic(updates: Partial<AudioTrack>): void;
  removeMusic(): void;
  /**
   * Context-aware mute toggle for the single header mute button:
   * - No music track → toggles the original video's own audio.
   * - Music track present → toggles the MUSIC's mute, leaving the (already
   *   auto-muted) original video alone. See setMusic/removeMusic for how
   *   originalMuted is driven automatically around the music track's lifetime.
   */
  toggleMute(): void;

  // UI
  setSelectedOverlay(id: string | null): void;
  setActiveSheet(sheet: EditorSheet): void;

  // Export
  setExporting(isExporting: boolean): void;
  setExportProgress(progress: number): void;
}

// --- Initial State ---

const initialState: EditorState = {
  sourceUri: '',
  sourceType: 'video',
  sourceDuration: 0,
  sourceWidth: 0,
  sourceHeight: 0,
  sourceHasAudio: true,
  currentTime: 0,
  isPlaying: true,
  filter: { preset: 'normal' },
  textOverlays: [],
  stickerOverlays: [],
  musicTrack: null,
  originalMuted: false,
  originalMutedBeforeMusic: null,
  selectedOverlayId: null,
  activeSheet: 'none',
  isExporting: false,
  exportProgress: 0,
};

// --- Store ---

export type EditorStore = EditorState & EditorActions;

export function createEditorStore() {
  return createStore<EditorStore>((set, get) => ({
    ...initialState,

    // --- Initialization ---

    initialize(uri, duration, width, height, sourceType = 'video', hasAudio = true) {
      set({
        ...initialState,
        sourceUri: uri,
        sourceType,
        sourceDuration: duration,
        sourceWidth: width,
        sourceHeight: height,
        sourceHasAudio: hasAudio,
      });
    },

    reset() {
      set({ ...initialState });
    },

    // --- Playback ---

    setCurrentTime(time) {
      set({ currentTime: time });
    },

    setIsPlaying(playing) {
      set({ isPlaying: playing });
    },

    // --- Filter ---

    setFilter(preset) {
      set({ filter: { ...get().filter, preset } });
    },

    // --- Text Overlays ---

    addText(overlay) {
      const id = generateId();
      set({
        textOverlays: [...get().textOverlays, { ...overlay, id }],
        selectedOverlayId: id,
      });
      return id;
    },

    updateText(id, updates) {
      set({
        textOverlays: get().textOverlays.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
      });
    },

    removeText(id) {
      set({
        textOverlays: get().textOverlays.filter((t) => t.id !== id),
        selectedOverlayId:
          get().selectedOverlayId === id ? null : get().selectedOverlayId,
      });
    },

    // --- Sticker Overlays ---

    addSticker(overlay) {
      const id = generateId();
      set({
        stickerOverlays: [...get().stickerOverlays, { ...overlay, id }],
        selectedOverlayId: id,
      });
      return id;
    },

    updateSticker(id, updates) {
      set({
        stickerOverlays: get().stickerOverlays.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        ),
      });
    },

    removeSticker(id) {
      set({
        stickerOverlays: get().stickerOverlays.filter((s) => s.id !== id),
        selectedOverlayId:
          get().selectedOverlayId === id ? null : get().selectedOverlayId,
      });
    },

    // --- Music ---

    setMusic(track) {
      const id = generateId();
      const state = get();
      set({
        musicTrack: { ...track, id, type: 'music', muted: false },
        // Adding music always silences the original video's own audio.
        // Remember what it was so removeMusic can restore it exactly —
        // but only capture it the FIRST time (replacing one track with
        // another via setMusic must not overwrite the pre-music snapshot).
        originalMuted: true,
        originalMutedBeforeMusic:
          state.musicTrack === null ? state.originalMuted : state.originalMutedBeforeMusic,
      });
      return id;
    },

    updateMusic(updates) {
      const current = get().musicTrack;
      if (!current) return;
      set({ musicTrack: { ...current, ...updates } });
    },

    removeMusic() {
      const state = get();
      set({
        musicTrack: null,
        // Restore exactly what the original video's mute was before music
        // was added (respects a deliberate mute set beforehand), then clear
        // the snapshot so a future setMusic captures fresh.
        originalMuted: state.originalMutedBeforeMusic ?? false,
        originalMutedBeforeMusic: null,
      });
    },

    toggleMute() {
      const state = get();
      if (state.musicTrack) {
        // Music present: the original video is already auto-muted underneath
        // it, so the single mute button controls the music instead.
        set({ musicTrack: { ...state.musicTrack, muted: !state.musicTrack.muted } });
      } else {
        set({ originalMuted: !state.originalMuted });
      }
    },

    // --- UI ---

    setSelectedOverlay(id) {
      set({ selectedOverlayId: id });
    },

    setActiveSheet(sheet) {
      set({ activeSheet: sheet });
    },

    // --- Export ---

    setExporting(isExporting) {
      set({ isExporting, exportProgress: isExporting ? 0 : get().exportProgress });
    },

    setExportProgress(progress) {
      set({ exportProgress: progress });
    },
  }));
}
