import { Platform } from 'react-native';
import type {
  StickerOverlay,
  AudioTrack,
  FilterPreset,
  ExportQuality,
  SourceType,
} from './types';
import { IMAGE_SOURCE_DURATION_SECONDS } from './types';
import { getFilterByPreset } from '../filters/presets';

/**
 * Builds FFmpeg command strings for the Stories-style export:
 * one clip, color-matrix filter + text + stickers burned in, music mixed.
 * Used by ExportPipeline to generate the single export command.
 */
export class FFmpegCommandBuilder {
  /**
   * Quote a file path/URI for embedding in a command string. Paths go inside
   * double quotes; embedded double quotes are escaped. content:// and
   * non-ASCII URIs pass through untouched (colons are safe when quoted).
   */
  static quotePath(p: string): string {
    // FFmpeg's file protocol handles file:// URIs inconsistently across
    // builds (Android especially) — strip the scheme, keep the raw path.
    const path = p.startsWith('file://') ? p.slice(7) : p;
    return `"${path.replace(/"/g, '\\"')}"`;
  }

  // NOTE: no drawtext here on purpose — the shipped ffmpeg-kit flavors
  // (min/https, LGPL) are built without freetype, so the drawtext filter does
  // not exist. Text overlays are rasterized to PNGs with Skia at export time
  // (pixel-identical to the preview) and composited via overlayImage below.

  // --- Sticker/Image Overlay ---

  /**
   * Input args + filter chain fragment for one sticker.
   * Animated GIFs loop for the clip's duration via -stream_loop -1
   * (paired with -shortest on the output so the export still ends with the video).
   */
  static overlayImage(
    overlay: StickerOverlay,
    inputIndex: number,
    videoWidth: number,
    videoHeight: number,
    previewWidth?: number
  ): { inputs: string; scale: string; overlay: string } {
    // Preview positions/sizes stickers in screen px on a previewWidth-wide canvas;
    // scale everything up to video resolution.
    const scaleFactor = previewWidth && previewWidth > 0 ? videoWidth / previewWidth : 1;
    const cx = Math.round(overlay.position.x * videoWidth);
    const cy = Math.round(overlay.position.y * videoHeight);
    const w = Math.max(2, Math.round(overlay.size.width * overlay.scale * scaleFactor));
    const h = Math.max(2, Math.round(overlay.size.height * overlay.scale * scaleFactor));
    
    // FFmpeg's overlay filter places the top-left corner at x:y.
    // The UI records `position` as the center of the sticker, so we subtract half the size.
    const x = cx - Math.round(w / 2);
    const y = cy - Math.round(h / 2);

    const loop = overlay.animated ? '-stream_loop -1 ' : '';
    const inputs = `${loop}-i ${this.quotePath(overlay.uri)}`;

    const scaleLabel = `s${inputIndex}`;
    const rotate =
      Math.abs(overlay.rotation) > 0.01
        ? `,rotate=${((overlay.rotation * Math.PI) / 180).toFixed(5)}:c=none:ow=rotw(${((overlay.rotation * Math.PI) / 180).toFixed(5)}):oh=roth(${((overlay.rotation * Math.PI) / 180).toFixed(5)})`
        : '';
    const scale = `[${inputIndex}:v]scale=${w}:${h}${rotate}[${scaleLabel}]`;

    // shortest=1 ONLY for looped GIFs: it stops the overlay when the main video
    // ends (the looped GIF never ends on its own). For static images it would
    // do the opposite — a PNG is a 1-frame stream, so shortest=1 terminates the
    // whole output after that single frame (~0.04s video). Static images rely
    // on overlay's default repeatlast=1 instead.
    let ov = overlay.animated ? `overlay=${x}:${y}:shortest=1` : `overlay=${x}:${y}`;
    if (overlay.startTime > 0.001 || overlay.endTime > 0.001) {
      ov += `:enable='between(t,${Math.max(0, overlay.startTime).toFixed(3)},${Math.max(0, overlay.endTime).toFixed(3)})'`;
    }

    return { inputs, scale, overlay: ov };
  }

  // --- Audio ---

