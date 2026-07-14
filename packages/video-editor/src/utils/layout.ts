/** Rect of a source fitted (contain) and centered inside a container. */
export interface FitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * contain-fit math shared by preview and export config: overlay positions are
 * normalized against this rect so letterboxing never skews export placement.
 */
export function fitRect(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): FitRect {
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) {
    return { x: 0, y: 0, width: dstWidth, height: dstHeight };
  }
  const scale = Math.min(dstWidth / srcWidth, dstHeight / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return {
    x: (dstWidth - width) / 2,
    y: (dstHeight - height) / 2,
    width,
    height,
  };
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
