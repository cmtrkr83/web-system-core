import type { Student, School, District } from "@/context/RegistryContext";

export type PaperSize = "A4" | "A5";

export const PAPER_DIMENSIONS: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
};

export const PX_PER_MM = 96 / 25.4;
export const PT_PER_MM = 72 / 25.4;

export const mmToPx = (mm: number) => Math.round(mm * PX_PER_MM);

export const mmToPt = (mm: number) => Math.round(mm * PT_PER_MM);

export const snapToGrid = (v: number, s: number) => Math.round(v / s) * s;

export function extractExcelColumns(students: Student[]): string[] {
  const keys = new Set<string>();
  for (const student of students) {
    if (!student.extraData) continue;
    try {
      const data = JSON.parse(student.extraData);
      for (const key of Object.keys(data)) {
        if (data[key] !== undefined && data[key] !== null && String(data[key]) !== "") {
          keys.add(key);
        }
      }
    } catch {
      // ignore malformed extraData
    }
  }
  return Array.from(keys);
}

export function resolveColumnValue(
  student: Student,
  school: School | undefined,
  district: District | undefined,
  columnKey: string,
): string {
  if (columnKey.startsWith("std:")) {
    const key = columnKey.slice(4);
    switch (key) {
      case "fullName":
        return student.fullName || "";
      case "studentNo":
        return student.studentNo || "";
      case "schoolNo":
        return student.schoolNo || "";
      case "class":
        return student.class || "";
      case "grade":
        return student.grade || "";
      case "schoolName":
        return school?.name || "";
      case "schoolCode":
        return school?.code || "";
      case "districtName":
        return district?.name || "";
      default:
        return "";
    }
  }

  if (student.extraData) {
    try {
      const data = JSON.parse(student.extraData);
      const val = data[columnKey];
      if (val !== undefined && val !== null) return String(val);
    } catch {
      // ignore
    }
  }
  return "";
}

export function findSchool(student: Student, schools: School[]): School | undefined {
  return schools.find((s) => s.id === student.schoolId);
}

export function findDistrict(school: School | undefined, districts: District[]): District | undefined {
  if (!school) return undefined;
  return districts.find((d) => d.id === school.districtId);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface PdfPageRenderOptions {
  pages?: string[];
  totalPages?: number;
  getPage?: (index: number) => string | Promise<string>;
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  paperSize: PaperSize;
  renderDpi?: number;
  onProgress?: (completed: number, total: number) => void;
}

export async function createPdfFromPages(options: PdfPageRenderOptions): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const { PDFDocument } = await import("pdf-lib");

  const totalPages = options.totalPages ?? options.pages?.length ?? 0;
  if (totalPages === 0 || (!options.getPage && !options.pages)) {
    throw new Error("PDF için en az bir sayfa gerekli");
  }

  const dpi = options.renderDpi ?? 300;
  const pageWidthPt = mmToPt(options.widthMm);
  const pageHeightPt = mmToPt(options.heightMm);
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < totalPages; i++) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = await options.getPage?.(i) ?? options.pages?.[i] ?? "";
    const pageEl = wrapper.firstElementChild as HTMLElement;
    if (!pageEl) throw new Error(`PDF sayfası oluşturulamadı: ${i + 1}`);
    pageEl.style.width = `${options.widthPx}px`;
    pageEl.style.height = `${options.heightPx}px`;
    pageEl.style.background = "#ffffff";
    pageEl.style.position = "fixed";
    pageEl.style.left = "-9999px";
    pageEl.style.top = "0";
    document.body.appendChild(pageEl);

    let canvas: HTMLCanvasElement | undefined;
    try {
      const imgs = Array.from(pageEl.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return;
          return new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        }),
      );

      const renderedCanvas = await html2canvas(pageEl, {
        scale: dpi / 96,
        useCORS: true,
        logging: false,
        width: options.widthPx,
        height: options.heightPx,
      });
      canvas = renderedCanvas;
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        renderedCanvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("PDF sayfası görüntüsü oluşturulamadı"))),
          "image/jpeg",
          0.92,
        );
      });
      const imgBytes = new Uint8Array(await imageBlob.arrayBuffer());
      const image = await pdfDoc.embedJpg(imgBytes);
      const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
      page.drawImage(image, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });
    } finally {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      document.body.removeChild(pageEl);
    }

    options.onProgress?.(i + 1, totalPages);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}

export interface PrintDocument {
  appendPage(pageHtml: string): Promise<void>;
  print(): void;
  close(): void;
}

export function openPrintWindow(paperSize: PaperSize, documentTitle = "Optik Form"): PrintDocument | null {
  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) return null;
  printWindow.document.open();
  printWindow.document.write(
    `<!doctype html><html lang="tr"><head><meta charset="UTF-8" /><title>${escapeHtml(documentTitle)}</title><style>@page{size:${paperSize} portrait;margin:0;}html,body{margin:0;padding:0;}body{background:#fff;}.optic-page{page-break-after:always;}.optic-page:last-child{page-break-after:auto;}</style></head><body></body></html>`,
  );
  printWindow.document.close();

  return {
    async appendPage(pageHtml) {
      if (printWindow.closed) throw new Error("Yazdırma penceresi kapatıldı");
      const wrapper = printWindow.document.createElement("div");
      wrapper.innerHTML = pageHtml;
      const page = wrapper.firstElementChild;
      if (!page) throw new Error("Yazdırma sayfası oluşturulamadı");
      const section = printWindow.document.createElement("section");
      section.className = "optic-page";
      section.append(page);
      printWindow.document.body.append(section);

      await Promise.all(
        Array.from(section.querySelectorAll("img")).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        }),
      );
    },
    print() {
      printWindow.focus();
      printWindow.print();
    },
    close() {
      printWindow.close();
    },
  };
}

const QR_CACHE_LIMIT = 128;
const qrCache = new Map<string, string>();

export async function buildQrDataUrl(text: string, widthPx = 600): Promise<string> {
  const key = `${widthPx}:${text}`;
  const cached = qrCache.get(key);
  if (cached) {
    qrCache.delete(key);
    qrCache.set(key, cached);
    return cached;
  }
  const { default: QRCode } = await import("qrcode");
  const dataUrl = await QRCode.toDataURL(text, {
    width: widthPx,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  qrCache.set(key, dataUrl);
  if (qrCache.size > QR_CACHE_LIMIT) {
    const oldestKey = qrCache.keys().next().value;
    if (oldestKey !== undefined) qrCache.delete(oldestKey);
  }
  return dataUrl;
}
