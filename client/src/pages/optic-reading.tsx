import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import jsQR from "jsqr";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type FileKind = "pdf" | "image";

type RectRatio = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Area = {
  id: string;
  pageIndex: number;
  subject: string;
  questionCount: number;
  optionCount: number;
  rect: RectRatio;
};

type SourceFile = {
  file: File;
  fileName: string;
  fileUrl: string;
  kind: FileKind;
  pageCount: number;
};

type LoadedSource = {
  source: SourceFile;
  pdfDocument: any | null;
};

type ScanAnswer = {
  questionNumber: number;
  answer: string;
  confidence: number;
  scores: Array<{ letter: string; score: number }>;
};

type ScanResult = {
  areaId: string;
  pageIndex: number;
  subject: string;
  rect: RectRatio;
  answers: ScanAnswer[];
};

type SavedScanSession = {
  id: string;
  createdAt: string;
  fileName: string;
  pageCount: number;
  qr: string;
  answerCount: number;
};

type Point = { x: number; y: number };
type RectPx = { x: number; y: number; w: number; h: number };

const MAX_RENDER_WIDTH = 1600;
const DEFAULT_QUESTION_COUNT = 10;
const DEFAULT_OPTION_COUNT = 5;
const MIN_RECT_SIZE = 18;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const isPdfFile = (file: File) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const letterForIndex = (index: number) => LETTERS[index] || String.fromCharCode(65 + index);

function createRectFromPoints(start: Point, end: Point): RectPx {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

function normalizeRect(rect: RectPx, width: number, height: number): RectRatio {
  return {
    x: width > 0 ? rect.x / width : 0,
    y: height > 0 ? rect.y / height : 0,
    w: width > 0 ? rect.w / width : 0,
    h: height > 0 ? rect.h / height : 0,
  };
}

function denormalizeRect(rect: RectRatio, width: number, height: number): RectPx {
  return {
    x: rect.x * width,
    y: rect.y * height,
    w: rect.w * width,
    h: rect.h * height,
  };
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = 1;
  canvas.height = 1;
  ctx.clearRect(0, 0, 1, 1);
}

function getPixel(imageData: ImageData, x: number, y: number) {
  const { width, height, data } = imageData;
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  const idx = (py * width + px) * 4;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

function brightness(r: number, g: number, b: number) {
  return (r + g + b) / 3;
}

function isBlackPixel(r: number, g: number, b: number, threshold = 55) {
  return brightness(r, g, b) < threshold && Math.max(r, g, b) - Math.min(r, g, b) < 40;
}

function sampleEdgeHash(imageData: ImageData, x: number, y: number, step: number) {
  const edgePixels: Array<"t" | "r" | "b" | "l"> = [];
  const t = getPixel(imageData, x, y - step);
  const r = getPixel(imageData, x + step, y);
  const b = getPixel(imageData, x, y + step);
  const l = getPixel(imageData, x - step, y);
  if (isBlackPixel(t.r, t.g, t.b)) edgePixels.push("t");
  if (isBlackPixel(r.r, r.g, r.b)) edgePixels.push("r");
  if (isBlackPixel(b.r, b.g, b.b)) edgePixels.push("b");
  if (isBlackPixel(l.r, l.g, l.b)) edgePixels.push("l");
  return edgePixels.join("");
}

function assertBoundingBox(box: { xMin: number; xMax: number; yMin: number; yMax: number }, imageBounds: { width: number; height: number }) {
  if (box.xMin >= box.xMax || box.yMin >= box.yMax) return null;
  const width = box.xMax - box.xMin;
  const height = box.yMax - box.yMin;
  if (width < 10 || height < 10) return null;
  if (width / (box.yMax - box.yMin + 1) > 10) return null;
  if (height / (box.xMax - box.xMin + 1) > 10) return null;
  return { x: box.xMin, y: box.yMin, w: width, h: height };
}

function detectBlackBorderedSections(imageData: ImageData): RectPx[] {
  const { width, height, data } = imageData;
  if (width === 0 || height === 0) return [];

  const visited = new Uint8Array(width * height);
  const stack: Array<{ x: number; y: number; edgeHits: number }> = [];
  const candidates: Array<{ xMin: number; xMax: number; yMin: number; yMax: number; total: number; black: number }> = [];
  const step = Math.max(2, Math.round(Math.min(width, height) * 0.008));

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const edgeHash = sampleEdgeHash(imageData, x, y, step);
      if (edgeHash.length < 2) continue;

      const idx = y * width + x;
      if (visited[idx]) continue;

      let xMin = x;
      let xMax = x;
      let yMin = y;
      let yMax = y;
      let total = 0;
      let black = 0;
      let edgeHits = 0;
      stack.length = 0;

      stack.push({ x, y, edgeHits: 0 });
      visited[idx] = 1;

      let head = 0;
      while (head < stack.length) {
        const { x: cx, y: cy } = stack[head];
        head += 1;

        xMin = Math.min(xMin, cx);
        xMax = Math.max(xMax, cx);
        yMin = Math.min(yMin, cy);
        yMax = Math.max(yMax, cy);

        const pixel = getPixel(imageData, cx, cy);
        total += 1;
        if (isBlackPixel(pixel.r, pixel.g, pixel.b)) black += 1;

        const currentEdge = sampleEdgeHash(imageData, cx, cy, step);
        if (currentEdge.length >= 2) edgeHits += 1;

        const neighbors = [
          { x: cx + step, y: cy },
          { x: cx - step, y: cy },
          { x: cx, y: cy + step },
          { x: cx, y: cy - step },
        ] as const;

        for (const neighbor of neighbors) {
          if (neighbor.x <= 0 || neighbor.x >= width - 1 || neighbor.y <= 0 || neighbor.y >= height - 1) continue;
          const nIdx = neighbor.y * width + neighbor.x;
          if (visited[nIdx]) continue;
          visited[nIdx] = 1;
          stack.push({ x: neighbor.x, y: neighbor.y, edgeHits: 0 });
        }
      }

      if (stack.length >= 80 && edgeHits >= Math.max(6, stack.length * 0.08)) {
        const boxWidth = xMax - xMin;
        const boxHeight = yMax - yMin;
        const ratio = boxWidth / (boxHeight || 1);
        if (ratio > 0.35 && ratio < 3.5) {
          candidates.push({ xMin, xMax, yMin, yMax, total: stack.length, black });
        }
      }
    }
  }

  candidates.sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin);

  const selected: RectPx[] = [];
  for (const candidate of candidates) {
    const rect = assertBoundingBox(candidate, { width, height });
    if (!rect) continue;

    const delta = Math.max(rect.w, rect.h) * (selected.length === 0 ? 0.55 : 0.65);
    const overlap = selected.some((existing) => {
      const dx = Math.max(0, Math.min(existing.x + existing.w, rect.x + rect.w) - Math.max(existing.x, rect.x));
      const dy = Math.max(0, Math.min(existing.y + existing.h, rect.y + rect.h) - Math.max(existing.y, rect.y));
      const minSize = Math.min(existing.w * existing.h, rect.w * rect.h);
      return minSize > 0 && (dx * dy) / minSize > 0.65;
    });
    if (!overlap) {
      selected.push(rect);
    }
  }
  return selected;
}

