import type { VideoSegment } from '../core/types';

const TICK_EPS = 0.05;

function sortedSegments(segments: VideoSegment[]): VideoSegment[] {
  return [...segments].sort((a, b) => a.startTime - b.startTime);
}

/**
 * Snap a source timestamp into a valid frame on the edited timeline (no gaps).
 */
export function clampSourceTimeToSegments(
  segments: VideoSegment[],
  t: number,
  sourceDuration: number
): number {
  const EPS = 1e-3;
  if (!segments.length) {
    return Math.max(0, Math.min(t, Math.max(0, sourceDuration)));
  }
  const sorted = sortedSegments(segments);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  if (t <= first.startTime + EPS) return first.startTime;
  if (t >= last.endTime - EPS) return last.endTime;

  const inside = sorted.find((s) => t + EPS >= s.startTime && t - EPS <= s.endTime);
  if (inside) {
    return Math.min(Math.max(t, inside.startTime), inside.endTime);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t > a.endTime && t < b.startTime) {
      return b.startTime;
    }
  }

  return Math.min(Math.max(t, first.startTime), last.endTime);
}

export type PlaybackTickResult = {
  time: number;
  seekTo?: number;
  stop?: boolean;
};

/**
 * While playing, map native player time → edited timeline: skip deleted gaps,
 * stop at the end of the last kept segment (before EOF junk).
 */
export function resolvePlaybackTick(
  segments: VideoSegment[],
  t: number,
  sourceDuration: number
): PlaybackTickResult {
  if (!segments.length) {
    const clamped = Math.max(0, Math.min(t, Math.max(0, sourceDuration)));
    if (t >= sourceDuration - TICK_EPS) return { time: clamped, stop: true };
    return { time: clamped };
  }

  const sorted = sortedSegments(segments);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  if (t < first.startTime - TICK_EPS) {
    return { time: first.startTime, seekTo: first.startTime };
  }

  const inside = sorted.find(
    (s) => t + TICK_EPS >= s.startTime && t - TICK_EPS <= s.endTime
  );
  if (inside) {
    return { time: Math.min(Math.max(t, inside.startTime), inside.endTime) };
  }

  if (t > last.endTime + TICK_EPS) {
    return { time: last.endTime, stop: true };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t > a.endTime + TICK_EPS && t < b.startTime - TICK_EPS) {
      return { time: b.startTime, seekTo: b.startTime };
    }
  }

  return { time: clampSourceTimeToSegments(segments, t, sourceDuration) };
}
