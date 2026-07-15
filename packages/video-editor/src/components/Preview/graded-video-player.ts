import type { ViewProps } from 'react-native';
import type { ComponentType } from 'react';

/**
 * Standalone AVPlayer-backed preview view (iOS only). Applies color grading
 * via AVMutableVideoComposition + CIColorMatrix inside AVFoundation's own
 * decode/composite pipeline — no dependency on expo-video's internals, so
 * this ships safely as a library native module without version coupling.
 *
 * Deliberately NOT built on expo-video: expo-video's `VideoPlayer` is an
 * `internal` Swift class with no stability guarantee across releases, so
 * reaching into it (e.g. via patch-package) is fine for an app's own use but
 * cannot be shipped inside a published npm library — see the module's ios/
 * README for the full rationale.
 */
export interface GradedVideoPlayerProps extends ViewProps {
  /** Local file URI or remote URL. */
  source?: string | null;
  loop?: boolean;
  muted?: boolean;
  volume?: number;
  /** 20-element row-major 4x5 CIColorMatrix (R,G,B,A,Bias rows), or null/undefined to clear grading. */
  colorMatrix?: number[] | null;
}

export interface GradedVideoPlayerNativeRef {
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
}

export type NativeGradedVideoPlayerComponent = ComponentType<
  GradedVideoPlayerProps & React.RefAttributes<GradedVideoPlayerNativeRef>
>;

// expo-modules-core's requireNativeViewManager throws IMMEDIATELY if called
// where no native view manager can exist (confirmed: it crashed Expo
// Router's getServerManifest.js build step, which loads route dependencies
// in a generic Node context with no native modules linked — even for a
// native Android/iOS export target, not just web). A module-scope call —
// same as a static import evaluating it eagerly — has no way to defer past
// that, so resolution is deferred to first actual call (from inside a React
// component, on a real render) and memoized. A resolution failure collapses
// to `null`, which every call site already null-checks (this view is
// optional on Android/unsupported devices).
let cached: NativeGradedVideoPlayerComponent | null | undefined;

export function getNativeGradedVideoPlayer(): NativeGradedVideoPlayerComponent | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeViewManager } = require('expo-modules-core');
    cached = requireNativeViewManager('GradedVideoPlayer') as NativeGradedVideoPlayerComponent;
  } catch {
    cached = null;
  }
  return cached;
}
