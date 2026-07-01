import * as FileSystem from 'expo-file-system';
import { FFmpegEngine } from '../core/ffmpeg-engine';

/**
 * Generate thumbnails for a video at evenly spaced intervals using FFmpeg.
 * Returns an array of local file URI strings for the extracted frames.
 */
export async function generateThumbnails(
  videoUri: string,
  count: number,
  duration: number,
  startOffset: number = 0
): Promise<string[]> {
  if (count <= 0 || duration <= 0) return [];
  const thumbDir = `${FileSystem.cacheDirectory}video-editor-thumbs/`;

  try {
    // Ensure thumbnail directory exists
    const dirInfo = await FileSystem.getInfoAsync(thumbDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(thumbDir, { intermediates: true });
    }

    // Generate a unique prefix for this batch
    const batchId = Date.now().toString(36);

    // Use FFmpeg fps filter to extract evenly-spaced frames
    // fps=count/duration gives us exactly `count` frames across the video
    const fps = Math.max(1, count / duration);
    const outputPattern = `${thumbDir}${batchId}_%03d.jpg`;
    const ssFlag = startOffset > 0 ? `-ss ${startOffset} ` : '';
    const tFlag = `-t ${duration} `;

    const result = await FFmpegEngine.execute(
      `${ssFlag}${tFlag}-i "${videoUri}" -an -vf "fps=${fps},scale=140:-1" -q:v 6 -threads 0 -frames:v ${count} "${outputPattern}"`
    );

    if (result.returnCode !== 0) {
      console.warn('FFmpeg thumbnail extraction failed:', result.output);
      return [];
    }

    // Build expected output list directly; FFmpeg writes sequentially.
    return Array.from({ length: count }, (_, idx) =>
      `${thumbDir}${batchId}_${String(idx + 1).padStart(3, '0')}.jpg`
    );
  } catch (e) {
    console.warn('Thumbnail generation failed:', e);
    return [];
  }
}
