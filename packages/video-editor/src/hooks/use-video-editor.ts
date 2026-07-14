import { useRef, useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import { createEditorStore } from '../store/editor-store';
import { ExportPipeline } from '../core/export-pipeline';
import type {
  TextOverlay,
  StickerOverlay,
  AudioTrack,
  FilterPreset,
  EditorSheet,
  ExportConfig,
  ExportResult,
  SourceType,
} from '../core/types';

export function useVideoEditor() {
  const storeRef = useRef(createEditorStore());
  const store = storeRef.current;

  const state = useStore(store);
  const pipelineRef = useRef<ExportPipeline | null>(null);

  const initialize = useCallback(
    (
      uri: string,
      duration: number,
      width: number,
      height: number,
      sourceType?: SourceType,
      hasAudio?: boolean
    ) => {
      store.getState().initialize(uri, duration, width, height, sourceType, hasAudio);
    },
    [store]
  );

  // --- Filter ---

  const setFilter = useCallback(
    (preset: FilterPreset) => store.getState().setFilter(preset),
    [store]
  );

  // --- Text ---

  const addText = useCallback(
    (overlay: Omit<TextOverlay, 'id'>) => store.getState().addText(overlay),
    [store]
  );

  const updateText = useCallback(
    (id: string, updates: Partial<TextOverlay>) => store.getState().updateText(id, updates),
    [store]
  );

  const removeText = useCallback(
    (id: string) => store.getState().removeText(id),
    [store]
  );

  // --- Stickers ---

  const addSticker = useCallback(
    (overlay: Omit<StickerOverlay, 'id'>) => store.getState().addSticker(overlay),
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

  // --- Music ---

  const setMusic = useCallback(
    (track: Omit<AudioTrack, 'id' | 'type' | 'muted'>) => store.getState().setMusic(track),
    [store]
  );

  const updateMusic = useCallback(
    (updates: Partial<AudioTrack>) => store.getState().updateMusic(updates),
    [store]
  );

  const removeMusic = useCallback(() => store.getState().removeMusic(), [store]);

  const toggleMute = useCallback(() => store.getState().toggleMute(), [store]);

  // --- UI ---

  const setSelectedOverlay = useCallback(
    (id: string | null) => store.getState().setSelectedOverlay(id),
    [store]
  );

  const setActiveSheet = useCallback(
    (sheet: EditorSheet) => store.getState().setActiveSheet(sheet),
    [store]
  );

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
        return await pipeline.export();
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
      ...state,
      store,
      initialize,
      setFilter,
      addText,
      updateText,
      removeText,
      addSticker,
      updateSticker,
      removeSticker,
      setMusic,
      updateMusic,
      removeMusic,
      toggleMute,
      setSelectedOverlay,
      setActiveSheet,
      exportVideo,
      cancelExport,
    }),
    [
      state,
      store,
      initialize,
      setFilter,
      addText,
      updateText,
      removeText,
      addSticker,
      updateSticker,
      removeSticker,
      setMusic,
      updateMusic,
      removeMusic,
      toggleMute,
      setSelectedOverlay,
      setActiveSheet,
      exportVideo,
      cancelExport,
    ]
  );
}