function loadImage(fileUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = fileUrl;
  });
}

async function renderSourceToCanvas(source: SourceFile, pageIndex: number, canvas: HTMLCanvasElement, pdfDocument: any | null) {
  const context = canvas.getContext("2d");
  if (!context) return false;

  if (source.kind === "image") {
    const image = await loadImage(source.fileUrl);
    const scale = Math.min(MAX_RENDER_WIDTH / image.naturalWidth, 1.75);
    const nextWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const nextHeight = Math.max(1, Math.round(image.naturalHeight * scale));

    canvas.width = nextWidth;
    canvas.height = nextHeight;
    context.clearRect(0, 0, nextWidth, nextHeight);
    context.drawImage(image, 0, 0, nextWidth, nextHeight);
    return true;
  }

  if (!pdfDocument) return false;

  const page = await pdfDocument.getPage(pageIndex + 1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(MAX_RENDER_WIDTH / baseViewport.width, 2.1);
  const viewport = page.getViewport({ scale });

  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  context.clearRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return true;
}

function getCanvasPoint(event: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point {
  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
  const y = ((event.clientY - bounds.top) / bounds.height) * canvas.height;
  return {
    x: clamp(x, 0, canvas.width),
    y: clamp(y, 0, canvas.height),
  };
}

function sampleDarkness(imageData: ImageData, x: number, y: number, radius: number) {
  const { width, height, data } = imageData;
  const left = Math.max(0, Math.floor(x - radius));
  const top = Math.max(0, Math.floor(y - radius));
  const right = Math.min(width - 1, Math.ceil(x + radius));
  const bottom = Math.min(height - 1, Math.ceil(y + radius));

  let total = 0;
  let count = 0;

  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      const idx = (row * width + col) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      total += brightness;
      count += 1;
    }
  }

  if (count === 0) return 0;
  return 255 - total / count;
}

