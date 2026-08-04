import type { Student, School, District } from "@/context/RegistryContext";

export type PaperSize = "A4" | "A5";

export type ComponentType = "text" | "qr" | "image";

export interface PlacedComponent {
  id: string;
  type: ComponentType;
  label: string;
  sourceColumn?: string;
  fixedText?: string;
  xMm: number;
  yMm: number;
  fontSizeMm?: number;
  bold?: boolean;
  qrSizeMm?: number;
  imageDataUrl?: string;
  imageWidthMm?: number;
  visible: boolean;
}

export const PAPER_DIMENSIONS: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
};

export const PX_PER_MM = 96 / 25.4;

export const mmToPx = (mm: number) => Math.round(mm * PX_PER_MM);

export const STANDARD_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "fullName", label: "Ad Soyad" },
  { key: "studentNo", label: "TC Kimlik No" },
  { key: "schoolNo", label: "Okul No" },
  { key: "class", label: "Sınıf / Şube" },
  { key: "grade", label: "Salon" },
  { key: "schoolName", label: "Okul Adı" },
  { key: "schoolCode", label: "Okul Kodu" },
  { key: "districtName", label: "İlçe Adı" },
];

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

export interface PageRenderOptions {
  paperSize: PaperSize;
  templateDataUrl?: string;
  components: PlacedComponent[];
  getValue: (component: PlacedComponent) => string;
  defaultFontSizeMm: number;
  qrDataUrls?: Record<string, string>;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildPageHtml(options: PageRenderOptions): string {
  const paper = PAPER_DIMENSIONS[options.paperSize];
  const blocks: string[] = [];

  for (const component of options.components) {
    if (!component.visible) continue;

    if (component.type === "text") {
      const value = options.getValue(component);
      if (!value) continue;
      const fontSize = component.fontSizeMm ?? options.defaultFontSizeMm;
      const fontWeight = component.bold ? "bold" : "normal";
      blocks.push(
        `<div data-comp-id="${component.id}" style="position:absolute;left:${component.xMm}mm;top:${component.yMm}mm;font-size:${fontSize}mm;line-height:1;font-weight:${fontWeight};color:#000;white-space:nowrap;">${escapeHtml(value)}</div>`,
      );
    } else if (component.type === "qr") {
      const value = options.getValue(component);
      if (!value) continue;
      const size = component.qrSizeMm ?? 25;
      const qrUrl = options.qrDataUrls?.[component.id];
      if (!qrUrl) continue;
      blocks.push(
        `<img data-comp-id="${component.id}" src="${qrUrl}" alt="QR" style="position:absolute;left:${component.xMm}mm;top:${component.yMm}mm;width:${size}mm;height:${size}mm;image-rendering:pixelated;" />`,
      );
    } else if (component.type === "image") {
      if (!component.imageDataUrl) continue;
      const width = component.imageWidthMm ?? 40;
      blocks.push(
        `<img data-comp-id="${component.id}" src="${component.imageDataUrl}" alt="logo" style="position:absolute;left:${component.xMm}mm;top:${component.yMm}mm;width:${width}mm;height:auto;" />`,
      );
    }
  }

  const template = options.templateDataUrl
    ? `<img src="${options.templateDataUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;" />`
    : "";

  return `<div style="position:relative;width:${paper.widthMm}mm;height:${paper.heightMm}mm;overflow:hidden;background:#fff;">${template}${blocks.join("")}</div>`;
}

export function generateId(): string {
  return `comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