  /**
   * Audio graph for original + optional music track.
   * Muted original becomes volume=0 (kept in the mix so timestamps stay aligned).
   * Returns '' when nothing needs processing (no music, not muted).
   *
   * A still-image source, or a video recorded/saved with no audio track
   * (silent screen recordings, mic-off captures), has no `[0:a]` original
   * audio stream at all (there's nothing to mute/mix), so
   * `hasOriginalAudio: false` skips straight to the music-only leg —
   * referencing a nonexistent `[0:a]` would fail with "Stream specifier
   * '0:a' in filtergraph ... matches no streams".
   */
  static audioGraph(
    music: AudioTrack | null,
    originalMuted: boolean,
    musicInputIndex: number = 1,
    hasOriginalAudio: boolean = true
  ): string {
    const musicVol = music && !music.muted ? music.volume : 0;

    if (!hasOriginalAudio) {
      if (!music) return '';
      const delayMs = Math.max(0, Math.round(music.startTime * 1000));
      return `[${musicInputIndex}:a]volume=${musicVol.toFixed(2)},adelay=${delayMs}|${delayMs}[aout]`;
    }

    if (!music && !originalMuted) return '';

    const originalVol = originalMuted ? 0 : 1;
    if (!music) {
      return `[0:a]volume=${originalVol.toFixed(2)}[aout]`;
    }

    const delayMs = Math.max(0, Math.round(music.startTime * 1000));
    const parts = [
      `[0:a]volume=${originalVol.toFixed(2)}[a0]`,
      `[${musicInputIndex}:a]volume=${musicVol.toFixed(2)},adelay=${delayMs}|${delayMs}[a1]`,
      `[a0][a1]amix=inputs=2:duration=first[aout]`,
    ];
    return parts.join(';');
  }

  // --- Filter (colorchannelmixer — fast SIMD path) ---

