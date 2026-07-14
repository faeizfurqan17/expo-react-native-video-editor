import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  PixelRatio,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { makeImageFromView, ImageFormat } from '@shopify/react-native-skia';
import { useVideoEditor } from '../hooks/use-video-editor';
import { VideoPreview } from './Preview/video-preview';
import { TextEntryOverlay, type TextDraft } from './Text/text-entry-overlay';
import { GiphyPicker } from './Stickers/giphy-picker';
import { MusicSheet } from './Audio/music-sheet';
import { FilterCarousel, nextFilter } from './Filters/filter-carousel';
import { FFmpegEngine } from '../core/ffmpeg-engine';
import { fitRect } from '../utils/layout';
import type { EditorConfig, ExportResult, SourceType, StickerOverlay } from '../core/types';
import { IMAGE_SOURCE_DURATION_SECONDS } from '../core/types';

const STICKER_MAX_DIM = 140;

interface VideoEditorProps {
  source: string;
  /**
   * Whether `source` is a video clip or a still image. Defaults to 'video'.
   * Image sources get a fixed IMAGE_SOURCE_DURATION_SECONDS export/preview
   * duration instead of a probed clip length — there's no "video decoding"
   * for a still image, so playback is just one static frame for that span.
   */
  sourceType?: SourceType;
  onExportComplete: (result: ExportResult) => void;
  onExportProgress?: (progress: number) => void;
  onCancel?: () => void;
  config?: EditorConfig;
  /**
   * Whether this screen is currently focused/visible. Defaults to true.
   *
   * Navigators (React Navigation, expo-router) commonly keep a pushed screen
   * mounted in the background rather than unmounting it — so after export
   * completes and the app navigates to a result/preview screen, this editor
   * (and its live video decoder) would otherwise keep running off-screen,
   * fighting the new screen's own player for decode resources. Wire this to
   * your router's focus state (e.g. `useIsFocused()` from
   * `@react-navigation/native`, which expo-router is built on) so the editor
   * fully stops when it's not the active screen. The library itself takes no
   * dependency on any specific navigation solution.
   */
  isActive?: boolean;
}

/**
 * Instagram Stories-style single-clip editor: fullscreen looping preview,
 * swipe filters, draggable text/stickers, one music track, mute toggle.
 */
