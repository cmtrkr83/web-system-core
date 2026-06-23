import type { GridAnchors, NormalizedRect, OpticAreaConfig, BubblePosition } from "./types";

export function defaultGridAnchors(questionCount: number, optionCount: number): GridAnchors {
  const insetX = 0.5 / Math.max(optionCount, 1);
  const insetY = 0.5 / Math.max(questionCount, 1);
  return {
    topLeft: { x: insetX, y: insetY },
    topRight: { x: 1 - insetX, y: insetY },
    bottomLeft: { x: insetX, y: 1 - insetY },
    bottomRight: { x: 1 - insetX, y: 1 - insetY },
  };
}

export function resolveGridAnchors(area: OpticAreaConfig): GridAnchors {
  return area.gridAnchors ?? defaultGridAnchors(area.questionCount, area.optionCount);
}

export function getBubbleCenterInArea(
  anchors: GridAnchors,
  row: number,
  col: number,
  questionCount: number,
  optionCount: number,
): { x: number; y: number } {
  const ty = questionCount <= 1 ? 0 : row / (questionCount - 1);
  const tx = optionCount <= 1 ? 0 : col / (optionCount - 1);

  const x =
    (1 - tx) * (1 - ty) * anchors.topLeft.x +
    tx * (1 - ty) * anchors.topRight.x +
    (1 - tx) * ty * anchors.bottomLeft.x +
    tx * ty * anchors.bottomRight.x;

  const y =
    (1 - tx) * (1 - ty) * anchors.topLeft.y +
    tx * (1 - ty) * anchors.topRight.y +
    (1 - tx) * ty * anchors.bottomLeft.y +
    tx * ty * anchors.bottomRight.y;

  return { x, y };
}

export function getBubbleCenterPixels(
  imageWidth: number,
  imageHeight: number,
  area: OpticAreaConfig,
  row: number,
  col: number,
): { cx: number; cy: number; radius: number } {
  const anchors = resolveGridAnchors(area);
  const rel = getBubbleCenterInArea(anchors, row, col, area.questionCount, area.optionCount);

  const x0 = area.rect.x * imageWidth;
  const y0 = area.rect.y * imageHeight;
  const areaW = area.rect.w * imageWidth;
  const areaH = area.rect.h * imageHeight;

  const cellW = areaW / Math.max(area.optionCount, 1);
  const cellH = areaH / Math.max(area.questionCount, 1);
  const radius = Math.max(3, Math.floor(Math.min(cellW, cellH) * 0.32));

  return {
    cx: x0 + rel.x * areaW,
    cy: y0 + rel.y * areaH,
    radius,
  };
}

export function getAllBubblePositions(
  imageWidth: number,
  imageHeight: number,
  area: OpticAreaConfig,
): BubblePosition[] {
  const letters = area.optionCount === 5 ? ["A", "B", "C", "D", "E"] : ["A", "B", "C", "D"];
  const positions: BubblePosition[] = [];

  for (let row = 0; row < area.questionCount; row++) {
    for (let col = 0; col < area.optionCount; col++) {
      const { cx, cy } = getBubbleCenterPixels(imageWidth, imageHeight, area, row, col);
      positions.push({ row, col, letter: letters[col], cx, cy });
    }
  }

  return positions;
}

export function pageToAreaNormalized(
  pageX: number,
  pageY: number,
  areaRect: NormalizedRect,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(1, (pageX - areaRect.x) / areaRect.w)),
    y: Math.max(0, Math.min(1, (pageY - areaRect.y) / areaRect.h)),
  };
}

export function normalizeDrawnRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): NormalizedRect {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    w: Math.max(0.005, Math.min(1 - x, w)),
    h: Math.max(0.005, Math.min(1 - y, h)),
  };
}

export function frameRectToCorners(
  frameRect: NormalizedRect,
  width: number,
  height: number,
): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
  const x0 = frameRect.x * width;
  const y0 = frameRect.y * height;
  const x1 = (frameRect.x + frameRect.w) * width;
  const y1 = (frameRect.y + frameRect.h) * height;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}