function detectAreaAnswers(canvas: HTMLCanvasElement, area: Area): ScanAnswer[] {
  const context = canvas.getContext("2d");
  if (!context) return [];

  const rect = denormalizeRect(area.rect, canvas.width, canvas.height);
  const imageData = context.getImageData(Math.round(rect.x), Math.round(rect.y), Math.max(1, Math.round(rect.w)), Math.max(1, Math.round(rect.h)));
  const answers: ScanAnswer[] = [];

  for (let questionIndex = 0; questionIndex < area.questionCount; questionIndex += 1) {
    const candidateScores: Array<{ letter: string; score: number }> = [];
    const rowCenterY = ((questionIndex + 0.5) / area.questionCount) * imageData.height;
    const cellWidth = imageData.width / area.optionCount;
    const cellHeight = imageData.height / area.questionCount;
    const radius = Math.max(4, Math.round(Math.min(cellWidth, cellHeight) * 0.18));

    for (let optionIndex = 0; optionIndex < area.optionCount; optionIndex += 1) {
      const letter = letterForIndex(optionIndex);
      const rowCenterX = ((optionIndex + 0.5) / area.optionCount) * imageData.width;
      const darkness = sampleDarkness(imageData, rowCenterX, rowCenterY, radius);
      candidateScores.push({ letter, score: darkness });
    }

    candidateScores.sort((a, b) => b.score - a.score);
    const best = candidateScores[0];
    const runnerUp = candidateScores[1];
    const isConfident = Boolean(best && best.score >= 28 && (!runnerUp || best.score - runnerUp.score >= 6));

    answers.push({
      questionNumber: questionIndex + 1,
      answer: isConfident ? best.letter : "",
      confidence: best?.score ?? 0,
      scores: candidateScores,
    });
  }

  return answers;
}

function detectQrData(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return "";

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
  return qrCode?.data || "";
}

