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

import { Platform } from 'react-native';
import { FFmpegCommandBuilder } from './ffmpeg-command-builder';

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

  // The kit's init enables log redirection with no callbacks registered, so
  // EVERY FFmpeg log line crosses the native→JS bridge as an event and gets
  // console.log'd — thousands of messages per session choke the JS thread
  // during and long after each command. Kill both layers: never print, and
  // stop the native module emitting log events at all. Session output is
  // unaffected (logs are collected natively; getOutput() fetches them
  // directly), and statistics events — export progress — are a separate
  // toggle that stays on.
  try {
    FFmpegKitConfig?.setLogRedirectionStrategy?.(4 /* NEVER_PRINT_LOGS */);
    // Async (awaits kit init internally) — fire and forget; a few lines may
    // slip through before it lands on the very first session.
    FFmpegKitConfig?.disableLogs?.()?.catch?.(() => {});
  } catch {
    // Older forks without these APIs — logging stays noisy but functional.
  }
}

export interface FFmpegResult {
  returnCode: number;
  output: string;
  duration: number;
}

export type ProgressCallback = (progress: number) => void;

export class FFmpegEngine {
  private static h264EncoderPromise: Promise<string> | null = null;
  private static hwaccelPromise: Promise<string | null> | null = null;

  /**
   * Detect the best available H.264 encoder at runtime and cache the result.
   * LGPL ffmpeg-kit flavors (min/https) ship without libx264, so encoding
   * relies on platform hardware encoders; '-c:v h264' alone can fail to
   * resolve. Falls back to FFmpeg's built-in mpeg4 when nothing else exists.
   */
  static detectH264Encoder(): Promise<string> {
    if (!this.h264EncoderPromise) {
      this.h264EncoderPromise = (async () => {
        try {
          const result = await this.execute('-hide_banner -encoders');
          const out = result.output ?? '';
          // Preference order: hardware H.264, then software x264, then mpeg4.
          for (const enc of ['h264_videotoolbox', 'h264_mediacodec', 'libx264', 'libopenh264']) {
            if (out.includes(` ${enc} `) || out.includes(` ${enc}\n`)) return enc;
          }
        } catch {
          // Detection failed — let the fallback below apply.
        }
        return 'mpeg4';
      })();
    }
    return this.h264EncoderPromise;
  }

  /**
   * Detect whether the shipped FFmpeg binary was actually compiled with a
   * hardware-accelerated DECODE path (videotoolbox on iOS, mediacodec on
   * Android) and cache the result. This is a separate axis from
   * detectH264Encoder(): an encoder name (e.g. h264_videotoolbox) being
   * available says nothing about whether frame DECODE is also accelerated —
   * `-hwaccel <name>` is a distinct global input-side flag that only works
   * if the binary's `-hwaccels` list actually includes it. Decode is the
   * dominant cost for heavy sources (4K/HDR/60fps) since the output canvas
   * is capped well below most source resolutions regardless — this only
   * helps input decode speed, so software-decode-but-fine-for-1080p sources
   * see no real difference either way. Returns null (never apply the flag)
   * if unsupported/undetectable, so callers always have a safe fallback to
   * today's software-decode behavior.
   */
  static detectHwaccelDecoder(): Promise<string | null> {
    if (!this.hwaccelPromise) {
      this.hwaccelPromise = (async () => {
        try {
          const result = await this.execute('-hide_banner -hwaccels');
          const out = result.output ?? '';
          const candidate = Platform.OS === 'ios' ? 'videotoolbox' : 'mediacodec';
          return out.includes(candidate) ? candidate : null;
        } catch {
          return null;
        }
      })();
    }
    return this.hwaccelPromise;
  }

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
    /** Display rotation in degrees, normalized to 0 | 90 | 180 | 270. */
    rotation: number;
    bitRate: number;
    format: string;
    /** False for a video recorded/saved with no audio track (silent
     * screen recordings, mic-off captures) — export must skip any
     * `[0:a]`-referencing filter graph for these, or FFmpeg fails with
     * "Stream specifier '0:a' ... matches no streams". */
    hasAudioStream: boolean;
  }> {
    loadFFmpegKit();

    // Use FFprobe if available
    try {
      const probeModule = FFmpegKit.FFprobeKit ?? require('ffmpreg-kit-react-native').FFprobeKit;
      const session = await probeModule.execute(
        `-v quiet -analyzeduration 100000 -probesize 100000 -print_format json -show_format -show_streams ${FFmpegCommandBuilder.quotePath(filePath)}`
      );
      const output = await session.getOutput();
      const info = JSON.parse(output);

      const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');
      const hasAudioStream = Boolean(
        info.streams?.some((s: any) => s.codec_type === 'audio')
      );

      // Phone cameras store landscape frames plus a display-rotation hint
      // (displaymatrix side data, or a legacy 'rotate' tag). Report
      // display-oriented dimensions — that's what players show and what
      // FFmpeg's autorotate feeds into export filter graphs.
      const sideData = Array.isArray(videoStream?.side_data_list)
        ? videoStream.side_data_list.find((d: any) => d?.rotation !== undefined)
        : undefined;
      const rawRotation = Number(sideData?.rotation ?? videoStream?.tags?.rotate ?? 0) || 0;
      const rotation = ((Math.round(rawRotation / 90) * 90) % 360 + 360) % 360;
      const codedWidth = parseInt(videoStream?.width ?? '0', 10);
      const codedHeight = parseInt(videoStream?.height ?? '0', 10);
      const swapped = rotation === 90 || rotation === 270;

      return {
        duration: parseFloat(info.format?.duration ?? '0'),
        width: swapped ? codedHeight : codedWidth,
        height: swapped ? codedWidth : codedHeight,
        rotation,
        bitRate: parseInt(info.format?.bit_rate ?? '0', 10),
        format: info.format?.format_name ?? 'unknown',
        hasAudioStream,
      };
    } catch {
      // Fallback: run ffmpeg with -i to get info from error output
      const result = await this.execute(`-i ${FFmpegCommandBuilder.quotePath(filePath)}`);
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
        rotation: 0,
        bitRate: 0,
        format: 'unknown',
        // Can't reliably detect from -i's error-output text; assume present
        // so this fallback path doesn't drop audio for the common case —
        // the ffprobe path above is what actually exercises the no-audio fix.
        hasAudioStream: true,
      };
    }
  }
}
