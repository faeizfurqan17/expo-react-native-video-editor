import type { FilterPreset } from '../core/types';

/**
 * Skia color matrix definitions for each filter preset.
 * 4x5 matrix format: [R_r, R_g, R_b, R_a, R_offset, G_r, G_g, G_b, G_a, G_offset, ...]
 * Values are 0-1 for channels, offsets can be -1 to 1 (mapped to -255 to 255).
 */

export const IDENTITY_MATRIX: number[] = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

export interface FilterDefinition {
  name: string;
  preset: FilterPreset;
  displayName: string;
  colorMatrix: number[];
}

export const FILTER_PRESETS: FilterDefinition[] = [
  {
    name: 'normal',
    preset: 'normal',
    displayName: 'Normal',
    colorMatrix: IDENTITY_MATRIX,
  },
  {
    name: 'norway',
    preset: 'norway',
    displayName: 'Norway',
    // Cool blue tones, slightly desaturated, lifted shadows
    colorMatrix: [
      0.85, 0.05, 0.05, 0, 0.02,
      0.05, 0.88, 0.05, 0, 0.02,
      0.05, 0.05, 1.05, 0, 0.08,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'neon',
    preset: 'neon',
    displayName: 'Neon',
    // High contrast, vivid colors
    colorMatrix: [
      1.3, 0, 0, 0, -0.05,
      0, 1.3, 0, 0, -0.05,
      0, 0, 1.3, 0, -0.05,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'retro',
    preset: 'retro',
    displayName: 'Retro',
    // Warm, faded, low contrast
    colorMatrix: [
      0.9, 0.1, 0, 0, 0.05,
      0.05, 0.85, 0.05, 0, 0.05,
      0, 0.05, 0.8, 0, 0.02,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'warm',
    preset: 'warm',
    displayName: 'Warm',
    // Golden warm tones
    colorMatrix: [
      1.1, 0.05, 0, 0, 0.05,
      0, 1.05, 0.02, 0, 0.02,
      0, 0, 0.9, 0, -0.02,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'cool',
    preset: 'cool',
    displayName: 'Cool',
    // Blue cool tones
    colorMatrix: [
      0.9, 0, 0, 0, -0.02,
      0, 1.0, 0.05, 0, 0,
      0, 0.05, 1.15, 0, 0.05,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'bw',
    preset: 'bw',
    displayName: 'B&W',
    // Grayscale with contrast boost
    colorMatrix: [
      0.33, 0.59, 0.11, 0, 0,
      0.33, 0.59, 0.11, 0, 0,
      0.33, 0.59, 0.11, 0, 0,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'vintage',
    preset: 'vintage',
    displayName: 'Vintage',
    // Sepia-like warm tones
    colorMatrix: [
      0.393, 0.769, 0.189, 0, 0.03,
      0.349, 0.686, 0.168, 0, 0.02,
      0.272, 0.534, 0.131, 0, 0.01,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'sunset',
    preset: 'sunset',
    displayName: 'Sunset',
    // Orange/pink warm glow
    colorMatrix: [
      1.15, 0.1, 0, 0, 0.05,
      0.05, 0.95, 0.05, 0, 0.02,
      -0.05, 0.02, 0.95, 0, 0.05,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'film',
    preset: 'film',
    displayName: 'Film',
    // Classic film look
    colorMatrix: [
      1.05, 0.02, 0, 0, -0.02,
      0, 1.0, 0.02, 0, -0.01,
      0, 0.02, 0.95, 0, 0.02,
      0, 0, 0, 1, 0,
    ],
  },
  {
    name: 'fade',
    preset: 'fade',
    displayName: 'Fade',
    // Lifted blacks, soft pastel
    colorMatrix: [
      0.9, 0, 0, 0, 0.1,
      0, 0.9, 0, 0, 0.1,
      0, 0, 0.9, 0, 0.1,
      0, 0, 0, 1, 0,
    ],
  },
];

/**
 * Get filter definition by preset name.
 */
export function getFilterByPreset(preset: FilterPreset): FilterDefinition {
  return (
    FILTER_PRESETS.find((f) => f.preset === preset) ?? FILTER_PRESETS[0]
  );
}