export default function OpticReadingPage() {
  const { toast } = useToast();
  const templateCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const templatePdfRef = useRef<any | null>(null);
  const scanPdfRef = useRef<any | null>(null);
  const drawingStateRef = useRef<{ areaId?: string; startPoint: Point; startRect?: RectRatio } | null>(null);

  const [templateSource, setTemplateSource] = useState<SourceFile | null>(null);
  const [scanSource, setScanSource] = useState<SourceFile | null>(null);
  const [templatePageIndex, setTemplatePageIndex] = useState(0);
  const [scanPageIndex, setScanPageIndex] = useState(0);
  const [selectionMode, setSelectionMode] = useState<"draw" | "move">("draw");
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [defaultSubject, setDefaultSubject] = useState("Genel");
  const [defaultQuestionCount, setDefaultQuestionCount] = useState(DEFAULT_QUESTION_COUNT);
  const [defaultOptionCount, setDefaultOptionCount] = useState(DEFAULT_OPTION_COUNT);
  const [areas, setAreas] = useState<Area[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [tempRect, setTempRect] = useState<RectPx | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanStatus, setScanStatus] = useState("Henüz tarama yapılmadı.");
  const [isScanning, setIsScanning] = useState(false);
  const [templateCanvasSize, setTemplateCanvasSize] = useState({ width: 1, height: 1 });
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [isScanPreviewOpen, setIsScanPreviewOpen] = useState(false);
  const [scanPreviewDataUrl, setScanPreviewDataUrl] = useState<string | null>(null);
  const [savedScans, setSavedScans] = useState<SavedScanSession[]>([]);
  const [isSavedScansLoading, setIsSavedScansLoading] = useState(false);
  const [autoDetectedSections, setAutoDetectedSections] = useState<RectPx[]>([]);
  const [autoDetectStatus, setAutoDetectStatus] = useState("");
  const autoDetectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (autoDetectTimerRef.current) {
        window.clearTimeout(autoDetectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = templateCanvasRef.current;
    if (!canvas || !templateSource || templateCanvasSize.width <= 1 || templateCanvasSize.height <= 1) {
      return;
    }

    if (autoDetectTimerRef.current) {
      window.clearTimeout(autoDetectTimerRef.current);
    }

    setAutoDetectedSections([]);
    setAutoDetectStatus("Şablon üzerinde siyah kenarlı bölümler aranıyor...");

    autoDetectTimerRef.current = window.setTimeout(() => {
      const context = canvas.getContext("2d");
      if (!context) {
        setAutoDetectStatus("Bölüm tespiti için kanvas erişilemedi.");
        return;
      }

      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const sections = detectBlackBorderedSections(imageData);
        const visibleSections = sections.filter((section) => {
          return section.w > 0 && section.h > 0 && section.x >= 0 && section.y >= 0;
        });
        setAutoDetectedSections(visibleSections);
        setAutoDetectStatus(
          visibleSections.length > 0
            ? `${visibleSections.length} siyah kenarlı bölüm tespit edildi.`
            : "Siyah kenarlı bölüm bulunamadı.",
        );
      } catch (error) {
        console.error(error);
        setAutoDetectStatus("Bölüm tespiti sırasında hata oluştu.");
      } finally {
        autoDetectTimerRef.current = null;
      }
    }, 80);

    return () => {
      if (autoDetectTimerRef.current) {
        window.clearTimeout(autoDetectTimerRef.current);
        autoDetectTimerRef.current = null;
      }
    };
  }, [templateSource, templatePageIndex, currentStep, templateCanvasSize]);

  useEffect(() => {
    if (currentStep !== 2) return;

    let cancelled = false;

    const loadSavedScans = async () => {
      setIsSavedScansLoading(true);
      try {
        const response = await fetch("/api/optics/scans");
        const data = (await response.json()) as SavedScanSession[];
        if (!cancelled) {
          setSavedScans(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          toast({ title: "Hata", description: "Kayıtlı taramalar yüklenemedi." });
        }
      } finally {
        if (!cancelled) setIsSavedScansLoading(false);
      }
    };

    loadSavedScans();

    return () => {
      cancelled = true;
    };
  }, [currentStep, toast]);

  const loadSourceFile = async (file: File): Promise<LoadedSource> => {
    const fileUrl = URL.createObjectURL(file);

    if (!isPdfFile(file)) {
      return {
        source: {
          file,
          fileName: file.name,
          fileUrl,
          kind: "image",
          pageCount: 1,
        },
        pdfDocument: null,
      };
    }

    const data = await file.arrayBuffer();
    const pdfDocument = await pdfjs.getDocument({ data }).promise;
    return {
      source: {
        file,
        fileName: file.name,
        fileUrl,
        kind: "pdf",
        pageCount: pdfDocument.numPages,
      },
      pdfDocument,
    };
  };

  const handleTemplateFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (templateSource?.fileUrl) URL.revokeObjectURL(templateSource.fileUrl);
      if (templatePdfRef.current) {
        templatePdfRef.current.destroy?.();
        templatePdfRef.current = null;
      }

      const loaded = await loadSourceFile(file);
      templatePdfRef.current = loaded.pdfDocument;
      setTemplateSource(loaded.source);
      setTemplatePageIndex(0);
      setActiveAreaId(null);
      setCurrentStep(1);

      toast({ title: "Şablon yüklendi", description: `${loaded.source.pageCount} sayfa hazır.` });
    } catch (error) {
      console.error(error);
      toast({ title: "Hata", description: "Şablon yüklenemedi." });
    }
  };

  const handleScanFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (scanSource?.fileUrl) URL.revokeObjectURL(scanSource.fileUrl);
      if (scanPdfRef.current) {
        scanPdfRef.current.destroy?.();
        scanPdfRef.current = null;
      }

      const loaded = await loadSourceFile(file);
      scanPdfRef.current = loaded.pdfDocument;
      setScanSource(loaded.source);
      setScanPageIndex(0);
      setScanResults([]);
      setScanStatus(`${loaded.source.pageCount} sayfalık tarama yüklendi.`);
    } catch (error) {
      console.error(error);
      toast({ title: "Hata", description: "Tarama dosyası yüklenemedi." });
    }
  };

  const templatePageCount = templateSource?.pageCount ?? 0;
  const scanPageCount = scanSource?.pageCount ?? 0;

  const areasOnTemplatePage = useMemo(() => areas.filter((area) => area.pageIndex === templatePageIndex), [areas, templatePageIndex]);
  const handleTemplateMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!templateCanvasRef.current || !templateSource) return;
    const canvas = templateCanvasRef.current;
    const point = getCanvasPoint(event, canvas);

    const hitArea = [...areasOnTemplatePage]
      .reverse()
      .find((area) => {
        const rect = denormalizeRect(area.rect, canvas.width, canvas.height);
        return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
      });

    if (selectionMode === "move" && hitArea) {
      drawingStateRef.current = {
        areaId: hitArea.id,
        startPoint: point,
        startRect: hitArea.rect,
      };
      setActiveAreaId(hitArea.id);
      return;
    }

    drawingStateRef.current = { startPoint: point };
    setTempRect({ x: point.x, y: point.y, w: 0, h: 0 });
    setDrawing(true);
    setActiveAreaId(null);
  };

  const handleTemplateMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!templateCanvasRef.current || !templateSource) return;
    const canvas = templateCanvasRef.current;
    const point = getCanvasPoint(event, canvas);
    const drawingState = drawingStateRef.current;

    if (drawingState?.areaId && drawingState.startRect) {
      const dx = point.x - drawingState.startPoint.x;
      const dy = point.y - drawingState.startPoint.y;
      const startRectPx = denormalizeRect(drawingState.startRect, canvas.width, canvas.height);
      const nextX = clamp(startRectPx.x + dx, 0, Math.max(0, canvas.width - startRectPx.w));
      const nextY = clamp(startRectPx.y + dy, 0, Math.max(0, canvas.height - startRectPx.h));

      setAreas((previous) =>
        previous.map((area) =>
          area.id === drawingState.areaId
            ? {
                ...area,
                rect: normalizeRect({ x: nextX, y: nextY, w: startRectPx.w, h: startRectPx.h }, canvas.width, canvas.height),
              }
            : area,
        ),
      );

      return;
    }

    if (!drawing || !drawingState) return;
    setTempRect(createRectFromPoints(drawingState.startPoint, point));
  };

  const handleTemplateMouseUp = () => {
    const canvas = templateCanvasRef.current;
    const drawingState = drawingStateRef.current;

    if (drawingState?.areaId) {
      drawingStateRef.current = null;
      return;
    }

    if (canvas && drawing && tempRect && tempRect.w >= MIN_RECT_SIZE && tempRect.h >= MIN_RECT_SIZE) {
      const id = `area-${Date.now()}`;
      const nextArea: Area = {
        id,
        pageIndex: templatePageIndex,
        subject: defaultSubject.trim() || "Genel",
        questionCount: Math.max(1, defaultQuestionCount),
        optionCount: Math.min(6, Math.max(2, defaultOptionCount)),
        rect: normalizeRect(tempRect, canvas.width, canvas.height),
      };

      setAreas((previous) => [...previous, nextArea]);
      setActiveAreaId(id);
    }

    drawingStateRef.current = null;
    setDrawing(false);
    setTempRect(null);
  };

  const updateArea = (areaId: string, patch: Partial<Pick<Area, "subject" | "questionCount" | "optionCount">>) => {
    setAreas((previous) =>
      previous.map((area) => {
        if (area.id !== areaId) return area;
        return {
          ...area,
          subject: patch.subject ?? area.subject,
          questionCount: patch.questionCount ?? area.questionCount,
          optionCount: patch.optionCount ?? area.optionCount,
        };
      }),
    );
  };

  const removeArea = (areaId: string) => {
    setAreas((previous) => previous.filter((area) => area.id !== areaId));
    if (activeAreaId === areaId) setActiveAreaId(null);
  };

  const saveConfig = async () => {
    if (areas.length === 0) {
      toast({ title: "Hata", description: "Kaydetmek için en az bir alan çizin." });
      return;
    }

    const payload = {
      fileName: templateSource?.fileName || "",
      pageCount: templateSource?.pageCount || 0,
      areas,
      savedAt: new Date().toISOString(),
    };

    try {
      await fetch("/api/optics/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast({ title: "Kaydedildi", description: "Şablon alanları sisteme kaydedildi." });
    } catch (error) {
      console.error(error);
      toast({ title: "Hata", description: "Şablon kaydedilemedi." });
    }
  };

  const runScan = async () => {
    if (!scanSource) {
      toast({ title: "Hata", description: "Önce tarama dosyasını yükleyin." });
      return;
    }

    if (areas.length === 0) {
      toast({ title: "Hata", description: "Önce şablon alanlarını tanımlayın." });
      return;
    }

    setIsScanning(true);
    setScanStatus("Tarama hazırlanıyor...");

    try {
      const results: ScanResult[] = [];
      const workerCanvas = document.createElement("canvas");
      let qrData = "";

      for (let pageIndex = 0; pageIndex < scanSource.pageCount; pageIndex += 1) {
        setScanStatus(`Sayfa ${pageIndex + 1}/${scanSource.pageCount} okunuyor...`);

        const rendered = await renderSourceToCanvas(scanSource, pageIndex, workerCanvas, scanPdfRef.current);
        if (!rendered) continue;

        if (!qrData) {
          qrData = detectQrData(workerCanvas);
        }

        const pageAreas = areas.filter((area) => area.pageIndex === pageIndex);
        for (const area of pageAreas) {
          results.push({
            areaId: area.id,
            pageIndex,
            subject: area.subject,
            rect: area.rect,
            answers: detectAreaAnswers(workerCanvas, area),
          });
        }
      }

      setScanResults(results);
      setScanStatus(`${qrData ? "QR bulundu. " : "QR bulunamadı. "}${results.length > 0 ? `${results.length} alan işlendi.` : "Bu dosyada eşleşen alan bulunamadı."}`);

      await fetch("/api/optics/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: scanSource.fileName, pageCount: scanSource.pageCount, qrData, results }),
      });

      if (currentStep === 2) {
        try {
          const response = await fetch("/api/optics/scans");
          const data = (await response.json()) as SavedScanSession[];
          setSavedScans(Array.isArray(data) ? data : []);
        } catch {
          // keep current list if refresh fails
        }
      }

      toast({ title: "Tarama tamamlandı", description: `${results.length} alan için sonuç üretildi.` });
    } catch (error) {
      console.error(error);
      setScanStatus("Tarama sırasında hata oluştu.");
      toast({ title: "Hata", description: "Tarama yapılamadı." });
    } finally {
      setIsScanning(false);
    }
  };

  const templateCanvasWidth = templateCanvasSize.width;
  const templateCanvasHeight = templateCanvasSize.height;

  const renderTemplateOverlay = useMemo(
    () =>
      areasOnTemplatePage.map((area) => {
        const rect = denormalizeRect(area.rect, templateCanvasWidth, templateCanvasHeight);
        const isActive = activeAreaId === area.id;

        return (
          <div
            key={area.id}
            className="absolute"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              border: isActive ? "2px solid #0ea5a4" : "1px dashed rgba(14,165,164,0.45)",
              background: isActive ? "rgba(14,165,164,0.05)" : "transparent",
              boxSizing: "border-box",
              cursor: selectionMode === "move" ? "move" : "default",
            }}
            onClick={(event) => {
              event.stopPropagation();
              setActiveAreaId(area.id);
            }}
          >
            <div className="absolute left-1 top-1 rounded bg-background/90 px-2 py-1 text-[11px] font-medium shadow-sm">
              {area.subject} • {area.questionCount} soru • {area.optionCount} seçenek
            </div>
          </div>
        );
      }),
    [activeAreaId, areasOnTemplatePage, selectionMode, templateCanvasHeight, templateCanvasWidth],
  );

  const templatePreviewLabel = templateSource
    ? `${templateSource.fileName} - Sayfa ${templatePageIndex + 1}/${templatePageCount || 1}`
    : "Henüz şablon yüklenmedi";

  const scanPreviewLabel = scanSource
    ? `${scanSource.fileName} - Sayfa ${scanPageIndex + 1}/${scanPageCount || 1}`
    : "Henüz tarama yüklenmedi";

  const canProceedToScan = Boolean(templateSource && areas.length > 0);

  const scanRows = useMemo(
    () =>
      scanResults.flatMap((result) =>
        result.answers.map((answer) => ({
          key: `${result.areaId}-${result.pageIndex}-${answer.questionNumber}`,
          page: result.pageIndex + 1,
          subject: result.subject,
          question: answer.questionNumber,
          answer: answer.answer || "Boş",
          confidence: Math.round(answer.confidence),
        })),
      ),
    [scanResults],
  );

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Optik Okuma</h1>
        <p className="text-muted-foreground mt-1">
          Adım adım ilerleyin: önce şablon ve ders alanları, sonra tarama ve sonuç listesi.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          className={`rounded-lg border p-4 text-left transition ${currentStep === 1 ? "border-primary bg-primary/5" : "bg-background"}`}
          onClick={() => setCurrentStep(1)}
        >
          <div className="text-sm font-semibold">1. Şablon Ekle ve Alanları Tanımla</div>
          <div className="mt-1 text-xs text-muted-foreground">Şablon dosyasını yükleyin, ders alanlarını çizip düzenleyin.</div>
        </button>
        <button
          type="button"
          className={`rounded-lg border p-4 text-left transition ${currentStep === 2 ? "border-primary bg-primary/5" : "bg-background"}`}
          onClick={() => canProceedToScan && setCurrentStep(2)}
          disabled={!canProceedToScan}
        >
          <div className="text-sm font-semibold">2. Tarama Yükle ve Oku</div>
          <div className="mt-1 text-xs text-muted-foreground">Tarama dosyasını ekleyin, okutun, sonuçları satır satır inceleyin.</div>
        </button>
      </div>

      {currentStep === 1 ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-1 space-y-3">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Adım 1 Ayarları</CardTitle>
                <CardDescription>Şablonu yükleyin ve yeni çizilecek alanların varsayılanını belirleyin.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="template-file">Şablon PDF/Görsel</Label>
                  <Input id="template-file" type="file" accept="image/*,application/pdf" onChange={handleTemplateFileChange} />
                </div>

                <div className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">Şablon durumu</div>
                  <div className="mt-1">{templatePreviewLabel}</div>
                  <div className="mt-1">Tanımlı alan: {areas.length}</div>
                  {autoDetectStatus && <div className="mt-1 text-xs">{autoDetectStatus}</div>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Konu</Label>
                    <Input value={defaultSubject} onChange={(event) => setDefaultSubject(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Soru sayısı</Label>
                    <Input type="number" min={1} value={defaultQuestionCount} onChange={(event) => setDefaultQuestionCount(Math.max(1, Number(event.target.value) || 1))} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Şık sayısı</Label>
                  <Select value={String(defaultOptionCount)} onValueChange={(value) => setDefaultOptionCount(Math.min(6, Math.max(2, Number(value) || DEFAULT_OPTION_COUNT)))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={String(defaultOptionCount)} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="6">6</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">Şablon durumu</div>
                  <div className="mt-1">{templatePreviewLabel}</div>
                  <div className="mt-1">Tanımlı alan: {areas.length}</div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={saveConfig} disabled={!templateSource || areas.length === 0}>Şablonu Kaydet</Button>
                </div>
              </CardContent>
            </Card>

            <Button className="w-full" variant="secondary" onClick={() => setCurrentStep(2)} disabled={!canProceedToScan}>2. Adıma Geç</Button>
          </div>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Şablon Önizleme</CardTitle>
              <CardDescription>Şablonda siyah dikdörtgenler arasında kalan ders alanlarını tek tek çizin.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-lg border bg-muted/30 p-3">
                <div className="inline-block">
                  <div className="relative">
                    <canvas
                      ref={templateCanvasRef}
                      className="block max-w-none bg-white"
                      onMouseDown={handleTemplateMouseDown}
                      onMouseMove={handleTemplateMouseMove}
                      onMouseUp={handleTemplateMouseUp}
                      onMouseLeave={handleTemplateMouseUp}
                    />

                     <div className="pointer-events-none absolute inset-0">
                       {renderTemplateOverlay}
                       {autoDetectedSections.map((section, index) => (
                         <div
                           key={`auto-section-${index}`}
                           className="absolute border-2 border-red-500 bg-red-500/10"
                           style={{
                             left: section.x,
                             top: section.y,
                             width: section.w,
                             height: section.h,
                             boxSizing: "border-box",
                           }}
                         >
                           <div className="absolute -top-5 left-0 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                             Otomatik {index + 1}
                           </div>
                         </div>
                       ))}
                     </div>

                    {tempRect && drawing && templateCanvasSize.width > 1 && templateCanvasSize.height > 1 && (
                      <div
                        className="pointer-events-none absolute"
                        style={{
                          left: tempRect.x,
                          top: tempRect.y,
                          width: tempRect.w,
                          height: tempRect.h,
                          border: "2px dashed #0ea5a4",
                          background: "rgba(14,165,164,0.04)",
                          boxSizing: "border-box",
                        }}
                      />
                    )}
                  </div>
                </div>

                {!templateSource && (
                  <div className="grid place-content-center rounded-md border border-dashed bg-background p-12 text-sm text-muted-foreground mt-4">
                    Önce bir şablon yükleyin.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Tanımlı Alanlar</CardTitle>
              <CardDescription>Ders adını, soru sayısını ve şık sayısını burada düzenleyin.</CardDescription>
            </CardHeader>
            <CardContent>
              {areas.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Henüz alan eklenmedi. Şablon üzerinde bir dikdörtgen çizerek başlayın.</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {areas.map((area, index) => (
                    <div key={area.id} className={`rounded-md border p-2.5 ${activeAreaId === area.id ? "border-primary bg-primary/5" : "bg-background"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold leading-tight">Alan {index + 1}</div>
                          <div className="text-xs text-muted-foreground">Sayfa {area.pageIndex + 1}</div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => removeArea(area.id)}>Sil</Button>
                      </div>

                      <div className="mt-2.5 space-y-2">
                        <div className="grid gap-1">
                          <Label htmlFor={`subject-${area.id}`} className="text-xs">Ders adı</Label>
                          <Input id={`subject-${area.id}`} className="h-8 text-xs" value={area.subject} onChange={(event) => updateArea(area.id, { subject: event.target.value })} />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1">
                            <Label htmlFor={`questions-${area.id}`} className="text-xs">Soru sayısı</Label>
                            <Input id={`questions-${area.id}`} className="h-8 text-xs" type="number" min={1} value={area.questionCount} onChange={(event) => updateArea(area.id, { questionCount: Math.max(1, Number(event.target.value) || 1) })} />
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor={`options-${area.id}`} className="text-xs">Şık sayısı</Label>
                            <Input id={`options-${area.id}`} className="h-8 text-xs" type="number" min={2} max={6} value={area.optionCount} onChange={(event) => updateArea(area.id, { optionCount: Math.min(6, Math.max(2, Number(event.target.value) || DEFAULT_OPTION_COUNT)) })} />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setActiveAreaId(area.id)}>Seç</Button>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setTemplatePageIndex(area.pageIndex)}>Git</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="xl:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Adım 2 Tarama</CardTitle>
              <CardDescription>Taranmış dosyayı yükleyip okutun, sonuçları satır satır inceleyin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="scan-file">Taranmış PDF/Görsel</Label>
                <Input id="scan-file" type="file" accept="image/*,application/pdf" onChange={handleScanFileChange} />
                <div className="text-xs text-muted-foreground">{scanSource ? `Seçili dosya: ${scanSource.fileName}` : "Henüz dosya seçilmedi."}</div>
              </div>

              <Button variant="outline" onClick={() => setIsScanPreviewOpen(true)} disabled={!scanSource}>Önizleme</Button>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setScanPageIndex((value) => Math.max(0, value - 1))} disabled={!scanSource || scanPageIndex <= 0}>Önceki sayfa</Button>
                <Button variant="outline" onClick={() => setScanPageIndex((value) => Math.min(Math.max(scanPageCount - 1, 0), value + 1))} disabled={!scanSource || scanPageIndex >= scanPageCount - 1}>Sonraki sayfa</Button>
              </div>

              <div className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">{scanPreviewLabel}</div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>1. Adıma Dön</Button>
                <Button variant="secondary" onClick={runScan} disabled={!scanSource || areas.length === 0 || isScanning}>Tarama Yap</Button>
              </div>

              <div className="rounded-lg border bg-muted/25 p-3 text-sm">
                <div className="font-medium">Tarama Durumu</div>
                <div className="mt-1 text-muted-foreground">{scanStatus}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tarama Sonuçları</CardTitle>
              <CardDescription>Sonuçlar satır satır listelenir.</CardDescription>
            </CardHeader>
            <CardContent>
              {scanRows.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Henüz tarama sonucu yok.</div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                    <div>Sayfa</div>
                    <div>Ders</div>
                    <div>Soru</div>
                    <div>Cevap</div>
                    <div>Güven</div>
                  </div>
                  {scanRows.map((row) => (
                    <div key={row.key} className="grid grid-cols-5 gap-2 rounded-md border px-3 py-2 text-sm">
                      <div>{row.page}</div>
                      <div>{row.subject}</div>
                      <div>{row.question}</div>
                      <div>{row.answer}</div>
                      <div>{row.confidence}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Kayıtlı Taramalar</CardTitle>
              <CardDescription>Veritabanına kaydedilen tarama oturumları listelenir.</CardDescription>
            </CardHeader>
            <CardContent>
              {isSavedScansLoading ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Kayıtlar yükleniyor...</div>
              ) : savedScans.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Henüz kayıtlı tarama yok.</div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                    <div>Oluşturulma</div>
                    <div>Dosya</div>
                    <div>Sayfa</div>
                    <div>QR</div>
                    <div>Cevap</div>
                  </div>
                  {savedScans.map((session) => (
                    <div key={session.id} className="grid grid-cols-5 gap-2 rounded-md border px-3 py-2 text-sm">
                      <div>{new Date(session.createdAt).toLocaleString("tr-TR")}</div>
                      <div className="truncate">{session.fileName || "-"}</div>
                      <div>{session.pageCount}</div>
                      <div className="truncate">{session.qr || "-"}</div>
                      <div>{session.answerCount}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={isScanPreviewOpen} onOpenChange={setIsScanPreviewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Önizleme</DialogTitle>
            <DialogDescription>Yüklenen tarama belgesinin 1. sayfası.</DialogDescription>
          </DialogHeader>
          <div className="overflow-auto rounded-lg border bg-muted/30 p-3">
            {scanPreviewDataUrl ? (
              <img src={scanPreviewDataUrl} alt="Tarama önizleme" className="block h-auto w-full rounded-md bg-white object-contain" />
            ) : (
              <div className="grid min-h-[420px] place-content-center rounded-md border border-dashed bg-background p-12 text-sm text-muted-foreground">
                Önizleme hazırlanıyor.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
