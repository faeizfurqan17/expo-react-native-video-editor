import * as FileSystem from 'expo-file-system';
import { FFmpegEngine } from './ffmpeg-engine';
import { FFmpegCommandBuilder } from './ffmpeg-command-builder';
import type { EditorState, ExportConfig, ExportResult } from './types';

/**
 * Single-pass Stories export: one FFmpeg command burns in the color filter,
 * text overlays, and stickers (animated GIFs looped), and mixes/mutes audio.
 * No segments, no concat — the source clip is ≤60s by product constraint.
 */
export class ExportPipeline {
  private state: EditorState;
  private config: ExportConfig;
  private tempDir: string;
  private onProgress: (progress: number) => void;

  constructor(state: EditorState, config: ExportConfig) {
    this.state = state;
    this.config = config;
    this.tempDir = `${FileSystem.cacheDirectory}video-editor-export/`;
    this.onProgress = config.onProgress ?? (() => {});
  }

  async export(): Promise<ExportResult> {
    try {
      // Pre-flight: cache-held sources (ImagePicker copies) vanish on app
      // reinstall/cache eviction — fail with a clear message, not FFmpeg noise.
      const srcInfo = await FileSystem.getInfoAsync(this.state.sourceUri);
      if (!srcInfo.exists) {
        const noun = this.state.sourceType === 'image' ? 'image' : 'video';
        throw new Error(`Source ${noun} no longer exists — please pick the ${noun} again.`);
      }

      await FileSystem.makeDirectoryAsync(this.tempDir, { intermediates: true });

      const outputPath = `${FileSystem.documentDirectory}exported_video_${Date.now()}.${this.config.format}`;

      // LGPL builds carry no libx264 — resolve the available encoder up front
      // (hardware H.264, else mpeg4) instead of letting '-c:v h264' fail.
      // hwaccelDecoder speeds up DECODING the source (dominant cost for
      // heavy 4K/HDR/60fps sources, independent of the encoder choice above)
      // — null when the binary doesn't support it, so this is a pure speed
      // optimization with no effect on output quality/resolution either way.
      const [videoEncoder, hwaccelDecoder] = await Promise.all([
        FFmpegEngine.detectH264Encoder(),
        FFmpegEngine.detectHwaccelDecoder(),
      ]);

      const command = FFmpegCommandBuilder.buildExportCommand({
        sourceUri: this.state.sourceUri,
        sourceType: this.state.sourceType,
        outputPath,
        filter: this.state.filter.preset,
        stickerOverlays: this.state.stickerOverlays,
        rasterizedTexts: this.config.rasterizedTexts,
        musicTrack: this.state.musicTrack,
        originalMuted: this.state.originalMuted,
        sourceHasAudio: this.state.sourceHasAudio,
        videoWidth: this.state.sourceWidth,
        videoHeight: this.state.sourceHeight,
        previewWidth: this.config.previewWidth,
        quality: this.config.quality,
        videoEncoder,
        hwaccelDecoder,
      });

      const durationMs = this.state.sourceDuration * 1000;
      const result = await FFmpegEngine.executeWithProgress(command, durationMs, this.onProgress);
      if (result.returnCode !== 0) {
        // The actionable error is in the LAST lines of FFmpeg's output —
        // everything before is banner/config noise.
        const tail = (result.output ?? '')
          .trim()
          .split('\n')
          .filter((l) => l.trim().length > 0)
          .slice(-6)
          .join('\n');
        throw new Error(`FFmpeg export failed (code ${result.returnCode}).\n${tail}`);
      }

      const fileInfo = await FileSystem.getInfoAsync(outputPath, { size: true });
      const mediaInfo = await FFmpegEngine.getMediaInfo(outputPath);

      this.onProgress(1);

      return {
        uri: outputPath,
        duration: mediaInfo.duration,
        size: (fileInfo as { size?: number }).size ?? 0,
        width: mediaInfo.width,
        height: mediaInfo.height,
      };
    } finally {
      try {
        await FileSystem.deleteAsync(this.tempDir, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Cancel the current export.
   */
  async cancel(): Promise<void> {
    await FFmpegEngine.cancel();
    try {
      await FileSystem.deleteAsync(this.tempDir, { idempotent: true });
    } catch {
      // Ignore
    }
  }
}
