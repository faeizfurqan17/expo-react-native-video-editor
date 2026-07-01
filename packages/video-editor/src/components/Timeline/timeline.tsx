import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  clamp,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system';
import { generateThumbnails } from '../../utils/thumbnails';
import type { VideoSegment } from '../../core/types';
import { formatClipLength, formatTime, segmentSourceDuration } from '../../utils/time';

const THUMBNAIL_WIDTH = 48;
const TRACK_HEIGHT = 72;
const HANDLE_WIDTH = 16;
const PLAYHEAD_WIDTH = 3;
const TIMELINE_PADDING = 4;
const SEGMENT_LABEL_ROW = 18;
const SEGMENT_GAP = 2;

interface TimelineProps {
  sourceUri: string;
  duration: number;
  segments: VideoSegment[];
  currentTime: number;
  isPlaying: boolean;
  selectedSegmentId: string | null;
  onTimeChange: (time: number) => void;
  onSegmentSelect: (id: string | null) => void;
  onTrimChange: (segmentId: string, startTime: number, endTime: number) => void;
  onScrubbingChange?: (scrubbing: boolean) => void;
  onPlayingChange?: (playing: boolean) => void;
}

export function Timeline({
  sourceUri,
  duration,
  segments,
  currentTime,
  selectedSegmentId,
  onTimeChange,
  onSegmentSelect,
  onTrimChange,
  onScrubbingChange,
  onPlayingChange,
}: TimelineProps) {
  const { width: screenWidth } = useWindowDimensions();
  // Store thumbnails per segment keyed by "startTime-endTime"
  const [segmentThumbnails, setSegmentThumbnails] = useState<Record<string, string[]>>({});
  const thumbnailCacheRef = useRef<Record<string, string[]>>({});

  const trackWidth = screenWidth - TIMELINE_PADDING * 2;

  // Effective duration is the sum of all segment durations (accounts for splits/deletes)
  const effectiveDuration = useMemo(
    () => segments.reduce((sum, s) => sum + segmentSourceDuration(s), 0),
    [segments]
  );

  const pixelsPerSecond = effectiveDuration > 0 ? trackWidth / effectiveDuration : 1;

  // Map currentTime to a position within the segments
  // currentTime is in source-video time, we need to find where it falls in the segments
  const playheadPosition = useMemo(() => {
    let offsetPx = 0;
    for (const seg of segments) {
      const dur = segmentSourceDuration(seg);
      if (dur <= 0) continue;
      if (currentTime < seg.startTime) {
        return offsetPx;
      }
      if (currentTime <= seg.endTime) {
        return offsetPx + (currentTime - seg.startTime) * pixelsPerSecond;
      }
      offsetPx += dur * pixelsPerSecond;
    }
    return Math.min(offsetPx, trackWidth);
  }, [currentTime, segments, pixelsPerSecond, trackWidth]);

  // Generate thumbnails per segment — recalculates when segments change
  useEffect(() => {
    if (!sourceUri || duration <= 0) return;

    let cancelled = false;

    async function generateAllSegmentThumbnails() {
      const cache = thumbnailCacheRef.current;
      const newThumbnails: Record<string, string[]> = {};

      const pending = segments.map(async (seg) => {
        const segDuration = segmentSourceDuration(seg);
        const segWidth = segDuration * pixelsPerSecond;
        const count = Math.max(1, Math.ceil(segWidth / THUMBNAIL_WIDTH));
        // Include count so zoom changes (caused by split/delete/trim) regenerate thumbs
        const key = `${seg.startTime.toFixed(3)}-${seg.endTime.toFixed(3)}-${count}`;

        if (cache[key]) {
          return { key, thumbs: cache[key] };
        }

        const thumbs = await generateThumbnails(sourceUri, count, segDuration, seg.startTime);
        return { key, thumbs };
      });

      const generated = await Promise.all(pending);
      if (cancelled) return;

      for (const item of generated) {
        cache[item.key] = item.thumbs;
        newThumbnails[item.key] = item.thumbs;
      }

      if (!cancelled) {
        // Delete stale thumbnail files that are no longer referenced
        const staleKeys = Object.keys(cache).filter((k) => !(k in newThumbnails));
        for (const key of staleKeys) {
          const staleUris = cache[key];
          for (const uri of staleUris) {
            FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          }
        }

        thumbnailCacheRef.current = newThumbnails;
        setSegmentThumbnails(newThumbnails);
      }
    }

    generateAllSegmentThumbnails();

    return () => {
      cancelled = true;
    };
  }, [sourceUri, duration, segments, pixelsPerSecond]);

  // Playhead animation
  const playheadX = useSharedValue(0);

  useEffect(() => {
    playheadX.value = withTiming(playheadPosition, { duration: 50 });
  }, [playheadPosition, playheadX]);

  const playheadStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: clamp(playheadX.value, 0, trackWidth) }],
  }));

  // Handle scrub on JS thread — converts pixel to time and calls onTimeChange
  const handleScrub = (px: number) => {
    const clampedPx = Math.max(0, Math.min(px, trackWidth));
    let accPx = 0;
    for (const seg of segments) {
      const segDur = segmentSourceDuration(seg);
      if (segDur <= 0) continue;
      const segWidth = segDur * pixelsPerSecond;
      if (clampedPx <= accPx + segWidth) {
        const ratio = segWidth > 0 ? (clampedPx - accPx) / segWidth : 0;
        const t = seg.startTime + ratio * segDur;
        onTimeChange(Math.min(seg.endTime, Math.max(seg.startTime, t)));
        return;
      }
      accPx += segWidth;
    }
    const lastSeg = segments[segments.length - 1];
    if (lastSeg) onTimeChange(lastSeg.endTime);
  };

  const notifyScrubbing = (scrubbing: boolean) => {
    onScrubbingChange?.(scrubbing);
  };

  // Scrub gesture — works while playing; parent can pause the player during drag.
  // Only flip scrubbing=true once the pan actually activates (past minDistance),
  // so short taps never flip it (otherwise play/pause can get stuck).
  const scrubGesture = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      runOnJS(notifyScrubbing)(true);
    })
    .onUpdate((e) => {
      const px = Math.max(0, Math.min(e.x, trackWidth));
      playheadX.value = px;
      runOnJS(handleScrub)(px);
    })
    .onFinalize(() => {
      runOnJS(notifyScrubbing)(false);
    });

  const segmentIdAtPx = (px: number): string | null => {
    let accPx = 0;
    for (const seg of segments) {
      const segDur = segmentSourceDuration(seg);
      if (segDur <= 0) continue;
      const segWidth = segDur * pixelsPerSecond;
      if (px <= accPx + segWidth) return seg.id;
      accPx += segWidth + SEGMENT_GAP;
    }
    return segments[segments.length - 1]?.id ?? null;
  };

  const handleTap = (px: number) => {
    const clampedPx = Math.max(0, Math.min(px, trackWidth));
    const id = segmentIdAtPx(clampedPx);
    if (id) onSegmentSelect(id);
    handleScrub(clampedPx);
    onPlayingChange?.(true);
  };

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      runOnJS(handleTap)(e.x);
    });

  const composedGesture = Gesture.Race(scrubGesture, tapGesture);

  return (
    <View style={{ height: TRACK_HEIGHT + 40 + SEGMENT_LABEL_ROW, backgroundColor: '#1a1a1a' }}>
      {/* Time labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4 }}>
        <Animated.Text style={{ color: '#999', fontSize: 11, fontVariant: ['tabular-nums'] }}>
          {formatTime(currentTime)}
        </Animated.Text>
        <Animated.Text style={{ color: '#999', fontSize: 11, fontVariant: ['tabular-nums'] }}>
          {formatTime(effectiveDuration)}
        </Animated.Text>
      </View>

      {/* Timeline track */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={{ flex: 1, position: 'relative', paddingHorizontal: TIMELINE_PADDING }}>
            <View style={{ flexDirection: 'row', height: TRACK_HEIGHT }}>
              {/* Segments */}
              {segments.map((segment, index) => {
                const segmentDuration = segmentSourceDuration(segment);
                const segmentWidth = segmentDuration * pixelsPerSecond;
                const isSelected = segment.id === selectedSegmentId;

                // Get cached thumbnails for this segment's time range + zoom level
                const thumbCount = Math.max(1, Math.ceil(segmentWidth / THUMBNAIL_WIDTH));
                const segKey = `${segment.startTime.toFixed(3)}-${segment.endTime.toFixed(3)}-${thumbCount}`;
                const segThumbs = segmentThumbnails[segKey] ?? [];

                return (
                  <View
                    key={segment.id}
                    style={{
                      width: segmentWidth,
                      height: TRACK_HEIGHT,
                      marginRight: index < segments.length - 1 ? SEGMENT_GAP : 0,
                      position: 'relative',
                      overflow: 'visible',
                    }}
                    pointerEvents="box-none"
                  >
                    {/* Thumbnail strip (taps bubble to parent gesture) */}
                    <View
                      pointerEvents="none"
                      style={{
                        flexDirection: 'row',
                        height: TRACK_HEIGHT,
                        borderRadius: 8,
                        overflow: 'hidden',
                        borderWidth: isSelected ? 2 : 0,
                        borderColor: '#007AFF',
                        borderCurve: 'continuous',
                      }}
                    >
                      {segThumbs.length > 0
                        ? segThumbs.map((thumb: string, i: number) => (
                            <Image
                              key={i}
                              source={{ uri: thumb }}
                              style={{ width: THUMBNAIL_WIDTH, height: TRACK_HEIGHT }}
                              contentFit="cover"
                            />
                          ))
                        : (
                          <View
                            style={{
                              width: segmentWidth,
                              height: TRACK_HEIGHT,
                              backgroundColor: '#333',
                            }}
                          />
                        )}
                    </View>

                    {/* Trim handles */}
                    {isSelected && (
                      <>
                        <TrimHandle
                          side="left"
                          segmentId={segment.id}
                          segment={segment}
                          pixelsPerSecond={pixelsPerSecond}
                          sourceDuration={duration}
                          onTrimChange={onTrimChange}
                        />
                        <TrimHandle
                          side="right"
                          segmentId={segment.id}
                          segment={segment}
                          pixelsPerSecond={pixelsPerSecond}
                          sourceDuration={duration}
                          onTrimChange={onTrimChange}
                        />
                      </>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Per-segment duration (aligned under each split) */}
            <View style={{ flexDirection: 'row', marginTop: 2, height: SEGMENT_LABEL_ROW }}>
              {segments.map((segment, index) => {
                const segmentDuration = segmentSourceDuration(segment);
                const segmentWidth = segmentDuration * pixelsPerSecond;
                return (
                  <View
                    key={`dur-${segment.id}`}
                    style={{
                      width: segmentWidth,
                      marginRight: index < segments.length - 1 ? SEGMENT_GAP : 0,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.65}
                      style={{
                        fontSize: 10,
                        color: '#888',
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {segmentDuration > 0 ? formatClipLength(segmentDuration) : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Playhead */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  left: TIMELINE_PADDING,
                  width: PLAYHEAD_WIDTH,
                  height: TRACK_HEIGHT,
                  backgroundColor: '#FFF',
                  borderRadius: 1.5,
                  zIndex: 10,
                },
                playheadStyle,
              ]}
            />
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </View>
  );
}

// --- Trim Handle ---

function TrimHandle({
  side,
  segmentId,
  segment,
  pixelsPerSecond,
  sourceDuration,
  onTrimChange,
}: {
  side: 'left' | 'right';
  segmentId: string;
  segment: VideoSegment;
  pixelsPerSecond: number;
  sourceDuration: number;
  onTrimChange: (segmentId: string, startTime: number, endTime: number) => void;
}) {
  const offsetX = useSharedValue(0);

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      offsetX.value = e.translationX;
    })
    .onEnd((e) => {
      const deltaTime = e.translationX / pixelsPerSecond;
      let newStart = segment.startTime;
      let newEnd = segment.endTime;

      if (side === 'left') {
        newStart = Math.max(0, segment.startTime + deltaTime);
        newStart = Math.min(newStart, newEnd - 0.5);
      } else {
        newEnd = Math.min(segment.endTime + deltaTime, sourceDuration);
        newEnd = Math.max(newEnd, newStart + 0.5);
      }

      offsetX.value = 0;
      runOnJS(onTrimChange)(segmentId, newStart, newEnd);
    });

  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            width: HANDLE_WIDTH,
            height: TRACK_HEIGHT,
            backgroundColor: '#007AFF',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 5,
            ...(side === 'left'
              ? { left: -HANDLE_WIDTH / 2, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }
              : { right: -HANDLE_WIDTH / 2, borderTopRightRadius: 8, borderBottomRightRadius: 8 }),
          },
          handleStyle,
        ]}
      >
        <View
          style={{
            width: 3,
            height: 20,
            backgroundColor: '#FFF',
            borderRadius: 1.5,
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
}