  /**
   * Apply the 4×5 color matrix via colorchannelmixer + lut.
   *
   * colorchannelmixer is SIMD-vectorized and 10–20× faster than geq for
   * linear color transforms.  It handles the 4×4 mixing portion (columns 0-3
   * of each row).  Per-channel brightness offsets (column 4) are applied
   * afterwards with a lut filter when non-negligible (|offset| > 0.004).
   *
   * Matrix layout (same as filters/presets.ts FilterDefinition.colorMatrix):
   *   row 0: [rr, rg, rb, ra, r_offset]   (red output)
   *   row 1: [gr, gg, gb, ga, g_offset]   (green output)
   *   row 2: [br, bg, bb, ba, b_offset]   (blue output)
   *   row 3: alpha row — ignored (video has no transparency)
   */
  static colorMatrixToFastFilter(matrix: number[]): string {
    const f = (n: number) => {
      if (!Number.isFinite(n)) return '0';
      let s = n.toFixed(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      return s || '0';
    };

    // Row 0: red output
    const rr = matrix[0], rg = matrix[1], rb = matrix[2];
    // Row 1: green output
    const gr = matrix[5], gg = matrix[6], gb = matrix[7];
    // Row 2: blue output
    const br = matrix[10], bg = matrix[11], bb = matrix[12];
    // Offsets (column 4 of each row, values in 0-1 range)
    const rOff = matrix[4] ?? 0;
    const gOff = matrix[9] ?? 0;
    const bOff = matrix[14] ?? 0;

    let filter = `colorchannelmixer=${[
      `rr=${f(rr)}`, `rg=${f(rg)}`, `rb=${f(rb)}`,
      `gr=${f(gr)}`, `gg=${f(gg)}`, `gb=${f(gb)}`,
      `br=${f(br)}`, `bg=${f(bg)}`, `bb=${f(bb)}`,
    ].join(':')}`;

    // Apply brightness offsets via lut (integer pixel arithmetic, very fast).
    // Commas inside the single-quoted expression are safe with the filter parser.
    if (Math.abs(rOff) > 0.004 || Math.abs(gOff) > 0.004 || Math.abs(bOff) > 0.004) {
      const ro = Math.round(rOff * 255);
      const go = Math.round(gOff * 255);
      const bo = Math.round(bOff * 255);
      filter += `,lut=r='clip(val+${ro},0,255)':g='clip(val+${go},0,255)':b='clip(val+${bo},0,255)'`;
    }

    return filter;
  }

  // --- Quality Presets ---

  /**
   * Codec + quality flags for the output.
   * `videoEncoder` should come from FFmpegEngine.detectH264Encoder() — the
   * LGPL ffmpeg-kit flavors have no libx264, so hardware encoders
   * (VideoToolbox/MediaCodec) carry H.264, with mpeg4 as the last resort.
   */
  static qualityArgs(quality: ExportQuality, videoEncoder?: string): string {
    const codec =
      videoEncoder ??
      (Platform.OS === 'ios' ? 'h264_videotoolbox' : 'h264_mediacodec');

    // -g (gop size) is required for h264_mediacodec to set a sane i-frame
    // interval (it warns and can stall with the default of 1) and is harmless
    // on the other encoders.
    switch (quality) {
      case 'low':
        return `-c:v ${codec} -b:v 2000k -g 48 -c:a aac -b:a 128k -r 24`;
      case 'medium':
        return `-c:v ${codec} -b:v 5000k -g 60 -c:a aac -b:a 192k -r 30`;
      case 'high':
        return `-c:v ${codec} -b:v 8000k -g 60 -c:a aac -b:a 256k -r 30`;
    }
  }

  // --- Single-pass export command ---

  /**
   * Build the complete export command: video base chain (filter + text),
   * sticker overlays, audio graph, quality args, output.
   */
  static buildExportCommand(options: {
    sourceUri: string;
    /** Defaults to 'video'; a still image loops into a fixed-length clip. */
    sourceType?: SourceType;
    outputPath: string;
    filter: FilterPreset;
    stickerOverlays: StickerOverlay[];
    /** Text overlays pre-rendered to PNGs (Skia snapshot) — composited last, above stickers. */
    rasterizedTexts?: StickerOverlay[];
    musicTrack: AudioTrack | null;
    originalMuted: boolean;
    /** False for a video with no audio track — skips the `[0:a]`-referencing
     * branch of the audio filter graph, which otherwise fails with
     * "Stream specifier '0:a' ... matches no streams". Always effectively
     * true for an image source (isImage already takes its own branch). */
    sourceHasAudio?: boolean;
    videoWidth: number;
    videoHeight: number;
    previewWidth?: number;
    quality: ExportQuality;
    /** From FFmpegEngine.detectH264Encoder(); platform default when omitted. */
    videoEncoder?: string;
    /** From FFmpegEngine.detectHwaccelDecoder(); null/omitted skips
     * hardware-accelerated decode of the SOURCE (separate from videoEncoder,
     * which only affects the output encode side). Speeds up decoding heavy
     * sources (4K/HDR/high-fps); has no effect on output resolution/quality. */
    hwaccelDecoder?: string | null;
  }): string {
    const {
      sourceUri,
      sourceType = 'video',
      outputPath,
      filter,
      stickerOverlays,
      rasterizedTexts = [],
      musicTrack,
      originalMuted,
      sourceHasAudio = true,
      previewWidth,
      quality,
      videoEncoder,
      hwaccelDecoder,
    } = options;
    const isImage = sourceType === 'image';

    // Output is always a 9:16 story canvas (IG model): the video is contain-fit
    // and centered on it, and overlays can sit ANYWHERE on the canvas —
    // including over the letterbox bars. Overlay positions are normalized
    // against this canvas, matching the preview's 9:16 editing surface.
    const canvasW = 1080;
    const canvasH = 1920;

    // --- Base video chain: fit-to-canvas + color matrix + center-pad ---
    const baseFilters: string[] = [];

    // Contain-fit into the canvas first (reduces pixel count before filtering).
    baseFilters.push(
      `scale=${canvasW}:${canvasH}:force_original_aspect_ratio=decrease:force_divisible_by=2`
    );

    // Color filter BEFORE pad so the letterbox bars stay pure black (a warm
    // preset would otherwise tint them via its brightness offsets).
    if (filter !== 'normal') {
      const def = getFilterByPreset(filter);
      baseFilters.push(this.colorMatrixToFastFilter(def.colorMatrix));
    }

    // Center on the 9:16 canvas; setsar normalizes anamorphic sources.
    baseFilters.push(`pad=${canvasW}:${canvasH}:(ow-iw)/2:(oh-ih)/2:color=black`);
    baseFilters.push('setsar=1');

    // --- Inputs: [0]=video, [1..n]=stickers then rasterized text, [n+1]=music ---
    // Text PNGs come after stickers so text always composites on top,
    // matching the preview z-order.
    const allOverlays = [...stickerOverlays, ...rasterizedTexts];
    // A still image has no natural duration or framerate — loop it into an
    // infinite virtual video stream (-loop/-r are input options and sit
    // BEFORE this -i). The duration bound is applied on the OUTPUT side (see
    // the tail of the command below), NOT here: FFmpeg input options must
    // precede their -i, so a `-t` placed after this -i would silently bind
    // to the NEXT input instead. That exact mistake previously put the
    // duration cap on the music input when one was present — leaving the
    // looped image stream unbounded, so FFmpeg encoded an endless video and
    // the export hung at 100% forever (image-only exports "worked" only
    // because with no later input the stray -t happened to land on the
    // output). -hwaccel (decode-side acceleration) only applies to an actual
    // video decode, not the synthetic looped-image stream, so it's skipped
    // for isImage.
    const hwaccelFlag = !isImage && hwaccelDecoder ? `-hwaccel ${hwaccelDecoder} ` : '';
    let command = isImage
      ? `-loop 1 -r 30 -i ${this.quotePath(sourceUri)}`
      : `${hwaccelFlag}-i ${this.quotePath(sourceUri)}`;
    const stickerParts: { scale: string; overlay: string }[] = [];
    allOverlays.forEach((s, i) => {
      // Overlays composite after pad — coordinates are canvas-relative.
      const part = this.overlayImage(s, i + 1, canvasW, canvasH, previewWidth);
      command += ` ${part.inputs}`;
      stickerParts.push({ scale: part.scale, overlay: part.overlay });
    });
    const musicInputIndex = 1 + allOverlays.length;
    if (musicTrack) {
      // Images have no natural duration to bound the mix against (unlike
      // video, where music just plays once and can end early) — loop the
      // track so it fills the whole fixed image duration.
      const musicLoop = isImage ? '-stream_loop -1 ' : '';
      // -ss before -i is an input seek — starts decoding from the picked
      // trim point (the IG-style "which N seconds of this song" window from
      // MusicSheet) instead of the file's beginning. Combined with
      // -stream_loop above, each loop iteration replays from this same
      // point, not from 0.
      const trimSeek =
        musicTrack.trimStart > 0.001 ? `-ss ${musicTrack.trimStart.toFixed(3)} ` : '';
      // No input-side duration cap here: -t as an input option is unreliable
      // when combined with -stream_loop -1 (loop timestamp resets can defeat
      // it), and the image case is bounded authoritatively by the OUTPUT -t
      // at the tail of the command instead.
      command += ` ${trimSeek}${musicLoop}-i ${this.quotePath(musicTrack.uri)}`;
    }

    // --- filter_complex graph ---
    // The video chain always ends with [vout] so -map has a consistent label.
    // If nothing needs filter_complex on video (no filter/text/stickers) and
    // no audio processing either, skip filter_complex entirely.
    const graph: string[] = [];
    let videoLabel = '[0:v]';

    if (baseFilters.length > 0) {
      // Determine the output label for the base chain:
      // If stickers follow, intermediate label is [base]; otherwise final is [vout].
      const baseOutLabel = stickerParts.length > 0 ? '[base]' : '[vout]';
      graph.push(`[0:v]${baseFilters.join(',')}${baseOutLabel}`);
      videoLabel = baseOutLabel;
    }

    stickerParts.forEach((p, i) => {
      // Scale filter uses the label already set by overlayImage (s${inputIndex}).
      graph.push(p.scale);
      const inLabel = videoLabel; // previous stage output
      const stickerLabel = `[s${i + 1}]`;
      const outLabel = i === stickerParts.length - 1 ? '[vout]' : `[v${i}]`;
      graph.push(`${inLabel}${stickerLabel}${p.overlay}${outLabel}`);
      videoLabel = outLabel;
    });

    const audioGraph = this.audioGraph(
      musicTrack,
      originalMuted,
      musicInputIndex,
      !isImage && sourceHasAudio
    );
    if (audioGraph) graph.push(audioGraph);

    if (graph.length > 0) {
      command += ` -filter_complex "${graph.join(';')}"`;
      // If the video chain went through filter_complex, map [vout]; else map stream 0:v directly.
      if (videoLabel !== '[0:v]') {
        command += ` -map "[vout]"`;
      } else {
        command += ' -map 0:v';
      }
      command += audioGraph ? ' -map "[aout]"' : ' -map 0:a?';
    }

    // When filter_complex is active, ffmpeg-kit auto-rotates decoded frames (respects
    // the source 'rotate' metadata tag) before sending them into the graph.  After
    // the graph the frames are already correctly oriented, but some builds still copy
    // the original rotate tag to the output, causing the player to rotate them a
    // second time.  Zero out the tag so the player sees pre-rotated frames with no
    // extra rotation instruction.
    if (graph.length > 0) {
      command += ' -map_metadata 0 -metadata:s:v:0 rotate=0';
    }

    // Image sources are an INFINITELY looped input stream (-loop 1, see the
    // input section above) — this output-side -t is the one and only thing
    // bounding the encode. It must be an OUTPUT option (i.e. after all -i's)
    // so it caps the muxed result deterministically no matter how many
    // looping inputs (image, -stream_loop'd music/GIFs) are present;
    // -shortest alone cannot end an encode where EVERY stream loops forever.
    const outputDuration = isImage ? ` -t ${IMAGE_SOURCE_DURATION_SECONDS}` : '';
    // -shortest bounds looped GIF/music inputs to the video's natural end —
    // needed ONLY for the video case. For the image case it's redundant
    // (the -t above is the bound) and actively harmful: ffmpeg-kit ships
    // ffmpeg 6.0, where -shortest runs through the muxer's sync-queue and
    // can force-finish the FASTER stream when the slow async videotoolbox
    // video encode lags behind audio — confirmed empirically (image+music
    // export produced a 15s video with the audio track truncated at ~6.6s;
    // same command without -shortest yields full 15s/15s, verified on both
    // a full-length and a short -stream_loop'd mp3).
    const shortestFlag = isImage ? '' : ' -shortest';
    command += `${outputDuration} ${this.qualityArgs(quality, videoEncoder)}${shortestFlag} -y ${this.quotePath(outputPath)}`;
    return command;
  }
}
