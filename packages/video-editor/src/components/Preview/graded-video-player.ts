import { requireNativeViewManager } from 'expo-modules-core';
import type { ViewProps } from 'react-native';

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

export const NativeGradedVideoPlayer = requireNativeViewManager<
  GradedVideoPlayerProps & React.RefAttributes<GradedVideoPlayerNativeRef>
>('GradedVideoPlayer');
