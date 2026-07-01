import type {
  VideoSegment,
  TextOverlay,
  StickerOverlay,
  AudioTrack,
  FilterPreset,
  Effect,
  CropRegion,
  ExportQuality,
} from './types';
import { applyIntensity, getFilterByPreset } from '../filters/presets';

/**
 * Builds FFmpeg command strings for all video editing operations.
 * Used by ExportPipeline to generate the final FFmpeg command.
 */
export class FFmpegCommandBuilder {
  // --- Trim ---

  static trim(inputPath: string, outputPath: string, start: number, end: number): string {
    return `-i "${inputPath}" -ss ${start.toFixed(3)} -to ${end.toFixed(3)} -c copy "${outputPath}"`;
  }

  // --- Speed ---

  static speed(factor: number): string {
    if (factor === 1) return '';

    const videoPts = `setpts=${(1 / factor).toFixed(4)}*PTS`;

    // atempo only supports 0.5-100.0 range
    // For extreme speeds, chain multiple atempo filters
    const audioFilters: string[] = [];
    let remaining = factor;
    while (remaining > 2.0) {
      audioFilters.push('atempo=2.0');
      remaining /= 2.0;
    }
    while (remaining < 0.5) {
      audioFilters.push('atempo=0.5');
      remaining /= 0.5;
    }
    audioFilters.push(`atempo=${remaining.toFixed(4)}`);

    return `-filter:v "${videoPts}" -filter:a "${audioFilters.join(',')}"`;
  }

  // --- Volume ---

  static volume(level: number): string {
    if (level === 1) return '';
    return `-filter:a "volume=${level.toFixed(2)}"`;
  }

  // --- Crop ---

  static crop(region: CropRegion): string {
    return `crop=${Math.round(region.width)}:${Math.round(region.height)}:${Math.round(region.x)}:${Math.round(region.y)}`;
  }

  // --- Rotate ---

  static rotate(degrees: 0 | 90 | 180 | 270): string {
    switch (degrees) {
      case 0:
        return '';
      case 90:
        return 'transpose=1';
      case 180:
        return 'transpose=1,transpose=1';
      case 270:
        return 'transpose=2';
    }
  }

  // --- Color Conversion ---

  /**
   * Convert any CSS color to FFmpeg-safe hex format.
   * FFmpeg doesn't support # (comment char) or rgba() (commas break filter parsing).
   * Output: 0xRRGGBB or 0xRRGGBBAA
   */
  private static toFFmpegColor(color: string): string {
    // #RRGGBB or #RRGGBBAA → 0xRRGGBB / 0xRRGGBBAA
    if (color.startsWith('#')) {
      return color.replace('#', '0x');
    }

    // rgba(r, g, b, a) → 0xRRGGBBAA
    const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
    if (rgbaMatch) {
      const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
      if (rgbaMatch[4] !== undefined) {
        const a = Math.round(parseFloat(rgbaMatch[4]) * 255).toString(16).padStart(2, '0');
        return `0x${r}${g}${b}${a}`;
      }
      return `0x${r}${g}${b}`;
    }

    // Named colors or already 0x — pass through
    return color;
  }

  // --- Text Overlay ---

