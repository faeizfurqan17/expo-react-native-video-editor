import React, { memo, useEffect } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { TextOverlay } from '../../core/types';

const TRACK_HEIGHT = 44;
const HANDLE_WIDTH = 18;
const HANDLE_HIT_SLOP = 12;
const TIMELINE_PADDING = 4;

interface TextTimelineProps {
  textOverlays: TextOverlay[];
  duration: number;
  currentTime: number;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onUpdateOverlay: (id: string, updates: Partial<TextOverlay>) => void;
}

export function TextTimeline({
  textOverlays,
  duration,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlay,
}: TextTimelineProps) {
  const { width: screenWidth } = useWindowDimensions();
  const trackWidth = screenWidth - TIMELINE_PADDING * 2;
  const pixelsPerSecond = duration > 0 ? trackWidth / duration : 1;

  if (textOverlays.length === 0) return null;

  return (
    <View style={{ backgroundColor: '#1a1a1a', paddingHorizontal: TIMELINE_PADDING, paddingBottom: 4 }}>
      <Text style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginLeft: 4 }}>
        Text
      </Text>
      {textOverlays.map((overlay) => (
        <TextTrack
          key={overlay.id}
          overlay={overlay}
          duration={duration}
          pixelsPerSecond={pixelsPerSecond}
          trackWidth={trackWidth}
          isSelected={overlay.id === selectedOverlayId}
          onSelect={() => onSelectOverlay(overlay.id)}
          onUpdate={(updates) => onUpdateOverlay(overlay.id, updates)}
        />
      ))}
    </View>
  );
}

const TextTrack = memo(function TextTrack({
  overlay,
  duration,
  pixelsPerSecond,
  trackWidth,
  isSelected,
  onSelect,
  onUpdate,
}: {
  overlay: TextOverlay;
  duration: number;
  pixelsPerSecond: number;
  trackWidth: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<TextOverlay>) => void;
}) {
  // Animated values for smooth drag feedback
  const animLeft = useSharedValue(overlay.startTime * pixelsPerSecond);
  const animWidth = useSharedValue((overlay.endTime - overlay.startTime) * pixelsPerSecond);

  // Sync animated values when overlay props change (e.g., after undo/redo)
  useEffect(() => {
    animLeft.value = withTiming(overlay.startTime * pixelsPerSecond, { duration: 80 });
    animWidth.value = withTiming((overlay.endTime - overlay.startTime) * pixelsPerSecond, { duration: 80 });
  }, [overlay.startTime, overlay.endTime, pixelsPerSecond]);

  // Stash the start/end values at gesture start so worklet closures capture them
  const gestureStartTime = useSharedValue(0);
  const gestureEndTime = useSharedValue(0);

  // --- Left handle: trim start ---
  const leftGesture = Gesture.Pan()
    .hitSlop({ right: HANDLE_HIT_SLOP, top: 8, bottom: 8 })
    .onStart(() => {
      gestureStartTime.value = overlay.startTime;
      gestureEndTime.value = overlay.endTime;
    })
    .onUpdate((e) => {
      const delta = e.translationX / pixelsPerSecond;
      const newStart = Math.max(0, Math.min(gestureStartTime.value + delta, gestureEndTime.value - 0.5));
      animLeft.value = newStart * pixelsPerSecond;
      animWidth.value = (gestureEndTime.value - newStart) * pixelsPerSecond;
    })
    .onEnd((e) => {
      const delta = e.translationX / pixelsPerSecond;
      const newStart = Math.max(0, Math.min(gestureStartTime.value + delta, gestureEndTime.value - 0.5));
      runOnJS(onUpdate)({ startTime: newStart });
    });

  // --- Right handle: trim end ---
  const rightGesture = Gesture.Pan()
    .hitSlop({ left: HANDLE_HIT_SLOP, top: 8, bottom: 8 })
    .onStart(() => {
      gestureStartTime.value = overlay.startTime;
      gestureEndTime.value = overlay.endTime;
    })
    .onUpdate((e) => {
      const delta = e.translationX / pixelsPerSecond;
      const newEnd = Math.min(duration, Math.max(gestureEndTime.value + delta, gestureStartTime.value + 0.5));
      animWidth.value = (newEnd - gestureStartTime.value) * pixelsPerSecond;
    })
    .onEnd((e) => {
      const delta = e.translationX / pixelsPerSecond;
      const newEnd = Math.min(duration, Math.max(gestureEndTime.value + delta, gestureStartTime.value + 0.5));
      runOnJS(onUpdate)({ endTime: newEnd });
    });

  // --- Body: move entire clip ---
  const bodyGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      gestureStartTime.value = overlay.startTime;
      gestureEndTime.value = overlay.endTime;
    })
    .onUpdate((e) => {
      const clipDuration = gestureEndTime.value - gestureStartTime.value;
      const delta = e.translationX / pixelsPerSecond;
      let newStart = gestureStartTime.value + delta;
      newStart = Math.max(0, Math.min(newStart, duration - clipDuration));
      animLeft.value = newStart * pixelsPerSecond;
    })
    .onEnd((e) => {
      const clipDuration = gestureEndTime.value - gestureStartTime.value;
      const delta = e.translationX / pixelsPerSecond;
      let newStart = gestureStartTime.value + delta;
      newStart = Math.max(0, Math.min(newStart, duration - clipDuration));
      runOnJS(onUpdate)({ startTime: newStart, endTime: newStart + clipDuration });
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(onSelect)();
    });

  // Body: tap + drag race (tap wins on short touches, drag on long)
  const bodyComposed = Gesture.Simultaneous(bodyGesture, tapGesture);

  const bodyStyle = useAnimatedStyle(() => ({
    left: animLeft.value,
    width: Math.max(animWidth.value, HANDLE_WIDTH * 2 + 20),
  }));

  return (
    <View style={{ height: TRACK_HEIGHT + 8, marginBottom: 4, position: 'relative' }}>
      <GestureDetector gesture={bodyComposed}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              height: TRACK_HEIGHT,
              top: 4,
              backgroundColor: isSelected ? 'rgba(0,122,255,0.25)' : 'rgba(68,68,68,0.4)',
              borderRadius: 8,
              borderWidth: isSelected ? 1.5 : 1,
              borderColor: isSelected ? '#3399FF' : '#555',
              flexDirection: 'row',
              alignItems: 'center',
            },
            bodyStyle,
          ]}
        >
          {/* Left trim handle */}
          <GestureDetector gesture={leftGesture}>
            <Animated.View
              style={{
                width: HANDLE_WIDTH,
                height: TRACK_HEIGHT,
                backgroundColor: isSelected ? '#007AFF' : '#666',
                borderTopLeftRadius: 7,
                borderBottomLeftRadius: 7,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <View style={{ width: 3, height: 16, backgroundColor: '#FFF', borderRadius: 1.5, opacity: 0.8 }} />
            </Animated.View>
          </GestureDetector>

          {/* Label */}
          <View style={{ flex: 1, paddingHorizontal: 8 }}>
            <Text numberOfLines={1} style={{ color: '#FFF', fontSize: 12, fontWeight: '500' }}>
              {overlay.text}
            </Text>
          </View>

          {/* Right trim handle */}
          <GestureDetector gesture={rightGesture}>
            <Animated.View
              style={{
                width: HANDLE_WIDTH,
                height: TRACK_HEIGHT,
                backgroundColor: isSelected ? '#007AFF' : '#666',
                borderTopRightRadius: 7,
                borderBottomRightRadius: 7,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <View style={{ width: 3, height: 16, backgroundColor: '#FFF', borderRadius: 1.5, opacity: 0.8 }} />
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});
