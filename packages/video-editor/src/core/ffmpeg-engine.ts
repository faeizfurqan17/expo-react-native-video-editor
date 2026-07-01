/**
 * FFmpegEngine - Wrapper around ffmpeg-kit for executing FFmpeg commands.
 *
 * This module provides a thin abstraction over ffmpeg-kit-react-native.
 * The actual ffmpeg-kit package is a peer dependency and must be installed
 * by the consuming app (beedeez/ffmpreg-kit-react-native for iOS+Android).
 *
 * Usage:
 *   import { FFmpegEngine } from './ffmpeg-engine';
 *   const result = await FFmpegEngine.execute('-i input.mp4 -c copy output.mp4');
 */

// We lazily require ffmpeg-kit to keep it as a peer/optional dependency.
// Using require() instead of dynamic import() to avoid Metro async module
// resolution issues in monorepo setups.
let FFmpegKit: any = null;
let FFmpegKitConfig: any = null;

function loadFFmpegKit() {
  if (FFmpegKit) return;

  try {
    // Try the beedeez fork first (recommended for iOS+Android)
    const kit = require('ffmpreg-kit-react-native');
    FFmpegKit = kit.FFmpegKit;
    FFmpegKitConfig = kit.FFmpegKitConfig;
  } catch {
    try {
      // Fallback to other forks
      const kit = require('ffmpeg-kit-react-native');
      FFmpegKit = kit.FFmpegKit;
      FFmpegKitConfig = kit.FFmpegKitConfig;
    } catch {
      throw new Error(
        'FFmpeg kit not found. Please install one of:\n' +
        '  - ffmpreg-kit-react-native (recommended, iOS+Android)\n' +
        '  - ffmpeg-kit-react-native\n'
      );
    }
  }
}

export interface FFmpegResult {
  returnCode: number;
  output: string;
  duration: number;
}

export type ProgressCallback = (progress: number) => void;

export class FFmpegEngine {
  /**
   * Execute an FFmpeg command string.
   * Returns a promise that resolves when the command completes.
   */
  static async execute(command: string): Promise<FFmpegResult> {
    loadFFmpegKit();

    const session = await FFmpegKit.execute(command);
    const returnCode = await session.getReturnCode();
    const output = await session.getOutput();
    const duration = await session.getDuration();

    return {
      returnCode: returnCode?.getValue?.() ?? returnCode ?? -1,
      output: output ?? '',
      duration: duration ?? 0,
    };
  }

  /**
   * Execute an FFmpeg command with progress reporting.
   * The progress callback receives values from 0 to 1.
   */
  static async executeWithProgress(
    command: string,
    totalDurationMs: number,
    onProgress: ProgressCallback
  ): Promise<FFmpegResult> {
    loadFFmpegKit();

    // Enable statistics callback for progress
    if (FFmpegKitConfig?.enableStatisticsCallback) {
      FFmpegKitConfig.enableStatisticsCallback((statistics: any) => {
        const timeMs = statistics?.getTime?.() ?? 0;
        if (totalDurationMs > 0) {
          const progress = Math.min(timeMs / totalDurationMs, 1);
          onProgress(progress);
        }
      });
    }

    const result = await this.execute(command);

    // Ensure we report 100% on completion
    onProgress(1);

    return result;
  }

  /**
   * Cancel any running FFmpeg session.
   */
  static async cancel(): Promise<void> {
    loadFFmpegKit();
    if (FFmpegKit?.cancel) {
      await FFmpegKit.cancel();
    }
  }

  /**
   * Get media information for a file.
   */
  static async getMediaInfo(filePath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    bitRate: number;
    format: string;
  }> {
    loadFFmpegKit();

    // Use FFprobe if available
    try {
      const probeModule = FFmpegKit.FFprobeKit ?? require('ffmpreg-kit-react-native').FFprobeKit;
      const session = await probeModule.execute(
        `-v quiet -print_format json -show_format -show_streams "${filePath}"`
      );
      const output = await session.getOutput();
      const info = JSON.parse(output);

      const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');

      return {
        duration: parseFloat(info.format?.duration ?? '0'),
        width: parseInt(videoStream?.width ?? '0', 10),
        height: parseInt(videoStream?.height ?? '0', 10),
        bitRate: parseInt(info.format?.bit_rate ?? '0', 10),
        format: info.format?.format_name ?? 'unknown',
      };
    } catch {
      // Fallback: run ffmpeg with -i to get info from error output
      const result = await this.execute(`-i "${filePath}"`);
      const durationMatch = result.output.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      const sizeMatch = result.output.match(/(\d{2,5})x(\d{2,5})/);

      return {
        duration: durationMatch
          ? parseInt(durationMatch[1]) * 3600 +
            parseInt(durationMatch[2]) * 60 +
            parseFloat(durationMatch[3])
          : 0,
        width: sizeMatch ? parseInt(sizeMatch[1]) : 0,
        height: sizeMatch ? parseInt(sizeMatch[2]) : 0,
        bitRate: 0,
        format: 'unknown',
      };
    }
  }
}
