import type { GridAnchors, NormalizedRect, OpticAreaConfig, OpticSheetConfig } from "./types";

const A4_WIDTH_PX = 595;
const A4_HEIGHT_PX = 842;

function normalizeRect(rect: { x?: number; y?: number; w?: number; h?: number }): NormalizedRect | null {
  if (rect.x == null || rect.y == null || rect.w == null || rect.h == null) return null;
  const isNormalized = rect.x <= 1 && rect.y <= 1 && rect.w <= 1 && rect.h <= 1;
  return isNormalized
    ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
    : {
        x: rect.x / A4_WIDTH_PX,
        y: rect.y / A4_HEIGHT_PX,
        w: rect.w / A4_WIDTH_PX,
        h: rect.h / A4_HEIGHT_PX,
      };
}

function normalizeAnchors(raw: unknown): GridAnchors | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, { x?: number; y?: number }>;
  if (!a.topLeft || !a.topRight || !a.bottomLeft || !a.bottomRight) return undefined;
  if (a.topLeft.x == null || a.topLeft.y == null) return undefined;
  return {
    topLeft: { x: a.topLeft.x, y: a.topLeft.y },
    topRight: { x: a.topRight.x!, y: a.topRight.y! },
    bottomLeft: { x: a.bottomLeft.x!, y: a.bottomLeft.y! },
    bottomRight: { x: a.bottomRight.x!, y: a.bottomRight.y! },
  };
}

export function normalizeOpticConfig(raw: Record<string, unknown>): OpticSheetConfig | null {
  const areasRaw = Array.isArray(raw.areas) ? [...raw.areas] : [];

  if (!areasRaw.length && raw.rect && typeof raw.rect === "object") {
    areasRaw.push({
      id: `area-${raw.id ?? "legacy"}`,
      subject: raw.subject ?? "Genel",
      rect: raw.rect,
      rows: raw.rows,
      cols: raw.cols,
      pageIndex: 0,
    });
  }

  const areas = areasRaw
    .map((area) => normalizeArea(area as Record<string, unknown>))
    .filter((area): area is OpticAreaConfig => Boolean(area));

  if (!areas.length) return null;

  const frameRect =
    raw.frameRect && typeof raw.frameRect === "object"
      ? normalizeRect(raw.frameRect as { x?: number; y?: number; w?: number; h?: number })
      : undefined;

  return {
    id: String(raw.id ?? Date.now()),
    fileName: typeof raw.fileName === "string" ? raw.fileName : undefined,
    pageCount: typeof raw.pageCount === "number" ? raw.pageCount : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    frameRect: frameRect ?? undefined,
    areas,
  };
}

function normalizeArea(area: Record<string, unknown>): OpticAreaConfig | null {
  const rect = area.rect as { x?: number; y?: number; w?: number; h?: number } | undefined;
  if (!rect) return null;
  const normalizedRect = normalizeRect(rect);
  if (!normalizedRect) return null;

  const questionCount = Number(area.questionCount ?? area.rows ?? 0);
  const optionCount = Number(area.optionCount ?? area.cols ?? 4);

  if (!questionCount || questionCount < 1) return null;

  return {
    id: String(area.id ?? `area-${Date.now()}`),
    pageIndex: Number(area.pageIndex ?? 0),
    subject: String(area.subject ?? "Genel").trim(),
    questionCount,
    optionCount: optionCount === 5 ? 5 : 4,
    rect: normalizedRect,
    gridAnchors: normalizeAnchors(area.gridAnchors),
  };
}

export function pickBestConfig(configs: Record<string, unknown>[]): OpticSheetConfig | null {
  const normalized = configs
    .map(normalizeOpticConfig)
    .filter((config): config is OpticSheetConfig => Boolean(config));

  if (!normalized.length) return null;

  return normalized.sort((a, b) => {
    const aScore =
      a.areas.length +
      (a.frameRect ? 20 : 0) +
      a.areas.filter((ar) => ar.gridAnchors).length * 5;
    const bScore =
      b.areas.length +
      (b.frameRect ? 20 : 0) +
      b.areas.filter((ar) => ar.gridAnchors).length * 5;
    if (bScore !== aScore) return bScore - aScore;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  })[0];
}
