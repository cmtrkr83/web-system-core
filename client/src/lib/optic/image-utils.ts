import type { Point } from "./types";

export function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function cloneImageData(source: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
}

export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d")!.putImageData(imageData, 0, 0);
  return canvas;
}

export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d")!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function rotateImageData(source: ImageData, angleRad: number): ImageData {
  const canvas = imageDataToCanvas(source);
  const rotated = document.createElement("canvas");
  const sin = Math.abs(Math.sin(angleRad));
  const cos = Math.abs(Math.cos(angleRad));
  rotated.width = Math.ceil(source.width * cos + source.height * sin);
  rotated.height = Math.ceil(source.width * sin + source.height * cos);

  const ctx = rotated.getContext("2d")!;
  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate(angleRad);
  ctx.drawImage(canvas, -source.width / 2, -source.height / 2);

  return ctx.getImageData(0, 0, rotated.width, rotated.height);
}

export function warpPerspective(
  source: ImageData,
  srcCorners: [Point, Point, Point, Point],
  dstWidth: number,
  dstHeight: number,
): ImageData {
  const dst = new ImageData(dstWidth, dstHeight);
  const dstCorners: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: dstWidth - 1, y: 0 },
    { x: dstWidth - 1, y: dstHeight - 1 },
    { x: 0, y: dstHeight - 1 },
  ];

  const homography = computeHomography(dstCorners, srcCorners);

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const mapped = applyHomography(homography, x, y);
      const sx = mapped.x;
      const sy = mapped.y;

      if (sx < 0 || sy < 0 || sx >= source.width - 1 || sy >= source.height - 1) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const xFrac = sx - x0;
      const yFrac = sy - y0;

      const dstIndex = (y * dstWidth + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = source.data[(y0 * source.width + x0) * 4 + c];
        const v10 = source.data[(y0 * source.width + x1) * 4 + c];
        const v01 = source.data[(y1 * source.width + x0) * 4 + c];
        const v11 = source.data[(y1 * source.width + x1) * 4 + c];
        const value =
          v00 * (1 - xFrac) * (1 - yFrac) +
          v10 * xFrac * (1 - yFrac) +
          v01 * (1 - xFrac) * yFrac +
          v11 * xFrac * yFrac;
        dst.data[dstIndex + c] = Math.round(value);
      }
    }
  }

  return dst;
}

type Homography = [number, number, number, number, number, number, number, number];

function computeHomography(
  src: [Point, Point, Point, Point],
  dst: [Point, Point, Point, Point],
): Homography {
  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }

  const h = solveLinearSystem8x8(A, B);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
}

function applyHomography(h: Homography, x: number, y: number): Point {
  const denom = h[6] * x + h[7] * y + 1;
  return {
    x: (h[0] * x + h[1] * y + h[2]) / denom,
    y: (h[3] * x + h[4] * y + h[5]) / denom,
  };
}

function solveLinearSystem8x8(matrix: number[][], values: number[]): number[] {
  const m = matrix.map((row, i) => [...row, values[i]]);

  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];

    const pivotVal = m[col][col];
    if (Math.abs(pivotVal) < 1e-10) continue;

    for (let row = col + 1; row < 8; row++) {
      const factor = m[row][col] / pivotVal;
      for (let j = col; j <= 8; j++) m[row][j] -= factor * m[col][j];
    }
  }

  const result = new Array(8).fill(0);
  for (let row = 7; row >= 0; row--) {
    let sum = m[row][8];
    for (let col = row + 1; col < 8; col++) sum -= m[row][col] * result[col];
    result[row] = Math.abs(m[row][row]) < 1e-10 ? 0 : sum / m[row][row];
  }

  return result;
}
