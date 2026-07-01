import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Canvas,
  Group,
  Image,
  useImage,
  RoundedRect,
  Fill,
  ImageShader,
  ColorMatrix,
  useVideo,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { FilterPreset, StickerOverlay, TextOverlay, VideoSegment } from '../../core/types';
import { applyIntensity, getFilterByPreset } from '../../filters/presets';
import { clampSourceTimeToSegments, resolvePlaybackTick } from '../../utils/playback-sync';

interface VideoPreviewProps {
  sourceUri: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceDuration: number;
  segments: VideoSegment[];
  currentTime: number;
  isPlaying: boolean;
  isScrubbing?: boolean;
  textOverlays: TextOverlay[];
  stickerOverlays: StickerOverlay[];
  filterPreset: FilterPreset;
  filterIntensity: number;
  selectedOverlayId: string | null;
  onTimeUpdate: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onOverlaySelect?: (id: string | null) => void;
  onOverlayMove?: (id: string, position: { x: number; y: number }) => void;
}

export function VideoPreview({
  sourceUri,
  sourceWidth,
  sourceHeight,
  sourceDuration,
  segments,
  currentTime,
  isPlaying,
  isScrubbing = false,
  textOverlays,
  stickerOverlays,
  filterPreset,
  filterIntensity,
  selectedOverlayId,
  onTimeUpdate,
  onPlayingChange,
  onOverlaySelect,
  onOverlayMove,
}: VideoPreviewProps) {
  const { width: screenWidth } = useWindowDimensions();
  const previewWidth = screenWidth;
  const aspectRatio = sourceWidth && sourceHeight ? sourceWidth / sourceHeight : 9 / 16;
  const previewHeight = previewWidth / aspectRatio;
  const lastSeekedTime = useRef<number>(-1);
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const sourceDurationRef = useRef(sourceDuration);
  sourceDurationRef.current = sourceDuration;

  const showSkiaColorGrade =
    filterPreset !== 'normal' && filterIntensity > 0.001;
  const showSkiaColorGradeRef = useRef(showSkiaColorGrade);
  showSkiaColorGradeRef.current = showSkiaColorGrade;
  // Track previous value so we only seek when first enabling Skia color grading.
  const prevShowSkiaColorGradeRef = useRef(showSkiaColorGrade);

  const skiaPaused = useSharedValue(!(isPlaying && !isScrubbing));
  const skiaSeek = useSharedValue<number | null>(null);
  const skiaVolume = useSharedValue(0);

  const { currentFrame: skiaVideoFrame, currentTime: skiaClockMs } = useVideo(
    sourceUri,
    {
      paused: skiaPaused,
      seek: skiaSeek,
      looping: false,
      volume: skiaVolume,
    }
  );

  const onSkiaPlaybackMs = useCallback(
    (ms: number) => {
      const t = ms / 1000;
      const tick = resolvePlaybackTick(segmentsRef.current, t, sourceDurationRef.current);

      if (tick.stop) {
        skiaPaused.value = true;
        onPlayingChangeRef.current(false);
        const endT = tick.seekTo ?? tick.time;
        skiaSeek.value = Math.round(endT * 1000);
        lastSeekedTime.current = endT;
        onTimeUpdateRef.current(endT);
        return;
      }

      if (tick.seekTo != null && Math.abs(tick.seekTo - t) > 0.001) {
        skiaSeek.value = Math.round(tick.seekTo * 1000);
        lastSeekedTime.current = tick.seekTo;
        onTimeUpdateRef.current(tick.seekTo);
        return;
      }

      lastSeekedTime.current = tick.time;
      onTimeUpdateRef.current(tick.time);
    },
    [skiaPaused, skiaSeek]
  );

  useAnimatedReaction(
    () => (showSkiaColorGrade ? skiaClockMs.value : -1),
    (ms, prev) => {
      'worklet';
      if (ms < 0) return;
      if (typeof prev === 'number' && prev >= 0 && Math.abs(ms - prev) < 32) return;
      runOnJS(onSkiaPlaybackMs)(ms);
    },
    [showSkiaColorGrade, onSkiaPlaybackMs]
  );

  const segmentLayoutKey = useMemo(
    () =>
      segments.map((s) => `${s.id}:${s.startTime.toFixed(4)}:${s.endTime.toFixed(4)}`).join('|'),
    [segments]
  );

  const player = useVideoPlayer(sourceUri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0;
  });

  // Native end of the underlying file (edited timeline may end earlier).
  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => {
      if (showSkiaColorGradeRef.current) return;
      onPlayingChange(false);
      const t = player.currentTime;
      const clamped = clampSourceTimeToSegments(segments, t, sourceDuration);
      if (Math.abs(clamped - t) > 0.001) {
        player.currentTime = clamped;
      }
      onTimeUpdate(clamped);
      lastSeekedTime.current = clamped;
    });
    return () => subscription.remove();
  }, [player, segments, sourceDuration, onPlayingChange, onTimeUpdate]);

  // While playing: drive store time from the player, skipping gaps between segments
  // and stopping at the end of the last kept clip (full file can extend past that).
  useEffect(() => {
    if (!isPlaying || isScrubbing || showSkiaColorGrade) return;

    const subscription = player.addListener('timeUpdate', (e) => {
      const t = e.currentTime;
      const tick = resolvePlaybackTick(segments, t, sourceDuration);

      if (tick.stop) {
        player.pause();
        if (tick.seekTo != null) {
          player.currentTime = tick.seekTo;
        } else {
          player.currentTime = tick.time;
        }
        lastSeekedTime.current = tick.seekTo ?? tick.time;
        onTimeUpdate(tick.seekTo ?? tick.time);
        onPlayingChange(false);
        return;
      }

      if (tick.seekTo != null && Math.abs(tick.seekTo - t) > 0.001) {
        player.currentTime = tick.seekTo;
        lastSeekedTime.current = tick.seekTo;
        onTimeUpdate(tick.seekTo);
        return;
      }

      lastSeekedTime.current = tick.time;
      onTimeUpdate(tick.time);
    });

    return () => subscription.remove();
  }, [isPlaying, isScrubbing, showSkiaColorGrade, player, segments, sourceDuration, onTimeUpdate, onPlayingChange]);

  // After edits (split/delete/trim), keep the playhead on a valid frame.
  useEffect(() => {
    const t = currentTimeRef.current;
    const clamped = clampSourceTimeToSegments(segments, t, sourceDuration);
    if (Math.abs(clamped - t) > 0.001) {
      onTimeUpdate(clamped);
      if (showSkiaColorGradeRef.current) {
        skiaSeek.value = Math.round(clamped * 1000);
      }
    }
  }, [segmentLayoutKey, sourceDuration, segments, onTimeUpdate, skiaSeek]);

  // Skia audio + clock when color grade is on; expo-video otherwise (single active decoder path).
  useEffect(() => {
    skiaVolume.value = showSkiaColorGrade ? 1 : 0;
  }, [showSkiaColorGrade, skiaVolume]);

  // Sync playback state (pause during scrubbing so seeks are not fought by timeUpdate)
  useEffect(() => {
    const shouldPlay = isPlaying && !isScrubbing;
    if (showSkiaColorGrade) {
      player.timeUpdateEventInterval = 0;
      player.pause();
      player.muted = true;
      skiaPaused.value = !shouldPlay;
      return;
    }
    player.muted = false;
    skiaPaused.value = true;
    if (shouldPlay) {
      player.timeUpdateEventInterval = 1 / 30;
      player.play();
    } else {
      player.timeUpdateEventInterval = 0;
      player.pause();
    }
  }, [isPlaying, isScrubbing, player, showSkiaColorGrade, skiaPaused]);

  // When enabling a filter, align Skia decode to the current edit time.
  // Only seek on the false→true transition; changing between presets while Skia
  // is already playing doesn't need a seek (the decoder is in the right place).
  useEffect(() => {
    const wasShowing = prevShowSkiaColorGradeRef.current;
    prevShowSkiaColorGradeRef.current = showSkiaColorGrade;
    if (!wasShowing && showSkiaColorGrade) {
      skiaSeek.value = Math.round(currentTimeRef.current * 1000);
    }
  }, [showSkiaColorGrade, skiaSeek]);

  // Seek when currentTime changes (works while scrubbing, paused, or playing)
  useEffect(() => {
    if (Math.abs(currentTime - lastSeekedTime.current) > 0.03) {
      lastSeekedTime.current = currentTime;
      player.currentTime = currentTime;
      if (showSkiaColorGradeRef.current) {
        skiaSeek.value = Math.round(currentTime * 1000);
      }
    }
  }, [currentTime, player, segments, skiaSeek]);

  // Filter overlays by currentTime visibility; keep selected even if empty text
  const visibleTextOverlays = textOverlays.filter(
    (o) =>
      currentTime >= o.startTime &&
      currentTime <= o.endTime &&
      (o.text.trim().length > 0 || o.id === selectedOverlayId)
  );
  const visibleStickerOverlays = stickerOverlays.filter(
    (o) => currentTime >= o.startTime && currentTime <= o.endTime
  );

  const filterColorMatrix = useMemo(() => {
    if (filterPreset === 'normal' || filterIntensity <= 0.001) return null;
    const def = getFilterByPreset(filterPreset);
    return applyIntensity(def.colorMatrix, filterIntensity);
  }, [filterPreset, filterIntensity]);

  return (
    <View style={{ width: previewWidth, height: previewHeight, backgroundColor: '#000' }}>
      {/* Always mounted to avoid the black-flash on mount/unmount when crossing
          segment filter boundaries. Hidden via opacity when Skia is decoding instead;
          the player is paused+muted in that mode so there is no audio or CPU issue. */}
      <VideoView
        player={player}
        style={{
          width: previewWidth,
          height: previewHeight,
          opacity: showSkiaColorGrade ? 0 : 1,
        }}
        contentFit="contain"
        nativeControls={false}
      />

      {/* Skia decodes frames + color matrix (BackdropFilter cannot see native VideoView). */}
      {showSkiaColorGrade && filterColorMatrix && (
        <Canvas
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: previewWidth,
            height: previewHeight,
            pointerEvents: 'none',
          }}
        >
          {skiaVideoFrame ? (
            <Fill>
              <ImageShader
                image={skiaVideoFrame}
                x={0}
                y={0}
                width={previewWidth}
                height={previewHeight}
                fit="contain"
              />
              <ColorMatrix matrix={filterColorMatrix} />
            </Fill>
          ) : (
            <Fill color="#000" />
          )}
        </Canvas>
      )}

      {/* Skia canvas for non-draggable rendering (stickers) */}
      {visibleStickerOverlays.length > 0 && (
        <Canvas
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: previewWidth,
            height: previewHeight,
            pointerEvents: 'none',
          }}
        >
          {visibleStickerOverlays.map((overlay) => (
            <StickerOverlayRenderer
              key={overlay.id}
              overlay={overlay}
              previewWidth={previewWidth}
              previewHeight={previewHeight}
              isSelected={overlay.id === selectedOverlayId}
            />
          ))}
        </Canvas>
      )}

      {/* Draggable text overlays (using gesture handler, rendered above canvas) */}
      {visibleTextOverlays.map((overlay) => (
        <DraggableTextOverlay
          key={overlay.id}
          overlay={overlay}
          previewWidth={previewWidth}
          previewHeight={previewHeight}
          isSelected={overlay.id === selectedOverlayId}
          onSelect={() => onOverlaySelect?.(overlay.id)}
          onMove={(pos) => onOverlayMove?.(overlay.id, pos)}
        />
      ))}
    </View>
  );
}