  static drawText(
    overlay: TextOverlay,
    videoWidth: number,
    videoHeight: number,
    previewWidth?: number,
    /** Segment start in source time — enable window is segment-local after `-ss`. */
    timeOffset: number = 0,
    /** Segment speed — setpts divides output timestamps, so enable scales too. */
    speed: number = 1
  ): string {
    const escapedText = overlay.text.replace(/'/g, "\\'").replace(/:/g, '\\:');

    // Scale fontSize from preview coordinates to actual video resolution.
    // In preview, text is rendered at (fontSize * scale) on a screen-width canvas.
    // FFmpeg renders at full video resolution, so we need to scale up proportionally.
    const scaleFactor = previewWidth && previewWidth > 0 ? videoWidth / previewWidth : 1;
    const exportFontSize = Math.round(overlay.fontSize * overlay.scale * scaleFactor);

    const fontColor = this.toFFmpegColor(overlay.color);

    // Preview anchors the text box at its center (position = center, normalized).
    // Mirror that here so export placement matches: x/y are top-left, so subtract
    // half the rendered text box (text_w/text_h are evaluated by FFmpeg at runtime).
    const px = overlay.position.x.toFixed(4);
    const py = overlay.position.y.toFixed(4);

    let filter = `drawtext=text='${escapedText}'`;
    filter += `:fontsize=${exportFontSize}`;
    filter += `:fontcolor=${fontColor}`;
    filter += `:x=${px}*w-text_w/2`;
    filter += `:y=${py}*h-text_h/2`;

    if (overlay.backgroundColor) {
      const bgColor = this.toFFmpegColor(overlay.backgroundColor);
      const scaledPadding = Math.round(8 * scaleFactor);
      filter += `:box=1:boxcolor=${bgColor}:boxborderw=${scaledPadding}`;
    }

    // Segment is cut with `-ss timeOffset`, so FFmpeg's clock restarts at 0 for this
    // segment. Convert the overlay's source-time window into segment-local time, then
    // divide by speed (setpts compresses/stretches the output timeline). Clamp to >=0
    // so overlays spanning a split boundary still show on each kept piece.
    const safeSpeed = speed > 0 ? speed : 1;
    const localStart = Math.max(0, (overlay.startTime - timeOffset) / safeSpeed);
    const localEnd = Math.max(0, (overlay.endTime - timeOffset) / safeSpeed);
    filter += `:enable='between(t,${localStart.toFixed(3)},${localEnd.toFixed(3)})'`;

    return filter;
  }

  // --- Sticker/Image Overlay ---

  static overlayImage(
    overlay: StickerOverlay,
    inputIndex: number,
    videoWidth: number,
    videoHeight: number,
    /** Segment start in source time — enable window is segment-local after `-ss`. */
    timeOffset: number = 0,
    /** Segment speed — setpts on the base stream rescales timestamps. */
    speed: number = 1
  ): { inputs: string; filter: string } {
    const x = Math.round(overlay.position.x * videoWidth);
    const y = Math.round(overlay.position.y * videoHeight);
    const w = Math.round(overlay.size.width * overlay.scale);
    const h = Math.round(overlay.size.height * overlay.scale);

    const safeSpeed = speed > 0 ? speed : 1;
    const localStart = Math.max(0, (overlay.startTime - timeOffset) / safeSpeed);
    const localEnd = Math.max(localStart, (overlay.endTime - timeOffset) / safeSpeed);

    const inputs = `-i "${overlay.uri}"`;
    const scaleLabel = `s${inputIndex}`;
    const filter =
      `[${inputIndex}:v]scale=${w}:${h}[${scaleLabel}];` +
      `[0:v][${scaleLabel}]overlay=${x}:${y}:enable='between(t,${localStart.toFixed(3)},${localEnd.toFixed(3)})'`;

    return { inputs, filter };
  }

  // --- Audio Mix ---

  static audioMix(
    tracks: AudioTrack[],
    originalVolume: number
  ): string {
    if (tracks.length === 0 && originalVolume === 1) return '';

    const parts: string[] = [];

    // Original audio with volume
    parts.push(`[0:a]volume=${originalVolume.toFixed(2)}[a0]`);

    // Additional audio tracks
    tracks.forEach((track, i) => {
      parts.push(
        `[${i + 1}:a]volume=${track.volume.toFixed(2)},adelay=${Math.round(track.startTime * 1000)}|${Math.round(track.startTime * 1000)}[a${i + 1}]`
      );
    });

    // Mix all
    const inputLabels = tracks.map((_, i) => `[a${i}]`).concat(tracks.map((_, i) => `[a${i + 1}]`));
    const allLabels = Array.from({ length: tracks.length + 1 }, (_, i) => `[a${i}]`).join('');
    parts.push(`${allLabels}amix=inputs=${tracks.length + 1}:duration=first[aout]`);

    return parts.join(';');
  }

  // --- Filter (LUT) ---

  static lutFilter(lutFilePath: string): string {
    return `lut3d="${lutFilePath}"`;
  }

  /**
   * Apply the same 4×5 color matrix as Skia preview (`filters/presets.ts`) using geq.
   * Inputs are treated as 8-bit RGB; alpha column uses implicit 1.0 when m3 ≠ 0.
   */
  private static formatGeqFloat(n: number): string {
    if (!Number.isFinite(n)) return '0';
    if (n === 0) return '0';
    let s = n.toFixed(6);
    s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return s || '0';
  }

  private static geqChannelFromMatrixRow(matrix: number[], row: 0 | 1 | 2): string {
    const b = row * 5;
    const m0 = matrix[b];
    const m1 = matrix[b + 1];
    const m2 = matrix[b + 2];
    const m3 = matrix[b + 3];
    const m4 = matrix[b + 4];

    const terms: string[] = [
      `${this.formatGeqFloat(m0)}*r(X,Y)/255`,
      `${this.formatGeqFloat(m1)}*g(X,Y)/255`,
      `${this.formatGeqFloat(m2)}*b(X,Y)/255`,
    ];
    if (m3 !== 0) {
      terms.push(this.formatGeqFloat(m3));
    }
    if (m4 !== 0) {
      terms.push(this.formatGeqFloat(m4));
    }
    const sum = terms.join('+');
    return `min(255,max(0,255*(${sum})))`;
  }

  private static colorMatrixToGeqFilter(matrix: number[]): string {
    const r = this.geqChannelFromMatrixRow(matrix, 0);
    const g = this.geqChannelFromMatrixRow(matrix, 1);
    const b = this.geqChannelFromMatrixRow(matrix, 2);
    // RGB geq only (no alpha plane) — some mobile FFmpeg builds reject a='255' on rgb24.
    return `format=rgb24,geq=r='${r}':g='${g}':b='${b}',format=yuv420p`;
  }

  // --- Effects ---

  static effect(
    effect: Effect,
    fps: number = 30,
    /** Output canvas for zoompan (post-rotation/crop dims, even numbers). */
    outWidth: number = 1280,
    outHeight: number = 720,
    /** Segment start in source time — enable window is segment-local after `-ss`. */
    timeOffset: number = 0,
    /** Segment speed — setpts precedes effects in the chain, so windows scale. */
    speed: number = 1
  ): string {
    const safeSpeed = speed > 0 ? speed : 1;
    const start = Math.max(0, (effect.startTime - timeOffset) / safeSpeed);
    const end = Math.max(start, (effect.startTime + effect.duration - timeOffset) / safeSpeed);
    const dur = Math.max(0.001, end - start);
    const S = start.toFixed(3);
    const E = end.toFixed(3);
    const D = dur.toFixed(3);
    const enable = `enable='between(t,${S},${E})'`;
    // zoompan needs an explicit even output size; hd1080 distorted other resolutions.
    const w = Math.max(2, outWidth - (outWidth % 2));
    const h = Math.max(2, outHeight - (outHeight % 2));

    switch (effect.type) {
      // zoompan does not support timeline enable — gate via `it` (input time) in
      // the z expression instead, ramping zoom over the effect window.
      case 'zoom_in':
        return `zoompan=z='if(between(it,${S},${E}),min(1+0.5*(it-${S})/${D},1.5),1)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}`;

      case 'zoom_out':
        return `zoompan=z='if(between(it,${S},${E}),max(1.5-0.5*(it-${S})/${D},1),1)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}`;

      case 'glitch':
        return `rgbashift=rh=-5:gh=3:bh=7:${enable},noise=alls=20:allf=t:${enable}`;

      case 'vhs':
        return `noise=alls=30:allf=t:${enable},eq=contrast=1.1:brightness=0.05:${enable},rgbashift=rh=3:bv=-2:${enable}`;

      case 'soul':
        return `split[a][b];[b]fade=t=in:st=${S}:d=0.5,setpts=PTS+0.1/TB[b];[a][b]overlay=format=auto:${enable}`;

      // Constant-dimension shake: crop a fixed 20px-smaller canvas for the whole
      // clip (jitter x/y only inside the window), then scale back to input size.
      // Keeps frame dims stable so concat -c copy works across segments.
      case 'shake':
        return `crop=iw-20:ih-20:'10+if(between(t,${S},${E}),-5+10*random(0),0)':'10+if(between(t,${S},${E}),-5+10*random(1),0)',scale=iw+20:ih+20`;

      case 'flash':
        return `eq=brightness='0.3*sin(2*PI*(t-${S})*4)':${enable}`;
    }
  }

  // --- Quality Presets ---

  static qualityArgs(quality: ExportQuality): string {
    switch (quality) {
      case 'low':
        return '-c:v h264 -b:v 2000k -c:a aac -b:a 128k -r 24 -pix_fmt yuv420p';
      case 'medium':
        return '-c:v h264 -b:v 5000k -c:a aac -b:a 192k -r 30 -pix_fmt yuv420p';
      case 'high':
        return '-c:v h264 -b:v 10000k -c:a aac -b:a 256k -r 30 -pix_fmt yuv420p';
    }
  }

  // --- Concat ---

  static concatFile(segmentPaths: string[]): string {
    return segmentPaths.map((p) => `file '${p}'`).join('\n');
  }

  static concat(concatFilePath: string, outputPath: string): string {
    return `-f concat -safe 0 -i "${concatFilePath}" -c copy "${outputPath}"`;
  }

  // --- Build Complex Filter Graph ---

  static buildFilterGraph(options: {
    segment: VideoSegment;
    crop?: CropRegion | null;
    filter?: FilterPreset;
    filterIntensity?: number;
    effects?: Effect[];
    textOverlays?: TextOverlay[];
    videoWidth: number;
    videoHeight: number;
    previewWidth?: number;
    fps?: number;
    /** Segment start in source time, used to localize text/effect enable windows. */
    timeOffset?: number;
  }): string {
    const filters: string[] = [];
    const { segment, crop, filter, filterIntensity = 1, effects, textOverlays, videoWidth, videoHeight, previewWidth, fps = 30, timeOffset = 0 } = options;

    // Speed
    if (segment.speed !== 1) {
      filters.push(`setpts=${(1 / segment.speed).toFixed(4)}*PTS`);
    }

    // Rotation
    const rotFilter = this.rotate(segment.rotation);
    if (rotFilter) filters.push(rotFilter);

    // Crop
    if (crop) filters.push(this.crop(crop));

    // Color matrix (same source as Skia preview) + intensity via applyIntensity
    if (filter && filter !== 'normal' && filterIntensity > 0) {
      const def = getFilterByPreset(filter);
      const matrix = applyIntensity(def.colorMatrix, filterIntensity);
      filters.push(this.colorMatrixToGeqFilter(matrix));
    }

    // Effects — canvas dims after rotation/crop (zoompan needs explicit size)
    if (effects) {
      const rotated = segment.rotation === 90 || segment.rotation === 270;
      const effW = crop ? Math.round(crop.width) : rotated ? videoHeight : videoWidth;
      const effH = crop ? Math.round(crop.height) : rotated ? videoWidth : videoHeight;
      for (const effect of effects) {
        const effFilter = this.effect(effect, fps, effW, effH, timeOffset, segment.speed);
        if (effFilter) filters.push(effFilter);
      }
    }

    // Text overlays
    if (textOverlays) {
      for (const text of textOverlays) {
        filters.push(this.drawText(text, videoWidth, videoHeight, previewWidth, timeOffset, segment.speed));
      }
    }

    return filters.join(',');
  }
}
