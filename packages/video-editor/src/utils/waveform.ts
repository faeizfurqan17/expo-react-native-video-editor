import * as FileSystem from 'expo-file-system';
import { FFmpegEngine } from '../core/ffmpeg-engine';
import { FFmpegCommandBuilder } from '../core/ffmpeg-command-builder';

/**
 * Renders a static waveform PNG for an audio file via FFmpeg's showwavespic,
 * for the Instagram-style trim selector. White bars on a transparent
 * background (showwavespic has no alpha option, so black is keyed out).
 * Cached to disk by uri+size so re-opening the music sheet for the same
 * track doesn't re-render.
 */
export async function generateWaveform(
  uri: string,
  width: number,
  height: number
): Promise<string | null> {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  // Cache key includes dimensions — a different trim-bar layout needs its
  // own render since showwavespic bakes size into the pixels.
  const cacheKey = `${uri.split('/').pop()}_${w}x${h}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = `${FileSystem.cacheDirectory}waveform_${cacheKey}.png`;

  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return dest;

  try {
    const command =
      `-i ${FFmpegCommandBuilder.quotePath(uri)} ` +
      `-filter_complex "showwavespic=s=${w}x${h}:colors=white,format=rgba,colorkey=0x000000:0.1:0.1" ` +
      `-frames:v 1 -y ${FFmpegCommandBuilder.quotePath(dest)}`;
    const result = await FFmpegEngine.execute(command);
    if (result.returnCode !== 0) return null;
    return dest;
  } catch {
    return null;
  }
}
