import { useRef, useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import { createEditorStore, type EditorStore } from '../store/editor-store';
import { ExportPipeline } from '../core/export-pipeline';
import type {
  TextOverlay,
  StickerOverlay,
  AudioTrack,
  FilterPreset,
  Effect,
  CropRegion,
  ExportConfig,
  ExportResult,
} from '../core/types';

export interface UseVideoEditorOptions {
  source?: string;
}

export function useVideoEditor(options?: UseVideoEditorOptions) {
  const storeRef = useRef(createEditorStore());
  const store = storeRef.current;

  const state = useStore(store);
  const pipelineRef = useRef<ExportPipeline | null>(null);

  // --- Initialization ---

  const initialize = useCallback(
    (uri: string, duration: number, width: number, height: number) => {
      store.getState().initialize(uri, duration, width, height);
    },
    [store]
  );

  // --- Segment Actions ---

  const split = useCallback(
    (atTime: number) => store.getState().split(atTime),
    [store]
  );

  const deleteSegment = useCallback(
    (segmentId: string) => store.getState().deleteSegment(segmentId),
    [store]
  );

  const setSpeed = useCallback(
    (segmentId: string, speed: number) =>
      store.getState().setSegmentSpeed(segmentId, speed),
    [store]
  );

  const setVolume = useCallback(
    (volume: number) => store.getState().setOriginalVolume(volume),
    [store]
  );

  const setCrop = useCallback(
    (crop: CropRegion | null) => store.getState().setCrop(crop),
    [store]
  );

  const rotate = useCallback(
    () => store.getState().rotateVideo(),
    [store]
  );

  // --- Text Overlays ---

  const addText = useCallback(
    (overlay: Omit<TextOverlay, 'id'>) => store.getState().addText(overlay),
    [store]
  );

  const updateText = useCallback(
    (id: string, updates: Partial<TextOverlay>) =>
      store.getState().updateText(id, updates),
    [store]
  );

  const removeText = useCallback(
    (id: string) => store.getState().removeText(id),
    [store]
  );

  // --- Sticker Overlays ---

  const addSticker = useCallback(
    (overlay: Omit<StickerOverlay, 'id'>) =>
      store.getState().addSticker(overlay),
    [store]
  );

  const updateSticker = useCallback(
    (id: string, updates: Partial<StickerOverlay>) =>
      store.getState().updateSticker(id, updates),
    [store]
  );

  const removeSticker = useCallback(
    (id: string) => store.getState().removeSticker(id),
    [store]
  );

  // --- Audio ---

  const addAudio = useCallback(
    (track: Omit<AudioTrack, 'id'>) => store.getState().addAudio(track),
    [store]
  );

  const removeAudio = useCallback(
    (id: string) => store.getState().removeAudio(id),
    [store]
  );

  // --- Filters ---

  const setFilter = useCallback(
    (preset: FilterPreset) => store.getState().setFilter(preset),
    [store]
  );

  const setFilterIntensity = useCallback(
    (intensity: number) => store.getState().setFilterIntensity(intensity),
    [store]
  );

  const clearFilter = useCallback(
    () => store.getState().clearFilter(),
    [store]
  );

  const applyFilterToAllSegments = useCallback(
    () => store.getState().applyFilterToAllSegments(),
    [store]
  );

  // --- Effects ---

  const addEffect = useCallback(
    (effect: Omit<Effect, 'id'>) => store.getState().addEffect(effect),
    [store]
  );

  const removeEffect = useCallback(
    (id: string) => store.getState().removeEffect(id),
    [store]
  );

  // --- Undo/Redo ---

  const undo = useCallback(() => store.getState().undo(), [store]);
  const redo = useCallback(() => store.getState().redo(), [store]);

  // --- Export ---

  const exportVideo = useCallback(
    async (config: ExportConfig): Promise<ExportResult> => {
      const currentState = store.getState();
      currentState.setExporting(true);

      const pipeline = new ExportPipeline(currentState, {
        ...config,
        onProgress: (progress) => {
          currentState.setExportProgress(progress);
          config.onProgress?.(progress);
        },
      });
      pipelineRef.current = pipeline;

      try {
        const result = await pipeline.export();
        return result;
      } finally {
        currentState.setExporting(false);
        pipelineRef.current = null;
      }
    },
    [store]
  );

  const cancelExport = useCallback(async () => {
    if (pipelineRef.current) {
      await pipelineRef.current.cancel();
      store.getState().setExporting(false);
    }
  }, [store]);

  return useMemo(
    () => ({
      // State
      ...state,
      store,

      // Actions
      initialize,
      split,
      deleteSegment,
      setSpeed,
      setVolume,
      setCrop,
      rotate,
      addText,
      updateText,
      removeText,
      addSticker,
      updateSticker,
      removeSticker,
      addAudio,
      removeAudio,
      setFilter,
      setFilterIntensity,
      applyFilterToAllSegments,
      clearFilter,
      addEffect,
      removeEffect,
      undo,
      redo,
      exportVideo,
      cancelExport,
    }),
    [
      state,
      store,
      initialize,
      split,
      deleteSegment,
      setSpeed,
      setVolume,
      setCrop,
      rotate,
      addText,
      updateText,
      removeText,
      addSticker,
      updateSticker,
      removeSticker,
      addAudio,
      removeAudio,
      setFilter,
      setFilterIntensity,
      applyFilterToAllSegments,
      clearFilter,
      addEffect,
      removeEffect,
      undo,
      redo,
      exportVideo,
      cancelExport,
    ]
  );
}