export function VideoEditor({
  source,
  sourceType = 'video',
  onExportComplete,
  onExportProgress,
  onCancel,
  config,
  isActive = true,
}: VideoEditorProps) {
  const editor = useVideoEditor();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [initState, setInitState] = useState<'loading' | 'ready' | 'error'>('loading');
  /** null = closed; 'new' = creating; otherwise the overlay id being edited. */
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  /** Bumped to make VideoPreview seek playback back to 0 — see handlePickMusic
   * and the music sheet's onTrimChange (adding music / moving its trim
   * window should both replay the story from the top). */
  const [restartToken, setRestartToken] = useState(0);
  /** Live text overlay views, snapshotted to PNGs at export (no drawtext in FFmpeg build). */
  const textViewsRef = useRef(new Map<string, unknown>());

  const registerTextView = useCallback((id: string, view: unknown | null) => {
    if (view) {
      textViewsRef.current.set(id, view);
    } else {
      textViewsRef.current.delete(id);
    }
  }, []);

  const features = {
    text: config?.features?.text ?? true,
    filters: config?.features?.filters ?? true,
    stickers: config?.features?.stickers ?? true,
    music: config?.features?.music ?? true,
  };

  // Single source of truth for "is the story actually visible and playing" —
  // used to drive BOTH the video preview and the music player, so opening any
  // bottom sheet (text editor, stickers, music) pauses both together instead
  // of the video pausing via its own isPlaying prop while music (driven by a
  // separate isPlaying check) kept going.
  const effectivelyPlaying =
    editor.isPlaying && editingTextId === null && editor.activeSheet === 'none';

  // --- Init: probe the source; retry UI on failure (wrong dims corrupt export math) ---
  const init = useCallback(async () => {
    setInitState('loading');
    try {
      // ffprobe reads width/height correctly for still images too (a single
      // image decodes as a one-frame "video" stream), but its duration is
      // meaningless for a still (0 or absent) — images get a fixed duration
      // instead of whatever ffprobe happens to report.
      const info = await FFmpegEngine.getMediaInfo(source);
      const duration = sourceType === 'image' ? IMAGE_SOURCE_DURATION_SECONDS : info.duration;
      // A still image has no audio concept — treat as "has audio" so the
      // export command builder's original-audio branch isn't the reason
      // this codepath differs for images (it's already gated on isImage
      // separately for other reasons).
      const hasAudio = sourceType === 'image' ? true : info.hasAudioStream;
      editor.initialize(source, duration, info.width, info.height, sourceType, hasAudio);
      setInitState('ready');
    } catch {
      setInitState('error');
    }
    // editor is a new object each render; store-backed actions are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, sourceType]);

  useEffect(() => {
    init();
  }, [init]);

  // --- Music preview playback, cut to the video's duration (matches export) ---
  // Export never loops music for the video case — it's mixed once via amix
  // and clamped to the video's length (see ffmpeg-command-builder's
  // audioGraph + the output -shortest flag). The video itself loops
  // (VideoPreview sets p.loop = true), so if the music player also looped on
  // its OWN length it would drift out of sync with the video's loop cycle
  // and could run past — or restart mid-video — never matching export. So
  // instead: no native loop on the music player; a timer restarts it from
  // music.startTime exactly every sourceDuration (the video's loop period),
  // and it's explicitly paused at that boundary so it never plays past a
  // single video cycle, mirroring the -shortest/amix duration=first clamp.
  const musicPlayer = useAudioPlayer(editor.musicTrack ? { uri: editor.musicTrack.uri } : null);
  const musicRestartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Volume/mute apply live without touching the restart cycle below — this
  // must NOT be combined with the timing effect, since editor.musicTrack is
  // a fresh object on every updateMusic() call (e.g. every volume-slider
  // tick); keying the seek/restart cycle on that identity would restart
  // playback from 0 on every drag frame.
  useEffect(() => {
    if (!editor.musicTrack) return;
    musicPlayer.volume = editor.musicTrack.muted ? 0 : Math.min(editor.musicTrack.volume, 2);
  }, [musicPlayer, editor.musicTrack?.muted, editor.musicTrack?.volume]);

  const hasMusic = !!editor.musicTrack;
  const musicTrackId = editor.musicTrack?.id;
  const musicStartTime = editor.musicTrack?.startTime ?? 0;
  const musicTrimStart = editor.musicTrack?.trimStart ?? 0;
  useEffect(() => {
    if (musicRestartTimer.current) {
      clearTimeout(musicRestartTimer.current);
      musicRestartTimer.current = null;
    }
    if (!hasMusic) return;
    musicPlayer.loop = false;

    // effectivelyPlaying already folds in: opening the text editor or any
    // bottom sheet (stickers/music) — so tapping the music button pauses the
    // track immediately, same moment the video visually pauses, instead of
    // music continuing to play underneath the sheet.
    if (!effectivelyPlaying || editor.isExporting || !isActive) {
      musicPlayer.pause();
      return;
    }

    const startDelayMs = Math.max(0, musicStartTime * 1000);
    const cyclePeriodMs = Math.max(200, editor.sourceDuration * 1000);

    const restart = () => {
      // Seeks into the SAME trim point export starts from (see -ss in
      // buildExportCommand), not the file's beginning.
      musicPlayer.seekTo(musicTrimStart);
      musicPlayer.play();
      // Stop the music at the video's loop boundary even if the track is
      // still going, then schedule the next cycle's restart.
      const stopAt = Math.max(0, cyclePeriodMs - startDelayMs);
      musicRestartTimer.current = setTimeout(() => {
        musicPlayer.pause();
        musicRestartTimer.current = setTimeout(restart, startDelayMs);
      }, stopAt);
    };

    // Mirror the export's adelay: wait startDelayMs before the first play too.
    musicRestartTimer.current = setTimeout(restart, startDelayMs);

    return () => {
      if (musicRestartTimer.current) {
        clearTimeout(musicRestartTimer.current);
        musicRestartTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    musicPlayer,
    hasMusic,
    musicTrackId,
    musicStartTime,
    musicTrimStart,
    editor.sourceDuration,
    effectivelyPlaying,
    editor.isExporting,
    isActive,
  ]);

  // --- Actions ---

  const handleSwipeFilter = useCallback(
    (direction: 1 | -1) => {
      if (!features.filters) return;
      editor.setFilter(nextFilter(editor.filter.preset, direction));
    },
    [editor, features.filters]
  );

  const handleTextDone = useCallback(
    (draft: TextDraft) => {
      if (editingTextId && editingTextId !== 'new') {
        editor.updateText(editingTextId, draft);
      } else {
        editor.addText({
          ...draft,
          position: { x: 0.5, y: 0.4 },
          rotation: 0,
          scale: 1,
          startTime: 0,
          endTime: editor.sourceDuration,
        });
      }
      setEditingTextId(null);
    },
    [editor, editingTextId]
  );

  const handlePickMusic = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      let duration = 0;
      try {
        duration = (await FFmpegEngine.getMediaInfo(asset.uri)).duration;
      } catch {
        // amix duration=first bounds the mix anyway.
      }
      // Images loop short tracks to fill the fixed export duration (see
      // ffmpeg-command-builder's -stream_loop handling), so a track under
      // 15s isn't technically broken — this is a product choice to require
      // a full-length track for the image flow specifically.
      if (
        editor.sourceType === 'image' &&
        duration > 0 &&
        duration < IMAGE_SOURCE_DURATION_SECONDS
      ) {
        Alert.alert(
          'Track too short',
          `Please choose a song at least ${IMAGE_SOURCE_DURATION_SECONDS} seconds long.`
        );
        return;
      }
      editor.setMusic({
        uri: asset.uri,
        title: asset.name,
        startTime: 0,
        duration,
        trimStart: 0,
        volume: 1,
      });
      // Replay the story from the top so the video and the newly-added
      // track start in sync, matching what a fresh export would sound like.
      setRestartToken(Date.now());
    } catch {
      // Picker unavailable/dismissed — leave state untouched.
    }
  }, [editor]);

  /**
   * Snapshot each rendered text overlay to a transparent PNG. The shipped
   * FFmpeg builds have no freetype (no drawtext) — and this way exported text
   * is pixel-identical to the preview (fonts, emoji, background, alignment).
   */
  const rasterizeTextOverlays = useCallback(async (): Promise<StickerOverlay[]> => {
    const out: StickerOverlay[] = [];
    const pixelRatio = PixelRatio.get();
    for (const t of editor.textOverlays) {
      if (t.text.trim().length === 0) continue;
      const view = textViewsRef.current.get(t.id);
      if (!view) continue;
      try {
        const image = await makeImageFromView({ current: view } as never);
        if (!image) continue;
        const base64 = image.encodeToBase64(ImageFormat.PNG, 100);
        const uri = `${FileSystem.cacheDirectory}text_overlay_${t.id}.png`;
        await FileSystem.writeAsStringAsync(uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        out.push({
          id: `rt_${t.id}`,
          uri,
          animated: false,
          position: t.position,
          // Snapshot is at native pixels; overlay sizing expects logical px.
          size: { width: image.width() / pixelRatio, height: image.height() / pixelRatio },
          rotation: 0,
          scale: t.scale,
          // 0/0 = no enable window — text spans the whole story.
          startTime: 0,
          endTime: 0,
        });
      } catch {
        // Skip this overlay rather than failing the whole export.
      }
    }
    return out;
  }, [editor.textOverlays]);

  const handleExport = useCallback(async () => {
    setExportError(null);
    try {
      // Overlay sizes scale from the on-screen 9:16 canvas to the 1080×1920
      // export canvas — must match VideoPreview's canvasRect exactly.
      const canvasRect = fitRect(9, 16, screenWidth, screenHeight);
      const rasterizedTexts = await rasterizeTextOverlays();
      const result = await editor.exportVideo({
        quality: config?.export?.quality ?? 'high',
        format: config?.export?.format ?? 'mp4',
        previewWidth: canvasRect.width,
        rasterizedTexts,
        onProgress: onExportProgress,
      });
      onExportComplete(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      console.error('Export failed:', message);
      setExportError(message.slice(0, 300));
    }
  }, [editor, config, screenWidth, screenHeight, rasterizeTextOverlays, onExportComplete, onExportProgress]);

  // --- Render ---

  if (initState !== 'ready') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        {initState === 'loading' ? (
          <>
            <ActivityIndicator size="large" color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>
              {sourceType === 'image' ? 'Importing image...' : 'Importing video...'}
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>
              {sourceType === 'image' ? "Couldn't read this image" : "Couldn't read this video"}
            </Text>
            <Pressable
              onPress={init}
              style={{ paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#007AFF', borderRadius: 20 }}
            >
              <Text style={{ color: '#FFF', fontWeight: '600' }}>Retry</Text>
            </Pressable>
            <Pressable onPress={onCancel} hitSlop={8}>
              <Text style={{ color: '#999', fontSize: 13 }}>Cancel</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  const editingOverlay =
    editingTextId && editingTextId !== 'new'
      ? editor.textOverlays.find((t) => t.id === editingTextId) ?? null
      : null;

  const headerButton = {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Unmounted (not just paused) during export and whenever this screen isn't
          active: the native VideoView player, Skia's Canvas/GL context, and the
          filtered-preview video decoder all stay fully allocated while merely
          paused. During export, FFmpeg already decodes the same source video
          (plus any GIF stickers) and encodes in-process on iOS — running that
          alongside a second/third live decode pipeline is enough concurrent
          memory pressure to trigger an OS jetsam kill on some devices. And once
          export completes, apps typically navigate to a result screen — if the
          navigator keeps this screen mounted in the background (the default for
          most stack navigators), the live decoder would otherwise keep polling
          frames indefinitely off-screen, fighting the new screen's own player
          for decode resources (isActive covers that case). The opaque export
          overlay below already covers the full screen during export, so
          there's nothing visible to lose by tearing the preview down here. */}
      {!editor.isExporting && isActive && (
        <VideoPreview
          sourceUri={editor.sourceUri}
          sourceType={editor.sourceType}
          sourceWidth={editor.sourceWidth}
          sourceHeight={editor.sourceHeight}
          width={screenWidth}
          height={screenHeight}
          isPlaying={effectivelyPlaying}
          muted={editor.originalMuted}
          filterPreset={features.filters ? editor.filter.preset : 'normal'}
          textOverlays={editor.textOverlays}
          stickerOverlays={editor.stickerOverlays}
          selectedOverlayId={editor.selectedOverlayId}
          onOverlaySelect={editor.setSelectedOverlay}
          onTextEdit={(id) => setEditingTextId(id)}
          onTextChange={editor.updateText}
          onStickerChange={editor.updateSticker}
          onRemoveOverlay={(id, kind) =>
            kind === 'text' ? editor.removeText(id) : editor.removeSticker(id)
          }
          onSwipeFilter={handleSwipeFilter}
          registerTextView={registerTextView}
          restartToken={restartToken}
        />
      )}

      {features.filters && (
        <FilterCarousel preset={editor.filter.preset} />
      )}

      {/* Header chrome */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 12,
          right: 12,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Pressable onPress={onCancel} style={headerButton} hitSlop={6}>
          <Ionicons name="close" size={22} color="#FFF" />
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {features.text && (
            <Pressable onPress={() => setEditingTextId('new')} style={headerButton} hitSlop={6}>
              <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: -0.5 }}>Aa</Text>
            </Pressable>
          )}
          {features.stickers && (
            <Pressable onPress={() => editor.setActiveSheet('stickers')} style={headerButton} hitSlop={6}>
              <Ionicons name="happy-outline" size={20} color="#FFF" />
            </Pressable>
          )}
          {features.music && (
            <Pressable onPress={() => editor.setActiveSheet('music')} style={headerButton} hitSlop={6}>
              <Ionicons
                name="musical-notes"
                size={19}
                color={editor.musicTrack ? '#0A84FF' : '#FFF'}
              />
            </Pressable>
          )}
          <Pressable onPress={editor.toggleMute} style={headerButton} hitSlop={6}>
            <Ionicons
              // Music present → button reflects/controls the music's mute
              // (the original video is already silently muted underneath).
              // No music → button reflects/controls the video's own mute.
              name={
                (editor.musicTrack ? editor.musicTrack.muted : editor.originalMuted)
                  ? 'volume-mute'
                  : 'volume-high'
              }
              size={20}
              color="#FFF"
            />
          </Pressable>
        </View>
      </View>

      {/* Done / export */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + 16,
          right: 16,
        }}
      >
        <Pressable
          onPress={handleExport}
          disabled={editor.isExporting}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 22,
            paddingVertical: 12,
            backgroundColor: '#FFF',
            borderRadius: 24,
            opacity: editor.isExporting ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#000', fontSize: 15, fontWeight: '700' }}>Done</Text>
          <Ionicons name="arrow-forward" size={16} color="#000" />
        </Pressable>
      </View>

      {/* Export error toast */}
      {exportError && !editor.isExporting && (
        <Pressable
          onPress={() => setExportError(null)}
          style={{
            position: 'absolute',
            bottom: insets.bottom + 76,
            left: 16,
            right: 16,
            backgroundColor: 'rgba(255,59,48,0.92)',
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }} numberOfLines={4}>
            Export failed — tap to dismiss{'\n'}
            {exportError}
          </Text>
        </Pressable>
      )}

      {/* Export progress overlay */}
      {editor.isExporting && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            Exporting… {Math.round(editor.exportProgress * 100)}%
          </Text>
          <View style={{ width: '60%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <View
              style={{
                width: `${Math.round(editor.exportProgress * 100)}%`,
                height: 4,
                borderRadius: 2,
                backgroundColor: '#FFF',
              }}
            />
          </View>
          <Pressable onPress={editor.cancelExport} hitSlop={8}>
            <Text style={{ color: '#999', fontSize: 13 }}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {/* Sheets */}
      {editingTextId !== null && (
        <TextEntryOverlay
          initial={editingOverlay}
          onDone={handleTextDone}
          onCancel={() => {
            // Empty text on an existing overlay deletes it (IG behavior).
            if (editingTextId && editingTextId !== 'new') {
              editor.removeText(editingTextId);
            }
            setEditingTextId(null);
          }}
        />
      )}

      {editor.activeSheet === 'stickers' && (
        <GiphyPicker
          apiKey={config?.giphyApiKey}
          onPick={(sticker) => {
            const aspect = sticker.height > 0 ? sticker.width / sticker.height : 1;
            const w = aspect >= 1 ? STICKER_MAX_DIM : STICKER_MAX_DIM * aspect;
            const h = aspect >= 1 ? STICKER_MAX_DIM / aspect : STICKER_MAX_DIM;
            editor.addSticker({
              uri: sticker.uri,
              animated: sticker.animated,
              position: { x: 0.5, y: 0.4 },
              size: { width: Math.round(w), height: Math.round(h) },
              rotation: 0,
              scale: 1,
              startTime: 0,
              endTime: editor.sourceDuration,
            });
            editor.setActiveSheet('none');
          }}
          onClose={() => editor.setActiveSheet('none')}
        />
      )}

      {editor.activeSheet === 'music' && (
        <MusicSheet
          track={editor.musicTrack}
          videoDuration={editor.sourceDuration}
          onPickFile={handlePickMusic}
          onTrimChange={(t) => {
            editor.updateMusic({ trimStart: t });
            // Replay from the top so the video and the newly-trimmed music
            // window start in sync, same as when a track is first added.
            setRestartToken(Date.now());
          }}
          onRemove={editor.removeMusic}
          onClose={() => editor.setActiveSheet('none')}
        />
      )}
    </GestureHandlerRootView>
  );
}
