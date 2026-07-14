import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { generateWaveform } from '../../utils/waveform';

const BAR_HEIGHT = 56;
const BAR_PADDING = 16;
const WAVEFORM_HEIGHT = 32;

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${sec}`;
}

interface MusicTrimSelectorProps {
  /** Source audio file — rendered to a static waveform image via FFmpeg. */
  trackUri: string;
  /** Full length of the source audio file, in seconds. */
  trackDuration: number;
  /** How much of the track is actually used — the video's own duration
   * (clamped to the track length), matching what export mixes in. */
  windowDuration: number;
  /** Current trim start (seconds into the source file), controlled. */
  trimStart: number;
  /** Fired continuously while dragging (for live preview scrub, optional use). */
  onTrimChange: (trimStart: number) => void;
  /** Fired once the drag gesture ends — good place to commit/persist. */
  onTrimCommit: (trimStart: number) => void;
}

/**
 * Instagram-style "pick which N seconds of this song" control: the full
 * track is drawn as a horizontal bar; a fixed-width window (sized to the
 * video's own duration) can be dragged left/right within it to choose the
 * trim start. The window can't be resized — its width is always exactly the
 * video's length, since that's however much of the track will actually play.
 */
export function MusicTrimSelector({
  trackUri,
  trackDuration,
  windowDuration,
  trimStart,
  onTrimChange,
  onTrimCommit,
}: MusicTrimSelectorProps) {
  const [barWidth, setBarWidth] = React.useState(0);
  const [waveformUri, setWaveformUri] = React.useState<string | null>(null);

  // Render the waveform once the bar has actually been measured — showwavespic
  // bakes the target size into the pixels, so this must wait for a real width
  // (and re-render if the bar is ever laid out at a different width).
  React.useEffect(() => {
    if (barWidth <= 0) return;
    let cancelled = false;
    generateWaveform(trackUri, barWidth, WAVEFORM_HEIGHT).then((uri) => {
      if (!cancelled) setWaveformUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [trackUri, barWidth]);

  // Window can't be wider than the track itself (short track, long video).
  const clampedWindowDuration = Math.min(windowDuration, trackDuration || windowDuration);
  const maxTrimStart = Math.max(0, trackDuration - clampedWindowDuration);

  const pxPerSecond = barWidth > 0 && trackDuration > 0 ? barWidth / trackDuration : 0;
  const windowWidthPx = clampedWindowDuration * pxPerSecond;

  const translateX = useSharedValue(trimStart * pxPerSecond);
  const startX = useSharedValue(0);

  // Keep the shared value in sync when trimStart changes from outside
  // (e.g. a different track picked) — but not while the user is actively
  // dragging it themselves (that would fight the gesture).
  const isDraggingRef = React.useRef(false);
  React.useEffect(() => {
    if (isDraggingRef.current) return;
    translateX.value = trimStart * pxPerSecond;
  }, [trimStart, pxPerSecond, translateX]);

  const setIsDragging = useCallback((v: boolean) => {
    isDraggingRef.current = v;
  }, []);

  const commit = useCallback(
    (px: number) => {
      isDraggingRef.current = false;
      const seconds = pxPerSecond > 0 ? px / pxPerSecond : 0;
      onTrimCommit(Math.max(0, Math.min(seconds, maxTrimStart)));
    },
    [pxPerSecond, maxTrimStart, onTrimCommit]
  );

  const liveChange = useCallback(
    (px: number) => {
      const seconds = pxPerSecond > 0 ? px / pxPerSecond : 0;
      onTrimChange(Math.max(0, Math.min(seconds, maxTrimStart)));
    },
    [pxPerSecond, maxTrimStart, onTrimChange]
  );

  const maxTrimPx = maxTrimStart * pxPerSecond;

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
      runOnJS(setIsDragging)(true);
    })
    .onUpdate((e) => {
      const next = Math.max(0, Math.min(startX.value + e.translationX, maxTrimPx));
      translateX.value = next;
      runOnJS(liveChange)(next);
    })
    .onEnd(() => {
      runOnJS(commit)(translateX.value);
    });

  const windowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: windowWidthPx,
  }));

  const trackTooShort = trackDuration > 0 && trackDuration <= clampedWindowDuration + 0.05;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: '#8E8E93', fontSize: 11 }}>
          Using {formatSeconds(clampedWindowDuration)} of {formatSeconds(trackDuration)}
        </Text>
        <Text style={{ color: '#8E8E93', fontSize: 11 }}>
          {formatSeconds(trimStart)} – {formatSeconds(trimStart + clampedWindowDuration)}
        </Text>
      </View>

      <View
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width - BAR_PADDING * 2)}
        style={{
          height: BAR_HEIGHT,
          borderRadius: 12,
          backgroundColor: '#2C2C2E',
          paddingHorizontal: BAR_PADDING,
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Real per-sample waveform once FFmpeg has rendered it; a flat bar
            placeholder before that (generation takes a moment) or if it
            fails (still fully usable for trimming either way). */}
        {waveformUri ? (
          <Image
            source={{ uri: waveformUri }}
            style={{ position: 'absolute', left: BAR_PADDING, width: barWidth, height: WAVEFORM_HEIGHT }}
            contentFit="fill"
          />
        ) : (
          <View
            style={{
              height: 22,
              borderRadius: 4,
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}
          />
        )}

        {!trackTooShort && barWidth > 0 && (
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: BAR_PADDING,
                  top: 4,
                  height: BAR_HEIGHT - 8,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: '#FFF',
                  backgroundColor: 'rgba(255,255,255,0.18)',
                },
                windowStyle,
              ]}
            >
              {/* Grip handles */}
              <View
                style={{
                  position: 'absolute',
                  left: 4,
                  top: '50%',
                  marginTop: -8,
                  width: 3,
                  height: 16,
                  borderRadius: 1.5,
                  backgroundColor: '#FFF',
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  marginTop: -8,
                  width: 3,
                  height: 16,
                  borderRadius: 1.5,
                  backgroundColor: '#FFF',
                }}
              />
            </Animated.View>
          </GestureDetector>
        )}
      </View>
    </View>
  );
}
