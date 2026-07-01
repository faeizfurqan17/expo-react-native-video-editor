import { createStore } from 'zustand/vanilla';
import type {
  EditorState,
  EditorMode,
  VideoSegment,
  TextOverlay,
  StickerOverlay,
  AudioTrack,
  FilterPreset,
  Effect,
  CropRegion,
} from '../core/types';
import { generateId } from '../core/types';
import {
  clamp,
  MIN_EDIT_SEGMENT_SECONDS,
  quantizeTimeToMs,
  segmentSourceDuration,
} from '../utils/time';

// --- Undoable State ---
// Only these fields are tracked in undo/redo history.
// Playback, UI mode, selections, and export state are excluded.

interface UndoableState {
  segments: VideoSegment[];
  textOverlays: TextOverlay[];
  stickerOverlays: StickerOverlay[];
  audioTracks: AudioTrack[];
  originalVolume: number;
  effects: Effect[];
  crop: CropRegion | null;
}

const MAX_HISTORY = 50;

// --- Actions ---

export interface EditorActions {
  // Initialization
  initialize(uri: string, duration: number, width: number, height: number): void;
  reset(): void;

  // Playback
  setCurrentTime(time: number): void;
  setIsPlaying(playing: boolean): void;

  // Segments
  split(atTime: number): void;
  deleteSegment(segmentId: string): void;
  setSegmentSpeed(segmentId: string, speed: number): void;
  setSegmentVolume(segmentId: string, volume: number): void;
  updateSegmentTrim(segmentId: string, startTime: number, endTime: number): void;

  // Rotation
  rotateVideo(): void;

  // Crop
  setCrop(crop: CropRegion | null): void;

  // Text Overlays
  addText(overlay: Omit<TextOverlay, 'id'>): string;
  updateText(id: string, updates: Partial<TextOverlay>): void;
  removeText(id: string): void;

  // Sticker Overlays
  addSticker(overlay: Omit<StickerOverlay, 'id'>): string;
  updateSticker(id: string, updates: Partial<StickerOverlay>): void;
  removeSticker(id: string): void;

  // Audio
  addAudio(track: Omit<AudioTrack, 'id'>): string;
  updateAudio(id: string, updates: Partial<AudioTrack>): void;
  removeAudio(id: string): void;
  setOriginalVolume(volume: number): void;

  // Filters
  setFilter(preset: FilterPreset): void;
  setFilterIntensity(intensity: number): void;
  applyFilterToAllSegments(): void;
  clearFilter(): void;

  // Effects
  addEffect(effect: Omit<Effect, 'id'>): string;
  removeEffect(id: string): void;

  // UI
  setActiveMode(mode: EditorMode): void;
  setSelectedSegment(id: string | null): void;
  setSelectedOverlay(id: string | null): void;

  // Export
  setExporting(isExporting: boolean): void;
  setExportProgress(progress: number): void;

  // Undo/Redo
  undo(): void;
  redo(): void;
}

// --- Initial State ---

const initialState: EditorState = {
  sourceUri: '',
  sourceDuration: 0,
  sourceWidth: 0,
  sourceHeight: 0,
  segments: [],
  currentTime: 0,
  isPlaying: false,
  textOverlays: [],
  stickerOverlays: [],
  audioTracks: [],
  originalVolume: 1,
  effects: [],
  crop: null,
  activeMode: 'edit',
  selectedSegmentId: null,
  selectedOverlayId: null,
  isExporting: false,
  exportProgress: 0,
  canUndo: false,
  canRedo: false,
};

// --- Store ---

export type EditorStore = EditorState & EditorActions;

function snapshotUndoable(state: EditorState): UndoableState {
  return {
    segments: state.segments,
    textOverlays: state.textOverlays,
    stickerOverlays: state.stickerOverlays,
    audioTracks: state.audioTracks,
    originalVolume: state.originalVolume,
    effects: state.effects,
    crop: state.crop,
  };
}

