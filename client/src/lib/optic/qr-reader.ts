import jsQR from "jsqr";

const SCAN_REGIONS = [
  { x: 0.55, y: 0, w: 0.45, h: 0.35 },
  { x: 0, y: 0, w: 0.45, h: 0.35 },
  { x: 0.3, y: 0, w: 0.4, h: 0.5 },
  { x: 0, y: 0, w: 1, h: 1 },
];

export function readQrFromImageData(imageData: ImageData): string | null {
  const attempts = [
    imageData,
    invertImageData(imageData),
    ...SCAN_REGIONS.map((region) => cropRegion(imageData, region)),
  ];

  for (const attempt of attempts) {
    const code = jsQR(attempt.data, attempt.width, attempt.height, {
      inversionAttempts: "attemptBoth",
    });
    if (code?.data) return code.data.trim();
  }

  return null;
}

export function parseQrFields(qrData: string): Record<string, string> {
  if (!qrData) return {};

  try {
    const parsed = JSON.parse(qrData);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        fields[key] = String(value ?? "");
      }
      return fields;
    }
  } catch {
    // not JSON
  }

  if (qrData.includes("|")) {
    const parts = qrData.split("|").map((p) => p.trim());
    const keys = ["tc", "name", "schoolNo", "schoolCode", "class", "district", "studentNumber"];
    const fields: Record<string, string> = { raw: qrData };
    parts.forEach((part, index) => {
      fields[keys[index] ?? `field${index + 1}`] = part;
    });
    return fields;
  }

  if (qrData.includes(";")) {
    const parts = qrData.split(";").map((p) => p.trim());
    const fields: Record<string, string> = { raw: qrData };
    parts.forEach((part, index) => {
      fields[`field${index + 1}`] = part;
    });
    return fields;
  }

  return { raw: qrData };
}

function cropRegion(
  source: ImageData,
  region: { x: number; y: number; w: number; h: number },
): ImageData {
  const x0 = Math.floor(region.x * source.width);
  const y0 = Math.floor(region.y * source.height);
  const w = Math.floor(region.w * source.width);
  const h = Math.floor(region.h * source.height);
  const cropped = new ImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = ((y0 + y) * source.width + (x0 + x)) * 4;
      const dstIdx = (y * w + x) * 4;
      cropped.data[dstIdx] = source.data[srcIdx];
      cropped.data[dstIdx + 1] = source.data[srcIdx + 1];
      cropped.data[dstIdx + 2] = source.data[srcIdx + 2];
      cropped.data[dstIdx + 3] = source.data[srcIdx + 3];
    }
  }

  return cropped;
}

function invertImageData(source: ImageData): ImageData {
  const inverted = new ImageData(source.width, source.height);
  for (let i = 0; i < source.data.length; i += 4) {
    inverted.data[i] = 255 - source.data[i];
    inverted.data[i + 1] = 255 - source.data[i + 1];
    inverted.data[i + 2] = 255 - source.data[i + 2];
    inverted.data[i + 3] = source.data[i + 3];
  }
  return inverted;
}
