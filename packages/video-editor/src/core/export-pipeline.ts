import * as FileSystem from 'expo-file-system';
import { FFmpegEngine } from './ffmpeg-engine';
import { FFmpegCommandBuilder } from './ffmpeg-command-builder';
import type {
  EditorState,
  ExportConfig,
  ExportResult,
  VideoSegment,
} from './types';

/**
 * ExportPipeline orchestrates the full video export process:
 * 1. Process each segment (trim, speed, volume)
 * 2. Apply crop, rotation
 * 3. Apply filters and effects
 * 4. Burn in text overlays
 * 5. Overlay sticker images
 * 6. Mix audio tracks
 * 7. Concatenate all segments
 * 8. Output final file
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
      // Create temp directory
      await FileSystem.makeDirectoryAsync(this.tempDir, { intermediates: true });

      const totalSteps = this.state.segments.length + 2; // segments + concat + final
      let completedSteps = 0;

      const reportProgress = () => {
        completedSteps++;
        this.onProgress(completedSteps / totalSteps);
      };

      // Step 1: Process each segment
      const segmentPaths: string[] = [];
      for (let i = 0; i < this.state.segments.length; i++) {
        const segment = this.state.segments[i];
        const outputPath = `${this.tempDir}segment_${i}.mp4`;
        await this.processSegment(segment, outputPath, i);
        segmentPaths.push(outputPath);
        reportProgress();
      }

      // Step 2: Concatenate segments
      let outputPath: string;
      if (segmentPaths.length === 1) {
        outputPath = segmentPaths[0];
      } else {
        outputPath = `${this.tempDir}concat.mp4`;
        await this.concatenateSegments(segmentPaths, outputPath);
      }
      reportProgress();

      // Step 3: Mix audio if needed
      if (this.state.audioTracks.length > 0) {
        const audioOutputPath = `${this.tempDir}final_audio.mp4`;
        await this.mixAudio(outputPath, audioOutputPath);
        outputPath = audioOutputPath;
      }

      // Step 4: Move to final output location
      const finalPath = `${FileSystem.documentDirectory}exported_video_${Date.now()}.${this.config.format}`;
      await FileSystem.moveAsync({ from: outputPath, to: finalPath });
      reportProgress();

      // Get final file info
      const fileInfo = await FileSystem.getInfoAsync(finalPath, { size: true });
      const mediaInfo = await FFmpegEngine.getMediaInfo(finalPath);

      return {
        uri: finalPath,
        duration: mediaInfo.duration,
        size: (fileInfo as any).size ?? 0,
        width: mediaInfo.width,
        height: mediaInfo.height,
      };
    } finally {
      // Cleanup temp directory
      try {
        await FileSystem.deleteAsync(this.tempDir, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async processSegment(
    segment: VideoSegment,
    outputPath: string,
    _index: number
  ): Promise<void> {
    // Build the base video filter graph (speed, rotation, crop, color, effects, text)
    const filterGraph = FFmpegCommandBuilder.buildFilterGraph({
      segment,
      crop: this.state.crop,
      filter: segment.filter.preset,
      filterIntensity: segment.filter.intensity,
      effects: this.state.effects.filter(
        (e) => e.startTime >= segment.startTime && e.startTime < segment.endTime
      ),
      textOverlays: this.state.textOverlays.filter(
        (t) => t.startTime < segment.endTime && t.endTime > segment.startTime
      ),
      videoWidth: this.state.sourceWidth,
      videoHeight: this.state.sourceHeight,
      previewWidth: this.config.previewWidth,
      // Segment is cut with `-ss segment.startTime`; localize enable windows to it.
      timeOffset: segment.startTime,
    });

    const qualityArgs = FFmpegCommandBuilder.qualityArgs(this.config.quality);

    // Build sticker overlay inputs and filters
    const relevantStickers = this.state.stickerOverlays.filter(
      (s) => s.startTime < segment.endTime && s.endTime > segment.startTime
    );
    const stickerInputs: string[] = [];
    const stickerFilters: string[] = [];
    for (let i = 0; i < relevantStickers.length; i++) {
      const result = FFmpegCommandBuilder.overlayImage(
        relevantStickers[i],
        i + 1,
        this.state.sourceWidth,
        this.state.sourceHeight
      );
      stickerInputs.push(result.inputs);
      stickerFilters.push(result.filter);
    }

    const hasStickers = stickerFilters.length > 0;

    // Build audio filters (volume + speed) together
    const audioFilterParts: string[] = [];
    if (segment.volume !== 1) {
      audioFilterParts.push(`volume=${segment.volume.toFixed(2)}`);
    }
    if (segment.speed !== 1) {
      let remaining = segment.speed;
      while (remaining > 2.0) {
        audioFilterParts.push('atempo=2.0');
        remaining /= 2.0;
      }
      while (remaining < 0.5) {
        audioFilterParts.push('atempo=0.5');
        remaining /= 0.5;
      }
      audioFilterParts.push(`atempo=${remaining.toFixed(4)}`);
    }

    // --- Compose final command ---
    // Place -ss BEFORE -i for fast input seeking
    let command = `-ss ${segment.startTime.toFixed(3)} -to ${segment.endTime.toFixed(3)}`;
    command += ` -i "${segment.sourceUri}"`;

    // Add sticker image inputs
    if (hasStickers) {
      command += ' ' + stickerInputs.join(' ');
    }

    // Video filters — use -filter_complex when stickers are present (multi-input),
    // otherwise use simple -vf
    if (hasStickers) {
      // Build a filter_complex chain: base video filters on [0:v], then overlay stickers
      const baseLabel = filterGraph ? `[0:v]${filterGraph}[base]` : '';
      const inputLabel = filterGraph ? '[base]' : '[0:v]';

      // Chain sticker overlays sequentially
      const complexParts: string[] = [];
      if (baseLabel) complexParts.push(baseLabel);

      let currentLabel = inputLabel;
      for (let i = 0; i < stickerFilters.length; i++) {
        const outLabel = i === stickerFilters.length - 1 ? '[vout]' : `[v${i}]`;
        // stickerFilters[i] already contains [inputIdx:v]scale=...[sN];[prev][sN]overlay=...
        // We need to rewrite it to chain properly
        const scaleAndOverlay = stickerFilters[i];
        complexParts.push(
          scaleAndOverlay.replace('[0:v]', currentLabel).replace(
            new RegExp(`overlay=(.*?)$`),
            `overlay=$1${outLabel}`
          )
        );
        currentLabel = outLabel;
      }

      command += ` -filter_complex "${complexParts.join(';')}"`;
      command += ` -map "${currentLabel === inputLabel ? '0:v' : currentLabel.replace('[', '').replace(']', '')}"`;
      command += ' -map 0:a?';
    } else if (filterGraph) {
      command += ` -vf "${filterGraph}"`;
    }

    // Audio filters
    if (audioFilterParts.length > 0) {
      command += ` -af "${audioFilterParts.join(',')}"`;
    }

    // Quality
    command += ` ${qualityArgs}`;

    // Output
    command += ` -y "${outputPath}"`;

    const durationMs = (segment.endTime - segment.startTime) * 1000;
    const result = await FFmpegEngine.executeWithProgress(command, durationMs, () => {});
    if (result.returnCode !== 0) {
      throw new Error(
        `FFmpeg segment export failed (code ${result.returnCode}). ${result.output?.slice(-800) ?? ''}`
      );
    }
  }

  private async concatenateSegments(
    segmentPaths: string[],
    outputPath: string
  ): Promise<void> {
    // Create concat file
    const concatContent = FFmpegCommandBuilder.concatFile(segmentPaths);
    const concatFilePath = `${this.tempDir}concat.txt`;
    await FileSystem.writeAsStringAsync(concatFilePath, concatContent);

    const command = FFmpegCommandBuilder.concat(concatFilePath, outputPath);
    const concatResult = await FFmpegEngine.execute(command);
    if (concatResult.returnCode !== 0) {
      throw new Error(
        `FFmpeg concat failed (code ${concatResult.returnCode}). ${concatResult.output?.slice(-800) ?? ''}`
      );
    }
  }

  private async mixAudio(
    videoPath: string,
    outputPath: string
  ): Promise<void> {
    // Build audio mix command
    let command = `-i "${videoPath}"`;

    // Add audio track inputs
    for (const track of this.state.audioTracks) {
      command += ` -i "${track.uri}"`;
    }

    // Build filter complex for audio mixing
    const audioMixFilter = FFmpegCommandBuilder.audioMix(
      this.state.audioTracks,
      this.state.originalVolume
    );

    if (audioMixFilter) {
      command += ` -filter_complex "${audioMixFilter}"`;
      command += ' -map 0:v -map "[aout]"';
    }

    command += ` -c:v copy -y "${outputPath}"`;

    const mixResult = await FFmpegEngine.execute(command);
    if (mixResult.returnCode !== 0) {
      throw new Error(
        `FFmpeg audio mix failed (code ${mixResult.returnCode}). ${mixResult.output?.slice(-800) ?? ''}`
      );
    }
  }

  /**
   * Cancel the current export.
   */
  async cancel(): Promise<void> {
    await FFmpegEngine.cancel();
    // Cleanup temp files
    try {
      await FileSystem.deleteAsync(this.tempDir, { idempotent: true });
    } catch {
      // Ignore
    }
  }
}
