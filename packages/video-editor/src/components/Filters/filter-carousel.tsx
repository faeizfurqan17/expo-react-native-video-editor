import React, { useEffect, useRef } from 'react';
import { Text, Animated, Easing } from 'react-native';
import { FILTER_PRESETS } from '../../filters/presets';
import type { FilterPreset } from '../../core/types';

/** Ordered preset list the swipe carousel cycles through. */
export const FILTER_ORDER: FilterPreset[] = FILTER_PRESETS.map((f) => f.preset);

export function nextFilter(current: FilterPreset, direction: 1 | -1): FilterPreset {
  const i = FILTER_ORDER.indexOf(current);
  const n = (i + direction + FILTER_ORDER.length) % FILTER_ORDER.length;
  return FILTER_ORDER[n];
}

interface FilterCarouselProps {
  preset: FilterPreset;
}

/**
 * IG-style filter feedback on switch: the whole screen dims under a dark
 * scrim, the preset name fades in on top of it, holds, then both fade back
 * out together — revealing the (already live, already-graded — see the
 * always-on Skia decoder in video-preview.tsx) new filter underneath. This
 * is purely a cosmetic transition layered over an instant preview swap, not
 * something the video decode path waits on.
 */
export function FilterCarousel({ preset }: FilterCarouselProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    opacity.stopAnimation();
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(280),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 380,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [preset, opacity]);

  const label = FILTER_PRESETS.find((f) => f.preset === preset)?.displayName ?? preset;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        // Whole-screen dim scrim — same opacity-driven element as the label,
        // so they fade in/out together as one cohesive transition.
        backgroundColor: 'rgba(0,0,0,0.25)',
        opacity,
      }}
    >
      <Text
        style={{
          color: '#FFF',
          fontSize: 30,
          fontWeight: '700',
          textShadowColor: 'rgba(0,0,0,0.6)',
          textShadowRadius: 8,
          textTransform: 'capitalize',
        }}
      >
        {label}
      </Text>
    </Animated.View>
  );
}