export function createEditorStore() {
  // History stacks live outside Zustand state to avoid circular snapshots
  let undoStack: UndoableState[] = [];
  let redoStack: UndoableState[] = [];

  /** Push current undoable state onto undo stack before a mutation */
  function pushUndo(state: EditorState) {
    undoStack = [...undoStack.slice(-(MAX_HISTORY - 1)), snapshotUndoable(state)];
    redoStack = []; // Any new action clears the redo stack
  }

  return createStore<EditorStore>((set, get) => {
    /** Wrap set() to push undo history and update canUndo/canRedo flags */
    function setWithHistory(partial: Partial<EditorStore>) {
      pushUndo(get());
      set({ ...partial, canUndo: true, canRedo: false });
    }

    /**
     * For continuous actions (text typing, slider drags), only snapshot once
     * per interaction burst. If called again within DEBOUNCE_MS, the state
     * update applies without pushing another undo entry.
     */
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let hasPendingSnapshot = false;

    function setWithDebouncedHistory(partial: Partial<EditorStore>) {
      if (!hasPendingSnapshot) {
        // First call in this burst — push the current state to undo
        pushUndo(get());
        hasPendingSnapshot = true;
      }
      set({ ...partial, canUndo: true, canRedo: false });

      // Reset the debounce window
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        hasPendingSnapshot = false;
        debounceTimer = null;
      }, 500);
    }

    function getActiveSegmentIdForFilter(): string | null {
      const state = get();
      if (state.selectedSegmentId) return state.selectedSegmentId;
      const t = state.currentTime;
      const current = state.segments.find((s) => t >= s.startTime && t <= s.endTime);
      return current?.id ?? state.segments[0]?.id ?? null;
    }

    return {
    ...initialState,

    // --- Initialization ---

    initialize(uri, duration, width, height) {
      const segment: VideoSegment = {
        id: generateId(),
        sourceUri: uri,
        startTime: 0,
        endTime: duration,
        speed: 1,
        volume: 1,
        rotation: 0,
        filter: { preset: 'normal', intensity: 1 },
      };
      undoStack = [];
      redoStack = [];
      set({
        ...initialState,
        sourceUri: uri,
        sourceDuration: duration,
        sourceWidth: width,
        sourceHeight: height,
        segments: [segment],
        canUndo: false,
        canRedo: false,
      });
    },

    reset() {
      undoStack = [];
      redoStack = [];
      set({ ...initialState, canUndo: false, canRedo: false });
    },

    // --- Playback (not undoable) ---

    setCurrentTime(time) {
      set({ currentTime: time });
    },

    setIsPlaying(playing) {
      set({ isPlaying: playing });
    },

    // --- Segments ---

    split(atTime) {
      const { segments } = get();
      const t = quantizeTimeToMs(atTime);
      const segmentIndex = segments.findIndex((s) => t > s.startTime && t < s.endTime);
      if (segmentIndex === -1) return;

      const segment = segments[segmentIndex];
      const span = segmentSourceDuration(segment);
      if (span < MIN_EDIT_SEGMENT_SECONDS * 2) return;

      const splitTime = clamp(
        t,
        segment.startTime + MIN_EDIT_SEGMENT_SECONDS,
        segment.endTime - MIN_EDIT_SEGMENT_SECONDS
      );

      if (
        splitTime <= segment.startTime ||
        splitTime >= segment.endTime ||
        splitTime - segment.startTime < MIN_EDIT_SEGMENT_SECONDS ||
        segment.endTime - splitTime < MIN_EDIT_SEGMENT_SECONDS
      ) {
        return;
      }

      const left: VideoSegment = {
        ...segment,
        id: generateId(),
        endTime: splitTime,
      };
      const right: VideoSegment = {
        ...segment,
        id: generateId(),
        startTime: splitTime,
      };

      const newSegments = [...segments];
      newSegments.splice(segmentIndex, 1, left, right);
      setWithHistory({ segments: newSegments });
    },

    deleteSegment(segmentId) {
      const { segments, textOverlays, stickerOverlays } = get();
      if (segments.length <= 1) return;

      const deleted = segments.find((s) => s.id === segmentId);
      const remaining = segments.filter((s) => s.id !== segmentId);
      if (!deleted) return;

      // Deleted source-time interval. Overlays live in source coordinates, so
      // any overlay overlapping [ds, de] must shift to stay inside kept footage.
      const ds = deleted.startTime;
      const de = deleted.endTime;
      const lastEnd = Math.max(...remaining.map((s) => s.endTime));

      // Remap an overlay's [startTime, endTime] around the removed interval.
      const remap = <T extends { startTime: number; endTime: number }>(o: T): T => {
        const { startTime: s, endTime: e } = o;
        // Entirely before the cut, or it spans across it — leave as-is.
        if (e <= ds || (s < ds && e > de)) return o;

        // Entirely after the cut — keep in place (kept segments retain source times).
        if (s >= de) return o;

        // Tail runs into the cut from the left — clip the end back to the seam.
        if (s < ds && e > ds) {
          return { ...o, endTime: Math.max(s + MIN_EDIT_SEGMENT_SECONDS, ds) };
        }

        // Head starts inside the cut — push it to the seam, preserving duration.
        const dur = Math.max(MIN_EDIT_SEGMENT_SECONDS, e - s);
        const start = Math.min(de, Math.max(0, lastEnd - dur));
        return { ...o, startTime: start, endTime: Math.min(lastEnd, start + dur) };
      };

      setWithHistory({
        segments: remaining,
        textOverlays: textOverlays.map(remap),
        stickerOverlays: stickerOverlays.map(remap),
      });
    },

    setSegmentSpeed(segmentId, speed) {
      setWithHistory({
        segments: get().segments.map((s) =>
          s.id === segmentId ? { ...s, speed } : s
        ),
      });
    },

    setSegmentVolume(segmentId, volume) {
      setWithHistory({
        segments: get().segments.map((s) =>
          s.id === segmentId ? { ...s, volume } : s
        ),
      });
    },

    updateSegmentTrim(segmentId, startTime, endTime) {
      setWithDebouncedHistory({
        segments: get().segments.map((s) =>
          s.id === segmentId ? { ...s, startTime, endTime } : s
        ),
      });
    },

    // --- Rotation ---

    rotateVideo() {
      const { segments } = get();
      const rotations = [0, 90, 180, 270] as const;
      setWithHistory({
        segments: segments.map((s) => ({
          ...s,
          rotation: rotations[(rotations.indexOf(s.rotation) + 1) % 4],
        })),
      });
    },

    // --- Crop ---

    setCrop(crop) {
      setWithHistory({ crop });
    },

    // --- Text Overlays ---

    addText(overlay) {
      const id = generateId();
      setWithHistory({
        textOverlays: [...get().textOverlays, { ...overlay, id }],
        selectedOverlayId: id,
      });
      return id;
    },

    updateText(id, updates) {
      setWithDebouncedHistory({
        textOverlays: get().textOverlays.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
      });
    },

    removeText(id) {
      setWithHistory({
        textOverlays: get().textOverlays.filter((t) => t.id !== id),
        selectedOverlayId:
          get().selectedOverlayId === id ? null : get().selectedOverlayId,
      });
    },

    // --- Sticker Overlays ---

    addSticker(overlay) {
      const id = generateId();
      setWithHistory({
        stickerOverlays: [...get().stickerOverlays, { ...overlay, id }],
        selectedOverlayId: id,
      });
      return id;
    },

    updateSticker(id, updates) {
      setWithDebouncedHistory({
        stickerOverlays: get().stickerOverlays.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        ),
      });
    },

    removeSticker(id) {
      setWithHistory({
        stickerOverlays: get().stickerOverlays.filter((s) => s.id !== id),
        selectedOverlayId:
          get().selectedOverlayId === id ? null : get().selectedOverlayId,
      });
    },

    // --- Audio ---

    addAudio(track) {
      const id = generateId();
      setWithHistory({ audioTracks: [...get().audioTracks, { ...track, id }] });
      return id;
    },

    updateAudio(id, updates) {
      setWithDebouncedHistory({
        audioTracks: get().audioTracks.map((a) =>
          a.id === id ? { ...a, ...updates } : a
        ),
      });
    },

    removeAudio(id) {
      setWithHistory({ audioTracks: get().audioTracks.filter((a) => a.id !== id) });
    },

    setOriginalVolume(volume) {
      setWithDebouncedHistory({ originalVolume: volume });
    },

    // --- Filters ---

    setFilter(preset) {
      const activeId = getActiveSegmentIdForFilter();
      if (!activeId) return;
      if (__DEV__) {
        console.log('[filter:setPreset]', {
          activeSegmentId: activeId,
          preset,
          currentTime: get().currentTime,
          selectedSegmentId: get().selectedSegmentId,
        });
      }
      setWithHistory({
        segments: get().segments.map((s) =>
          s.id === activeId ? { ...s, filter: { ...s.filter, preset } } : s
        ),
      });
    },

    setFilterIntensity(intensity) {
      const activeId = getActiveSegmentIdForFilter();
      if (!activeId) return;
      if (__DEV__) {
        console.log('[filter:setIntensity]', {
          activeSegmentId: activeId,
          intensity,
          currentTime: get().currentTime,
          selectedSegmentId: get().selectedSegmentId,
        });
      }
      setWithDebouncedHistory({
        segments: get().segments.map((s) =>
          s.id === activeId ? { ...s, filter: { ...s.filter, intensity } } : s
        ),
      });
    },

    applyFilterToAllSegments() {
      const activeId = getActiveSegmentIdForFilter();
      if (!activeId) return;
      const sourceFilter = get().segments.find((s) => s.id === activeId)?.filter;
      if (!sourceFilter) return;
      if (__DEV__) {
        console.log('[filter:applyAll]', {
          sourceSegmentId: activeId,
          sourceFilter,
          segments: get().segments.map((s) => s.id),
        });
      }
      setWithHistory({
        segments: get().segments.map((s) => ({ ...s, filter: { ...sourceFilter } })),
      });
    },

    clearFilter() {
      const activeId = getActiveSegmentIdForFilter();
      if (!activeId) return;
      setWithHistory({
        segments: get().segments.map((s) =>
          s.id === activeId ? { ...s, filter: { preset: 'normal', intensity: 1 } } : s
        ),
      });
    },

    // --- Effects ---

    addEffect(effect) {
      const id = generateId();
      setWithHistory({ effects: [...get().effects, { ...effect, id }] });
      return id;
    },

    removeEffect(id) {
      setWithHistory({ effects: get().effects.filter((e) => e.id !== id) });
    },

    // --- UI (not undoable) ---

    setActiveMode(mode) {
      // Preserve selectedOverlayId when switching to text mode (e.g. tapping a text on preview)
      const preserveOverlay = mode === 'text' && get().selectedOverlayId != null;
      set({
        activeMode: mode,
        selectedOverlayId: preserveOverlay ? get().selectedOverlayId : null,
      });
    },

    setSelectedSegment(id) {
      set({ selectedSegmentId: id });
    },

    setSelectedOverlay(id) {
      set({ selectedOverlayId: id });
    },

    // --- Export (not undoable) ---

    setExporting(isExporting) {
      set({ isExporting, exportProgress: isExporting ? 0 : get().exportProgress });
    },

    setExportProgress(progress) {
      set({ exportProgress: progress });
    },

    // --- Undo/Redo ---

    undo() {
      if (undoStack.length === 0) return;
      const current = snapshotUndoable(get());
      redoStack = [...redoStack, current];
      const prev = undoStack[undoStack.length - 1];
      undoStack = undoStack.slice(0, -1);
      set({
        ...prev,
        canUndo: undoStack.length > 0,
        canRedo: true,
      });
    },

    redo() {
      if (redoStack.length === 0) return;
      const current = snapshotUndoable(get());
      undoStack = [...undoStack, current];
      const next = redoStack[redoStack.length - 1];
      redoStack = redoStack.slice(0, -1);
      set({
        ...next,
        canUndo: true,
        canRedo: redoStack.length > 0,
      });
    },
  };
  });
}
