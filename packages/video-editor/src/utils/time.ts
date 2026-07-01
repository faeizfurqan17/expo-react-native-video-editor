/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to SS.ms (for FFmpeg timestamps)
 */
export function formatTimestamp(seconds: number): string {
  return seconds.toFixed(3);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Minimum source-time length for a segment (split/trim UX, avoids zero-length clips). */
export const MIN_EDIT_SEGMENT_SECONDS = 0.05;

/** Stable timestamps for comparisons after scrubbing / player ticks (ms precision). */
export function quantizeTimeToMs(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

export function segmentSourceDuration(segment: { startTime: number; endTime: number }): number {
  return Math.max(0, segment.endTime - segment.startTime);
}

/** Label for a single clip length (sub-minute clips keep fractional seconds). */
export function formatClipLength(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s >= 3600 || s >= 60) {
    return formatTime(s);
  }
  return `${parseFloat(s.toFixed(2))}s`;
}