// --- Draggable Text Overlay ---

function DraggableTextOverlay({
  overlay,
  previewWidth,
  previewHeight,
  isSelected,
  onSelect,
  onMove,
}: {
  overlay: TextOverlay;
  previewWidth: number;
  previewHeight: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (position: { x: number; y: number }) => void;
}) {
  const TEXT_BOX_WIDTH = previewWidth * 0.85;
  const scaledFontSize = overlay.fontSize * overlay.scale;

  // (cx, cy) = center of the text box in pixels.
  const cx = useSharedValue(overlay.position.x * previewWidth);
  const cy = useSharedValue(overlay.position.y * previewHeight);
  const startCx = useSharedValue(0);
  const startCy = useSharedValue(0);

  // Half-height of the rendered text box (measured via onLayout, estimated initially).
  const halfH = useSharedValue(scaledFontSize * 0.75);

  // Snap guide pixel positions; -1 means hidden.
  const snapXGuide = useSharedValue(-1);
  const snapYGuide = useSharedValue(-1);

  // Guards the position-sync useEffect so it doesn't reset shared values mid-drag.
  const isDragging = useRef(false);

  // Always-current reference to onMove so useCallback deps stay stable.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // Sync position from store only when not dragging (prevents reset-loop jitter).
  useEffect(() => {
    if (isDragging.current) return;
    cx.value = overlay.position.x * previewWidth;
    cy.value = overlay.position.y * previewHeight;
  }, [overlay.position.x, overlay.position.y, previewWidth, previewHeight]);

  const SNAP_THR = 10;

  const handleMoveEnd = useCallback(
    (x: number, y: number) => {
      isDragging.current = false;
      onMoveRef.current({
        x: Math.max(0, Math.min(x / previewWidth, 1)),
        y: Math.max(0, Math.min(y / previewHeight, 1)),
      });
    },
    [previewWidth, previewHeight]
  );

  const setDragging = useCallback(() => {
    isDragging.current = true;
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startCx.value = cx.value;
      startCy.value = cy.value;
      runOnJS(setDragging)();
    })
    .onUpdate((e) => {
      const rawX = startCx.value + e.translationX;
      const rawY = startCy.value + e.translationY;

      // Snap to left / center-x / right
      const ptsX = [0, previewWidth * 0.5, previewWidth];
      let fx = rawX;
      let gx = -1;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(rawX - ptsX[i]) < SNAP_THR) {
          fx = ptsX[i];
          gx = ptsX[i];
          break;
        }
      }

      // Snap to top / center-y / bottom
      const ptsY = [0, previewHeight * 0.5, previewHeight];
      let fy = rawY;
      let gy = -1;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(rawY - ptsY[i]) < SNAP_THR) {
          fy = ptsY[i];
          gy = ptsY[i];
          break;
        }
      }

      cx.value = Math.max(0, Math.min(fx, previewWidth));
      cy.value = Math.max(0, Math.min(fy, previewHeight));
      snapXGuide.value = gx;
      snapYGuide.value = gy;
    })
    .onEnd(() => {
      snapXGuide.value = -1;
      snapYGuide.value = -1;
      runOnJS(handleMoveEnd)(cx.value, cy.value);
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(onSelect)();
    });

  const composed = Gesture.Simultaneous(panGesture, tapGesture);

  // Text box anchored at its visual center (cx, cy).
  const boxStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cx.value - TEXT_BOX_WIDTH / 2 },
      { translateY: cy.value - halfH.value },
      { rotate: `${overlay.rotation}deg` },
    ],
  }));

  // Vertical snap guide (constant X line) — transform-based, no layout reflow.
  const snapVStyle = useAnimatedStyle(() => ({
    opacity: snapXGuide.value >= 0 ? 1 : 0,
    transform: [{ translateX: snapXGuide.value >= 0 ? snapXGuide.value : 0 }],
  }));

  // Horizontal snap guide (constant Y line).
  const snapHStyle = useAnimatedStyle(() => ({
    opacity: snapYGuide.value >= 0 ? 1 : 0,
    transform: [{ translateY: snapYGuide.value >= 0 ? snapYGuide.value : 0 }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, width: previewWidth, height: previewHeight }}
    >
      {/* Snap guide — vertical line at snap-x */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, backgroundColor: '#FFD60A' },
          snapVStyle,
        ]}
      />
      {/* Snap guide — horizontal line at snap-y */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: '#FFD60A' },
          snapHStyle,
        ]}
      />

      <GestureDetector gesture={composed}>
        <Animated.View
          onLayout={(e) => {
            halfH.value = e.nativeEvent.layout.height / 2;
          }}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: TEXT_BOX_WIDTH,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: overlay.backgroundColor ?? 'transparent',
              borderWidth: isSelected ? 1.5 : 0,
              borderColor: 'rgba(255,255,255,0.85)',
              borderStyle: 'dashed',
            },
            boxStyle,
          ]}
        >
          <Text
            style={{
              fontSize: scaledFontSize,
              color: overlay.color,
              fontFamily: overlay.font === 'System' ? undefined : overlay.font,
              textAlign: overlay.alignment,
            }}
          >
            {overlay.text || ' '}
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// --- Sticker Overlay Renderer (Skia) ---

function StickerOverlayRenderer({
  overlay,
  previewWidth,
  previewHeight,
  isSelected,
}: {
  overlay: StickerOverlay;
  previewWidth: number;
  previewHeight: number;
  isSelected: boolean;
}) {
  const image = useImage(overlay.uri);
  const x = overlay.position.x * previewWidth;
  const y = overlay.position.y * previewHeight;
  const w = overlay.size.width * overlay.scale;
  const h = overlay.size.height * overlay.scale;

  if (!image) return null;

  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { rotate: (overlay.rotation * Math.PI) / 180 }]}>
      <Image
        image={image}
        x={0}
        y={0}
        width={w}
        height={h}
        fit="contain"
      />
      {isSelected && (
        <RoundedRect
          x={-3}
          y={-3}
          width={w + 6}
          height={h + 6}
          r={4}
          color="transparent"
          style="stroke"
          strokeWidth={2}
        />
      )}
    </Group>
  );
}
