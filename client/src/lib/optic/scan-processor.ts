import { detectAnswerFrameBorder } from "./border-detector";
import { readAreaBubbles, computeAreaAlignmentScore } from "./bubble-reader";
import { frameRectToCorners } from "./grid-positions";
import { warpPerspective, rotateImageData } from "./image-utils";
import { readQrFromImageData, parseQrFields } from "./qr-reader";
import type { AreaResult, NormalizedRect, OpticAreaConfig, OpticSheetConfig, PageScanResult } from "./types";

const BORDER_CONFIDENCE_THRESHOLD = 0.25;
const MAX_SKEW_CORRECTION = (12 * Math.PI) / 180;

function remapAreasToWarped(
  areas: OpticAreaConfig[],
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
): OpticAreaConfig[] {
  return areas.map((area) => ({
    ...area,
    rect: {
      x: (area.rect.x - offsetX) / scaleX,
      y: (area.rect.y - offsetY) / scaleY,
      w: area.rect.w / scaleX,
      h: area.rect.h / scaleY,
    },
  }));
}

function applyFrameWarp(
  imageData: ImageData,
  frameRect: NormalizedRect,
  areas: OpticAreaConfig[],
): { workingImage: ImageData; areas: OpticAreaConfig[]; borderDetected: boolean } {
  const corners = frameRectToCorners(frameRect, imageData.width, imageData.height);
  const dstWidth = Math.max(1, Math.round(frameRect.w * imageData.width));
  const dstHeight = Math.max(1, Math.round(frameRect.h * imageData.height));
  const workingImage = warpPerspective(imageData, corners, dstWidth, dstHeight);

  return {
    workingImage,
    areas: remapAreasToWarped(areas, frameRect.x, frameRect.y, frameRect.w, frameRect.h),
    borderDetected: true,
  };
}

export function processPage(
  imageData: ImageData,
  pageIndex: number,
  config: OpticSheetConfig,
): PageScanResult {
  const warnings: string[] = [];
  const pageAreas = config.areas.filter((area) => area.pageIndex === pageIndex);
  const templateAreas = config.areas.filter((area) => (area.pageIndex ?? 0) === 0);
  let areasToRead = pageAreas.length ? pageAreas : templateAreas;

  if (!areasToRead.length) {
    warnings.push("Bu sayfa icin tanimli cevap alani bulunamadi.");
    return {
      pageIndex,
      qrData: "",
      qrFields: {},
      areas: [],
      warnings,
      skewAngle: 0,
      borderDetected: false,
    };
  }

  let workingImage = imageData;
  let skewAngle = 0;
  let borderDetected = false;

  if (config.frameRect && config.frameRect.w > 0.01 && config.frameRect.h > 0.01) {
    const warped = applyFrameWarp(imageData, config.frameRect, areasToRead);
    workingImage = warped.workingImage;
    areasToRead = warped.areas;
    borderDetected = true;
  } else {
    const border = detectAnswerFrameBorder(imageData, areasToRead.map((a) => a.rect));
    if (border) {
      console.log(`[Optic Scan] Border detected: confidence=${border.confidence.toFixed(3)}, skewAngle=${(border.skewAngle * 180 / Math.PI).toFixed(2)}°`);
      if (border.confidence >= BORDER_CONFIDENCE_THRESHOLD) {
        borderDetected = true;
        skewAngle = border.skewAngle;

        const dstWidth = Math.round(border.rect.w * 1.02);
        const dstHeight = Math.round(border.rect.h * 1.02);
        workingImage = warpPerspective(imageData, border.corners, dstWidth, dstHeight);

        const offsetX = border.rect.x / imageData.width;
        const offsetY = border.rect.y / imageData.height;
        const scaleX = border.rect.w / imageData.width;
        const scaleY = border.rect.h / imageData.height;

        areasToRead = remapAreasToWarped(areasToRead, offsetX, offsetY, scaleX, scaleY);
      } else {
        warnings.push("Kenarlik algilandi ancak guven dusuk; duzeltme uygulanmadi.");
        skewAngle = border.skewAngle;
        if (Math.abs(skewAngle) > 0.005 && Math.abs(skewAngle) <= MAX_SKEW_CORRECTION) {
          workingImage = rotateImageData(imageData, -skewAngle);
          warnings.push("Hafif egim duzeltmesi uygulandi.");
        }
      }
    } else {
      console.log("[Optic Scan] No border detected");
      warnings.push("Siyah cerceve bulunamadi. Kalibrasyon sekmesinden cerceve cizin.");
    }
  }

  const qrData = readQrFromImageData(imageData) ?? "";
  if (!qrData) warnings.push("Karekod okunamadi.");

  const qrFields = parseQrFields(qrData);
  const areas: AreaResult[] = areasToRead.map((area) => {
    const answers = readAreaBubbles(workingImage, area);
    const blankCount = answers.filter((a) => a.answer === "").length;
    if (blankCount === answers.length) {
      warnings.push(`${area.subject}: hic isaret algilanmadi.`);
    }
    if (!area.gridAnchors) {
      warnings.push(`${area.subject}: baloncuk kalibrasyonu yapilmamis; kayma olabilir.`);
    }

    return {
      areaId: area.id,
      pageIndex,
      subject: area.subject,
      answers,
      alignmentScore: computeAreaAlignmentScore(answers),
    };
  });

  return {
    pageIndex,
    qrData,
    qrFields,
    areas,
    warnings,
    skewAngle,
    borderDetected,
  };
}
