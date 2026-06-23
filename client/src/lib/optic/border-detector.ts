import type { NormalizedRect, Point } from "./types";
import { getLuminance } from "./image-utils";

const BORDER_LUMINANCE_THRESHOLD = 90; // Slightly lower to detect borders in varied lighting
const MIN_BORDER_RUN_RATIO = 0.25; // Reduced to detect partial borders at high skew

export interface BorderDetectionResult {
  corners: [Point, Point, Point, Point];
  rect: { x: number; y: number; w: number; h: number };
  confidence: number;
  skewAngle: number;
}

export function detectAnswerFrameBorder(
  imageData: ImageData,
  hintRects: NormalizedRect[],
): BorderDetectionResult | null {
  const { width, height, data } = imageData;
  if (!hintRects.length) return null;

  const bounds = expandBounds(hintRects, 0.04);
  const searchX0 = Math.max(0, Math.floor(bounds.x * width));
  const searchY0 = Math.max(0, Math.floor(bounds.y * height));
  const searchX1 = Math.min(width - 1, Math.ceil((bounds.x + bounds.w) * width));
  const searchY1 = Math.min(height - 1, Math.ceil((bounds.y + bounds.h) * height));
  const searchW = searchX1 - searchX0;
  const searchH = searchY1 - searchY0;

  if (searchW < 40 || searchH < 40) return null;

  const isDark = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return getLuminance(data[idx], data[idx + 1], data[idx + 2]) < BORDER_LUMINANCE_THRESHOLD;
  };

  const horizontalRun = (y: number, xStart: number, xEnd: number) => {
    let maxRun = 0;
    let run = 0;
    for (let x = xStart; x <= xEnd; x++) {
      if (isDark(x, y)) {
        run++;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 0;
      }
    }
    return maxRun;
  };

  const verticalRun = (x: number, yStart: number, yEnd: number) => {
    let maxRun = 0;
    let run = 0;
    for (let y = yStart; y <= yEnd; y++) {
      if (isDark(x, y)) {
        run++;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 0;
      }
    }
    return maxRun;
  };

  const minHorizRun = searchW * MIN_BORDER_RUN_RATIO;
  const minVertRun = searchH * MIN_BORDER_RUN_RATIO;

  let top = searchY0;
  let bottom = searchY1;
  let left = searchX0;
  let right = searchX1;

  for (let y = searchY0; y <= searchY1; y++) {
    if (horizontalRun(y, searchX0, searchX1) >= minHorizRun) {
      top = y;
      break;
    }
  }

  for (let y = searchY1; y >= searchY0; y--) {
    if (horizontalRun(y, searchX0, searchX1) >= minHorizRun) {
      bottom = y;
      break;
    }
  }

  for (let x = searchX0; x <= searchX1; x++) {
    if (verticalRun(x, top, bottom) >= minVertRun) {
      left = x;
      break;
    }
  }

  for (let x = searchX1; x >= searchX0; x--) {
    if (verticalRun(x, top, bottom) >= minVertRun) {
      right = x;
      break;
    }
  }

  const frameW = right - left;
  const frameH = bottom - top;
  if (frameW < searchW * 0.5 || frameH < searchH * 0.5) return null;

  const corners = refineCorners(imageData, left, top, right, bottom);
  const skewAngle = estimateSkewAngle(corners);

  const topScore = horizontalRun(top, left, right) / frameW;
  const bottomScore = horizontalRun(bottom, left, right) / frameW;
  const leftScore = verticalRun(left, top, bottom) / frameH;
  const rightScore = verticalRun(right, top, bottom) / frameH;
  const confidence = (topScore + bottomScore + leftScore + rightScore) / 4;

  return {
    corners,
    rect: { x: left, y: top, w: frameW, h: frameH },
    confidence,
    skewAngle,
  };
}

function refineCorners(
  imageData: ImageData,
  left: number,
  top: number,
  right: number,
  bottom: number,
): [Point, Point, Point, Point] {
  const searchRadius = 12;
  const { width, height, data } = imageData;

  const cornerScore = (x: number, y: number) => {
    let dark = 0;
    let total = 0;
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        total++;
        const idx = (py * width + px) * 4;
        if (getLuminance(data[idx], data[idx + 1], data[idx + 2]) < BORDER_LUMINANCE_THRESHOLD) dark++;
      }
    }
    return total ? dark / total : 0;
  };

  const refine = (baseX: number, baseY: number) => {
    let best = { x: baseX, y: baseY, score: -1 };
    for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
      for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
        const x = Math.max(0, Math.min(width - 1, baseX + dx));
        const y = Math.max(0, Math.min(height - 1, baseY + dy));
        const score = cornerScore(x, y);
        if (score > best.score) best = { x, y, score };
      }
    }
    return { x: best.x, y: best.y };
  };

  return [
    refine(left, top),
    refine(right, top),
    refine(right, bottom),
    refine(left, bottom),
  ];
}

function estimateSkewAngle(corners: [Point, Point, Point, Point]): number {
  const topDx = corners[1].x - corners[0].x;
  const topDy = corners[1].y - corners[0].y;
  return Math.atan2(topDy, topDx);
}

function expandBounds(rects: NormalizedRect[], margin: number): NormalizedRect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));

  return {
    x: Math.max(0, x0 - margin),
    y: Math.max(0, y0 - margin),
    w: Math.min(1, x1 - x0 + margin * 2),
    h: Math.min(1, y1 - y0 + margin * 2),
  };
}
