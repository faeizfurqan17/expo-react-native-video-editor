import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoEditor } from '../hooks/use-video-editor';
import { VideoPreview } from './Preview/video-preview';
import { Timeline } from './Timeline/timeline';
import { TextTimeline } from './Timeline/text-timeline';
import { Toolbar } from './Toolbar/toolbar';
import { EditTools } from './Toolbar/edit-tools';
import { AudioTools } from './Toolbar/audio-tools';
import { TextTools } from './Toolbar/text-tools';
import { FilterTools } from './Toolbar/filter-tools';
import { EffectTools } from './Toolbar/effect-tools';
import { StickerTools } from './Toolbar/sticker-tools';
import { SpeedControl } from './Controls/speed-control';
import { CropControl } from './Controls/crop-control';
import { FFmpegEngine } from '../core/ffmpeg-engine';
import type { EditorConfig, ExportResult } from '../core/types';
import { clampSourceTimeToSegments } from '../utils/playback-sync';

interface VideoEditorProps {
  source: string;
  onExportComplete: (result: ExportResult) => void;
  onExportProgress?: (progress: number) => void;
  onCancel?: () => void;
  config?: EditorConfig;
}

export function VideoEditor({
  source,
  onExportComplete,
  onExportProgress,
  onCancel,
  config,
}: VideoEditorProps) {
  const editor = useVideoEditor();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [isInitialized, setIsInitialized] = useState(false);
  const [showSpeedControl, setShowSpeedControl] = useState(false);
  const [showCropControl, setShowCropControl] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Initialize editor with video info
  useEffect(() => {
    async function init() {
      try {
        const info = await FFmpegEngine.getMediaInfo(source);
        editor.initialize(source, info.duration, info.width, info.height);
        setIsInitialized(true);
      } catch {
        // Fallback: initialize with defaults
        editor.initialize(source, 30, 1920, 1080);
        setIsInitialized(true);
      }
    }
    init();
  }, [source]);

  // Export handler
  const handleExport = useCallback(async () => {
    try {
      const result = await editor.exportVideo({
        quality: config?.export?.quality ?? 'high',
        format: config?.export?.format ?? 'mp4',
        previewWidth: screenWidth,
        onProgress: onExportProgress,
      });
      onExportComplete(result);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [editor, config, onExportComplete, onExportProgress]);

  // Get selected text overlay
  const selectedTextOverlay = editor.textOverlays.find(
    (t) => t.id === editor.selectedOverlayId
  ) ?? null;

  // Get selected segment
  const selectedSegment = editor.segments.find(
    (s) => s.id === editor.selectedSegmentId
  );
  const segmentAwareTime = clampSourceTimeToSegments(
    editor.segments,
    editor.currentTime,
    editor.sourceDuration
  );
  const currentSegment =
    editor.segments.find((s, i) =>
      segmentAwareTime >= s.startTime &&
      (i === editor.segments.length - 1
        ? segmentAwareTime <= s.endTime
        : segmentAwareTime < s.endTime)
    ) ?? editor.segments[editor.segments.length - 1] ?? null;
  const activeFilterSegment = editor.isPlaying
    ? currentSegment
    : (selectedSegment ?? currentSegment);
  const pendingSegmentIdRef = useRef<string | null>(null);
  const pendingSegmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor.isPlaying) {
      pendingSegmentIdRef.current = null;
      if (pendingSegmentTimerRef.current) {
        clearTimeout(pendingSegmentTimerRef.current);
        pendingSegmentTimerRef.current = null;
      }
      return;
    }

    const nextId = currentSegment?.id ?? null;
    if (__DEV__) {
      console.log('[segment:auto-follow] tick', {
        currentTime: editor.currentTime,
        nextId,
        selectedSegmentId: editor.selectedSegmentId,
      });
    }
    if (editor.selectedSegmentId === nextId) {
      pendingSegmentIdRef.current = null;
      if (pendingSegmentTimerRef.current) {
        clearTimeout(pendingSegmentTimerRef.current);
        pendingSegmentTimerRef.current = null;
      }
      return;
    }

    // While playing, require a brief stable id before switching to avoid jitter at boundaries.
    if (pendingSegmentIdRef.current === nextId) return;
    pendingSegmentIdRef.current = nextId;
    if (pendingSegmentTimerRef.current) {
      clearTimeout(pendingSegmentTimerRef.current);
    }
    pendingSegmentTimerRef.current = setTimeout(() => {
      if (pendingSegmentIdRef.current === nextId) {
        if (__DEV__) {
          console.log('[segment:auto-follow] commit', {
            currentTime: editor.currentTime,
            from: editor.selectedSegmentId,
            to: nextId,
          });
        }
        editor.store.getState().setSelectedSegment(nextId);
      }
    }, 120);
  }, [currentSegment?.id, editor.selectedSegmentId, editor.isPlaying, editor.store]);

  useEffect(() => {
    return () => {
      if (pendingSegmentTimerRef.current) {
        clearTimeout(pendingSegmentTimerRef.current);
      }
    };
  }, []);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ color: '#999', marginTop: 12, fontSize: 14 }}>Loading video...</Text>
      </View>
    );
  }

  // Render tool content based on active mode
  const renderToolContent = () => {
    if (showSpeedControl && editor.activeMode === 'edit') {
      return (
        <SpeedControl
          currentSpeed={selectedSegment?.speed ?? 1}
          onSpeedChange={(speed) => {
            if (editor.selectedSegmentId) {
              editor.setSpeed(editor.selectedSegmentId, speed);
            }
            setShowSpeedControl(false);
          }}
        />
      );
    }

    if (showCropControl && editor.activeMode === 'edit') {
      return (
        <CropControl
          currentCrop={editor.crop}
          videoWidth={editor.sourceWidth}
          videoHeight={editor.sourceHeight}
          onCropChange={(crop) => {
            editor.setCrop(crop);
            setShowCropControl(false);
          }}
        />
      );
    }

    switch (editor.activeMode) {
      case 'edit':
        return (
          <EditTools
            onSplit={() => editor.split(editor.currentTime)}
            onDelete={() => {
              if (editor.selectedSegmentId) {
                editor.deleteSegment(editor.selectedSegmentId);
              }
            }}
            onRotate={() => editor.rotate()}
            onSpeedPress={() => setShowSpeedControl(true)}
            onVolumePress={() => {}}
            onCropPress={() => setShowCropControl(true)}
            hasSelectedSegment={!!editor.selectedSegmentId}
            canDelete={editor.segments.length > 1}
          />
        );

      case 'audio':
        return (
          <AudioTools
            audioTracks={editor.audioTracks}
            originalVolume={editor.originalVolume}
            onAddAudio={() => {
              // TODO: Open audio picker
            }}
            onStartVoiceover={() => {
              // TODO: Start voiceover recording with expo-audio
            }}
            onRemoveAudio={(id) => editor.removeAudio(id)}
            onVolumeChange={(v) => editor.setVolume(v)}
            onTrackVolumeChange={(id, v) =>
              editor.store.getState().updateAudio(id, { volume: v })
            }
          />
        );

      case 'text':
        return (
          <TextTools
            selectedOverlay={selectedTextOverlay}
            currentTime={editor.currentTime}
            duration={editor.sourceDuration}
            onAddText={(overlay) => editor.addText(overlay)}
            onUpdateText={(id, updates) => editor.updateText(id, updates)}
            onRemoveText={(id) => editor.removeText(id)}
            onDone={() => editor.store.getState().setSelectedOverlay(null)}
          />
        );

      case 'filters':
        return (
          <FilterTools
            activeFilter={activeFilterSegment?.filter.preset ?? 'normal'}
            intensity={activeFilterSegment?.filter.intensity ?? 1}
            segmentLabel={activeFilterSegment ? `Segment ${editor.segments.findIndex((s) => s.id === activeFilterSegment.id) + 1}` : undefined}
            onFilterSelect={(preset) => editor.setFilter(preset)}
            onIntensityChange={(intensity) => editor.setFilterIntensity(intensity)}
            onApplyAll={() => editor.applyFilterToAllSegments()}
          />
        );

      case 'effects':
        return (
          <EffectTools
            activeEffects={editor.effects}
            currentTime={editor.currentTime}
            onAddEffect={(effect) => editor.addEffect(effect)}
            onRemoveEffect={(id) => editor.removeEffect(id)}
          />
        );

      case 'stickers':
        return (
          <StickerTools
            stickerOverlays={editor.stickerOverlays}
            currentTime={editor.currentTime}
            duration={editor.sourceDuration}
            onAddSticker={(uri) =>
              editor.addSticker({
                uri,
                position: { x: 0.3, y: 0.3 },
                size: { width: 100, height: 100 },
                rotation: 0,
                scale: 1,
                startTime: editor.currentTime,
                endTime: Math.min(editor.currentTime + 5, editor.sourceDuration),
              })
            }
            onRemoveSticker={(id) => editor.removeSticker(id)}
            onPickSticker={() => {
              // TODO: Open image picker for stickers
            }}
          />
        );
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 8,
          paddingTop: insets.top + 8,
        }}
      >
        <Pressable onPress={onCancel}>
          <Text style={{ color: '#FFF', fontSize: 16 }}>Cancel</Text>
        </Pressable>

        {/* Undo / Redo */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Pressable
            onPress={editor.undo}
            disabled={!editor.canUndo}
            hitSlop={8}
          >
            <Ionicons
              name="arrow-undo"
              size={22}
              color={editor.canUndo ? '#FFF' : '#555'}
            />
          </Pressable>
          <Pressable
            onPress={editor.redo}
            disabled={!editor.canRedo}
            hitSlop={8}
          >
            <Ionicons
              name="arrow-redo"
              size={22}
              color={editor.canRedo ? '#FFF' : '#555'}
            />
          </Pressable>
        </View>

        {editor.isExporting ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={{ color: '#FFF', fontSize: 14, fontVariant: ['tabular-nums'] }}>
              {Math.round(editor.exportProgress * 100)}%
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={handleExport}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 8,
              backgroundColor: '#007AFF',
              borderRadius: 20,
              borderCurve: 'continuous',
            }}
          >
            <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>Export</Text>
          </Pressable>
        )}
      </View>

      {/* Video Preview */}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <VideoPreview
          sourceUri={editor.sourceUri}
          sourceWidth={editor.sourceWidth}
          sourceHeight={editor.sourceHeight}
          sourceDuration={editor.sourceDuration}
          segments={editor.segments}
          currentTime={editor.currentTime}
          isPlaying={editor.isPlaying}
          isScrubbing={isScrubbing}
          textOverlays={editor.textOverlays}
          stickerOverlays={editor.stickerOverlays}
          filterPreset={activeFilterSegment?.filter.preset ?? 'normal'}
          filterIntensity={activeFilterSegment?.filter.intensity ?? 1}
          selectedOverlayId={editor.selectedOverlayId}
          onTimeUpdate={(time) => editor.store.getState().setCurrentTime(time)}
          onPlayingChange={(playing) => editor.store.getState().setIsPlaying(playing)}
          onOverlaySelect={(id) => {
            editor.store.getState().setSelectedOverlay(id);
            // Always stay in text mode so Add Text button remains visible.
            editor.store.getState().setActiveMode('text');
          }}
          onOverlayMove={(id, pos) => editor.updateText(id, { position: pos })}
        />

        {/* Play/Pause button */}
        <Pressable
          onPress={() => editor.store.getState().setIsPlaying(!editor.isPlaying)}
          style={{
            position: 'absolute',
            alignSelf: 'center',
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Ionicons
            name={editor.isPlaying ? 'pause' : 'play'}
            size={20}
            color="#FFF"
          />
        </Pressable>
      </View>

      {/* Timeline */}
      <Timeline
        sourceUri={editor.sourceUri}
        duration={editor.sourceDuration}
        segments={editor.segments}
        currentTime={editor.currentTime}
        isPlaying={editor.isPlaying}
        selectedSegmentId={editor.selectedSegmentId}
        onTimeChange={(time) => editor.store.getState().setCurrentTime(time)}
        onSegmentSelect={(id) => editor.store.getState().setSelectedSegment(id)}
        onTrimChange={(segmentId, start, end) =>
          editor.store.getState().updateSegmentTrim(segmentId, start, end)
        }
        onScrubbingChange={setIsScrubbing}
        onPlayingChange={(playing) => editor.store.getState().setIsPlaying(playing)}
      />

      {/* Text overlay timeline — always visible when text overlays exist (CapCut-style) */}
      <TextTimeline
        textOverlays={editor.textOverlays}
        duration={editor.sourceDuration}
        currentTime={editor.currentTime}
        selectedOverlayId={editor.selectedOverlayId}
        onSelectOverlay={(id) => {
          editor.store.getState().setSelectedOverlay(id);
          if (id) {
            editor.store.getState().setActiveMode('text');
          }
        }}
        onUpdateOverlay={(id, updates) => editor.updateText(id, updates)}
      />

      {/* Toolbar */}
      <View style={{ paddingBottom: insets.bottom }}>
        <Toolbar
          activeMode={editor.activeMode}
          onModeChange={(mode) => {
            editor.store.getState().setActiveMode(mode);
            setShowSpeedControl(false);
            setShowCropControl(false);
          }}
          features={config?.features}
        >
          {renderToolContent()}
        </Toolbar>
      </View>
    </GestureHandlerRootView>
  );
}
