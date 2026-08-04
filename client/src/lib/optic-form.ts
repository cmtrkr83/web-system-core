import type { PaperSize } from "./optic-coding";

export type FormFieldType = "text" | "numeric" | "id" | "booklet" | "box" | "heading";

export interface FormTextField {
  id: string;
  label: string;
  widthMm: number;
  type?: FormFieldType;
  digitCount?: number;
  heightMm?: number;
  borderRadiusMm?: number;
  fontSizeMm?: number;
  letterSpacingMm?: number;
  xMm?: number;
  yMm?: number;
}

export const TEXT_FIELD_HEIGHT_MM = 9.5;
export const NUMERIC_FIELD_HEIGHT_MM = 10 + 2 + 5 + 10 * 5 + 1.5;
export const BOOKLET_FIELD_HEIGHT_MM = 10 + 2 + 5 + 1.5;
export const BOOKLET_OPTIONS = ["A", "B", "C", "D"];
export const BOX_FIELD_DEFAULT_HEIGHT_MM = 14;
export const BOX_FIELD_DEFAULT_RADIUS_MM = 2;
export const HEADING_MIN_FONT_MM = 2;
export const HEADING_MAX_FONT_MM = 30;
export const HEADING_DEFAULT_FONT_MM = 6;
export const HEADING_DEFAULT_SPACING_MM = 0;
const BOX_FIELD_EXTRA_MM = 5.5;
const INFO_COL_GAP_MM = 6;

export function isBookletField(field: FormTextField): boolean {
  return field.type === "booklet";
}

export function isBoxField(field: FormTextField): boolean {
  return field.type === "box";
}

export function isHeadingField(field: FormTextField): boolean {
  return field.type === "heading";
}

export function formFieldHeightMm(field: FormTextField): number {
  if (isHeadingField(field)) return (field.fontSizeMm ?? HEADING_DEFAULT_FONT_MM) * 1.5;
  if (isBookletField(field)) return BOOKLET_FIELD_HEIGHT_MM;
  if (isBoxField(field)) return (field.heightMm ?? BOX_FIELD_DEFAULT_HEIGHT_MM) + BOX_FIELD_EXTRA_MM;
  return isNumericField(field) ? NUMERIC_FIELD_HEIGHT_MM : TEXT_FIELD_HEIGHT_MM;
}

export function fieldContentWidthMm(field: FormTextField, columnWidthMm: number): number {
  if (isHeadingField(field)) {
    const fs = field.fontSizeMm ?? HEADING_DEFAULT_FONT_MM;
    const ls = field.letterSpacingMm ?? HEADING_DEFAULT_SPACING_MM;
    return Math.max(20, field.label.length * (fs * 0.62 + ls));
  }
  if (isBookletField(field)) return BOOKLET_OPTIONS.length * BUBBLE_PITCH_MM + 0.3;
  if (isBoxField(field)) return field.widthMm || columnWidthMm;
  return isNumericField(field) ? (field.digitCount ?? 11) * BUBBLE_PITCH_MM + 0.3 : columnWidthMm;
}

export interface FieldPlacement {
  field: FormTextField;
  xMm: number;
  yMm: number;
  colWidthMm: number;
}

export function computeFieldPlacements(design: OpticFormDesign): FieldPlacement[] {
  const paperWidth = design.paperSize === "A4" ? 210 : 148;
  const colWidth = (paperWidth - LEFT_MARGIN_MM - RIGHT_MARGIN_MM - INFO_COL_GAP_MM) / 2;
  const regularFields = design.fields.filter((f) => !isHeadingField(f));
  const rowCount = Math.ceil(regularFields.length / 2);
  const rowHeights = Array.from({ length: rowCount }, (_, r) => {
    const a = regularFields[r * 2];
    const b = regularFields[r * 2 + 1];
    return Math.max(formFieldHeightMm(a), b ? formFieldHeightMm(b) : 0);
  });
  const baseY = MARGIN_MM;

  const placements: FieldPlacement[] = [];

  regularFields.forEach((field, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    let rowY = baseY;
    for (let r = 0; r < row; r++) rowY += rowHeights[r] + 3;
    placements.push({
      field,
      xMm: field.xMm ?? LEFT_MARGIN_MM + col * (colWidth + INFO_COL_GAP_MM),
      yMm: field.yMm ?? rowY,
      colWidthMm: fieldContentWidthMm(field, colWidth),
    });
  });

  let regularBottomY = baseY;
  for (const h of rowHeights) regularBottomY += h + 3;

  let headingY = Math.max(regularBottomY, baseY + 30);
  for (const field of design.fields) {
    if (!isHeadingField(field)) continue;
    placements.push({
      field,
      xMm: field.xMm ?? LEFT_MARGIN_MM,
      yMm: field.yMm ?? headingY,
      colWidthMm: fieldContentWidthMm(field, colWidth),
    });
    headingY += formFieldHeightMm(field) + 3;
  }

  return placements;
}

export function isNumericField(field: FormTextField): boolean {
  return field.type === "numeric" || field.type === "id";
}

export function normalizeFormField(field: FormTextField): FormTextField {
  if (field.type === "id") {
    return { ...field, type: "numeric" };
  }
  return field;
}

export interface AnswerGrid {
  id: string;
  subject: string;
  questionCount: number;
  optionCount: number;
  xMm?: number;
  yMm?: number;
}

export const GRID_SNAP_MM = 5;

export interface GridPlacement {
  grid: AnswerGrid;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export function gridColumnWidth(grid: AnswerGrid): number {
  return NUM_COL_MM + grid.optionCount * BUBBLE_PITCH_MM + 2;
}

export function gridHeightMm(grid: AnswerGrid): number {
  return 10 + 2 + grid.questionCount * ROW_HEIGHT_MM + 0.6;
}

export function computeAnswerRegionTop(design: OpticFormDesign): number {
  const paperHeight = design.paperSize === "A4" ? 297 : 210;
  const placements = computeFieldPlacements(design);
  let infoBottomMm = 0;
  if (design.showStudentInfo) {
    const regularPlaces = placements.filter((p) => !isHeadingField(p.field));
    if (regularPlaces.length > 0) {
      infoBottomMm = Math.max(...regularPlaces.map((p) => p.yMm + formFieldHeightMm(p.field)));
    }
  }
  return Math.max(paperHeight * 0.4, MARGIN_MM + 6, infoBottomMm > 0 ? infoBottomMm + 6 : 0);
}

export function computeGridPlacements(design: OpticFormDesign): GridPlacement[] {
  const paperWidth = design.paperSize === "A4" ? 210 : 148;
  const headerH = design.grids.length > 0 ? 12 : 0;
  const colGap = 4;
  const maxX = paperWidth - RIGHT_MARGIN_MM;
  const placements: GridPlacement[] = [];
  let x = LEFT_MARGIN_MM;
  let y = computeAnswerRegionTop(design) + headerH;
  let rowH = 0;
  for (const grid of design.grids) {
    const w = gridColumnWidth(grid);
    const h = gridHeightMm(grid);
    if (x + w > maxX) {
      x = LEFT_MARGIN_MM;
      y += rowH + colGap;
      rowH = 0;
    }
    placements.push({ grid, xMm: grid.xMm ?? x, yMm: grid.yMm ?? y, widthMm: w, heightMm: h });
    rowH = Math.max(rowH, h);
    x += w + colGap;
  }
  return placements;
}

export interface OpticManifestBubble {
  q: number;
  option: string;
  cx: number;
  cy: number;
}

export interface OpticManifestGrid {
  subject: string;
  questionCount: number;
  optionCount: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  bubbles: OpticManifestBubble[];
}

export interface OpticManifest {
  version: 1;
  id: string;
  name: string;
  paperSize: PaperSize;
  pageWidthMm: number;
  pageHeightMm: number;
  referenceMarks: { cx: number; cy: number }[];
  answerAreaTopMm: number;
  grids: OpticManifestGrid[];
  generatedAt: string;
}

export function buildOpticFormManifest(design: OpticFormDesign): OpticManifest {
  const paperWidth = design.paperSize === "A4" ? 210 : 148;
  const paperHeight = design.paperSize === "A4" ? 297 : 210;
  const contentW = paperWidth - LEFT_MARGIN_MM - RIGHT_MARGIN_MM;
  const contentH = paperHeight - MARGIN_MM * 2;
  const borderMm = (BUBBLE_BORDER_PX * 25.4) / 96;

  const grids: OpticManifestGrid[] = computeGridPlacements(design).map(({ grid, xMm, yMm, widthMm, heightMm }) => {
    const letters = optionLetters(grid.optionCount);
    const bubbles: OpticManifestBubble[] = [];
    for (let q = 0; q < grid.questionCount; q++) {
      for (let o = 0; o < grid.optionCount; o++) {
        bubbles.push({
          q: q + 1,
          option: letters[o],
          cx: Math.round((xMm + borderMm + NUM_COL_MM + o * BUBBLE_PITCH_MM + BUBBLE_PITCH_MM / 2) * 100) / 100,
          cy: Math.round((yMm + 10 + 2 + borderMm + q * ROW_HEIGHT_MM + ROW_HEIGHT_MM / 2) * 100) / 100,
        });
      }
    }
    return {
      subject: grid.subject,
      questionCount: grid.questionCount,
      optionCount: grid.optionCount,
      xMm,
      yMm,
      widthMm,
      heightMm,
      bubbles,
    };
  });

  const s = 5;
  const referenceMarks = [
    { cx: 4 + s / 2, cy: 4 + s / 2 },
    { cx: 12 + s / 2, cy: 4 + s / 2 },
    { cx: contentW - 4 - s / 2, cy: 4 + s / 2 },
    { cx: 4 + s / 2, cy: contentH - 4 - s / 2 },
    { cx: contentW - 4 - s / 2, cy: contentH - 4 - s / 2 },
  ];

  return {
    version: 1,
    id: design.id,
    name: design.name,
    paperSize: design.paperSize,
    pageWidthMm: paperWidth,
    pageHeightMm: paperHeight,
    referenceMarks,
    answerAreaTopMm: computeAnswerRegionTop(design),
    grids,
    generatedAt: new Date().toISOString(),
  };
}

export interface OpticFormDesign {
  id: string;
  name: string;
  paperSize: PaperSize;
  title: string;
  showStudentInfo: boolean;
  fields: FormTextField[];
  grids: AnswerGrid[];
  createdAt: string;
}

export type OpticFormFill = Record<string, string>;

export interface OpticFormOverlay {
  id: string;
  label: string;
  xMm: number;
  yMm: number;
  value: string;
  fontSizeMm?: number;
  letterSpacingMm?: number;
}

export const DEFAULT_OPTIC_FORM_FIELDS: FormTextField[] = [
  { id: "field-ad", label: "AD SOYAD", widthMm: 88 },
  { id: "field-tc", label: "T.C. KİMLİK NO", widthMm: 88, type: "numeric", digitCount: 11 },
];

const MARGIN_MM = 8;
const LEFT_MARGIN_MM = 10;
const RIGHT_MARGIN_MM = 6;
const BUBBLE_SIZE_MM = 4.23;
const BUBBLE_PITCH_MM = 5;
const NUM_COL_MM = 5;
const ROW_HEIGHT_MM = 5;
const BUBBLE_BORDER_PX = 0.5;
const BUBBLE_BORDER_COLOR = "#F4A9C4";
const ROW_STRIPE_COLOR = "rgba(244, 169, 196, 0.18)";
const ID_DIGIT_COUNT = 10;

export const PDF_RENDER_DPI = 300;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function optionLetters(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}

function buildOptionBubbleHtml(text: string, filled = false): string {
  const bg = filled ? "#000" : "#fff";
  const fg = filled ? "#fff" : BUBBLE_BORDER_COLOR;
  const label = filled
    ? ""
    : `<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2.4mm;font-weight:400;color:${fg};line-height:1;">${text}</span>`;
  return `<span style="width:${BUBBLE_PITCH_MM}mm;flex-shrink:0;display:inline-flex;justify-content:center;align-items:center;">
    <span style="position:relative;width:${BUBBLE_SIZE_MM}mm;height:${BUBBLE_SIZE_MM}mm;box-sizing:border-box;border:${BUBBLE_BORDER_PX}px solid ${BUBBLE_BORDER_COLOR};border-radius:50%;display:inline-block;background-color:${bg};">
      ${label}
    </span>
  </span>`;
}

function buildAnswerGridHtml(grid: AnswerGrid): string {
  const letters = optionLetters(grid.optionCount);

  const rows = Array.from({ length: grid.questionCount }, (_, q) => {
    const isOddRow = q % 2 === 0;
    const bubbles = letters.map((l) => buildOptionBubbleHtml(l)).join("");
    const rowStyle = isOddRow ? `background-color:${ROW_STRIPE_COLOR};` : "";
    return `<div style="display:flex;align-items:center;height:${ROW_HEIGHT_MM}mm;${rowStyle}">
      <span style="width:${NUM_COL_MM}mm;flex-shrink:0;font-size:2.6mm;text-align:center;color:${BUBBLE_BORDER_COLOR};">${q + 1}</span>
      ${bubbles}
    </div>`;
  }).join("");

  return `
    <div style="display:flex;flex-direction:column;">
      <div style="height:10mm;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0 1.5mm;box-sizing:border-box;text-align:center;font-size:3mm;font-weight:700;color:${BUBBLE_BORDER_COLOR};letter-spacing:0;line-height:1.15;border:0.5px solid ${BUBBLE_BORDER_COLOR};border-radius:1.5mm;">${escapeHtml(grid.subject.toLocaleUpperCase("tr-TR"))}</div>
      <div style="margin-top:2mm;">
        <div style="border:0.5px solid ${BUBBLE_BORDER_COLOR};border-radius:1.5mm;overflow:hidden;">${rows}</div>
      </div>
    </div>
  `;
}

function buildNumericFieldHtml(field: FormTextField, fillDigits?: string): string {
  const count = field.digitCount ?? 11;
  const columns = Array.from({ length: count }, (_, i) => {
    const isOddCol = i % 2 === 0;
    const colStyle = isOddCol ? `background-color:${ROW_STRIPE_COLOR};` : "";
    const raw = fillDigits ? fillDigits[i] : undefined;
    const digit = raw !== undefined && /^[0-9]$/.test(raw) ? Number(raw) : -1;
    const rows = Array.from({ length: ID_DIGIT_COUNT }, (_, d) =>
      `<div style="display:flex;align-items:center;height:${ROW_HEIGHT_MM}mm;">${buildOptionBubbleHtml(String(d), d === digit)}</div>`,
    ).join("");
    return `<div style="width:${BUBBLE_PITCH_MM}mm;flex-shrink:0;display:flex;flex-direction:column;${colStyle}">${rows}</div>`;
  }).join("");
  const headerCells = Array.from({ length: count }, (_, i) =>
    `<div style="width:${BUBBLE_PITCH_MM}mm;height:${ROW_HEIGHT_MM}mm;box-sizing:border-box;${i % 2 === 0 ? `background-color:${ROW_STRIPE_COLOR};` : ""}"></div>`,
  ).join("");
  return `<div style="margin-top:2mm;">
    <div style="border:0.5px solid ${BUBBLE_BORDER_COLOR};border-radius:1.5mm;overflow:hidden;display:inline-block;">
      <div style="display:flex;border-bottom:0.5px solid ${BUBBLE_BORDER_COLOR};">${headerCells}</div>
      <div style="display:flex;">${columns}</div>
    </div>
  </div>`;
}

function buildBookletFieldHtml(field: FormTextField, fillLetter?: string): string {
  const letters = BOOKLET_OPTIONS.slice(0, field.digitCount ?? BOOKLET_OPTIONS.length);
  const selected = fillLetter ? letters.indexOf(fillLetter) : -1;
  const cells = letters
    .map((l, i) => {
      const cellStyle =
        i % 2 === 0
          ? `background-color:${ROW_STRIPE_COLOR};`
          : "";
      return `<div style="width:${BUBBLE_PITCH_MM}mm;flex-shrink:0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;${cellStyle}">${buildOptionBubbleHtml(l, i === selected)}</div>`;
    })
    .join("");
  return `<div style="margin-top:2mm;">
    <div style="border:0.5px solid ${BUBBLE_BORDER_COLOR};border-radius:1.5mm;overflow:hidden;display:inline-block;">
      <div style="display:flex;height:${ROW_HEIGHT_MM}mm;">${cells}</div>
    </div>
  </div>`;
}

function buildBoxFieldHtml(field: FormTextField, fillValue?: string): string {
  const h = field.heightMm ?? BOX_FIELD_DEFAULT_HEIGHT_MM;
  const r = field.borderRadiusMm ?? BOX_FIELD_DEFAULT_RADIUS_MM;
  const inner = fillValue
    ? `<span style="font-size:3mm;font-weight:400;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(fillValue)}</span>`
    : "";
  return `<div style="margin-top:1mm;border:0.5px solid ${BUBBLE_BORDER_COLOR};border-radius:${r}mm;height:${h}mm;${fillValue ? `display:flex;align-items:center;justify-content:center;padding:0 2mm;overflow:hidden;` : ""}">${inner}</div>`;
}

function buildFieldInputHtml(field: FormTextField, fillValue?: string): string {
  if (isBookletField(field)) {
    return buildBookletFieldHtml(field, fillValue);
  }
  if (isBoxField(field)) {
    return buildBoxFieldHtml(field, fillValue);
  }
  if (isNumericField(field)) {
    return buildNumericFieldHtml(field, fillValue);
  }
  if (fillValue) {
    return `<div style="height:5.5mm;margin-top:0.8mm;padding-left:1mm;overflow:hidden;white-space:nowrap;font-size:3mm;font-weight:400;color:#000;border-bottom:0.5px solid ${BUBBLE_BORDER_COLOR};">${escapeHtml(fillValue)}</div>`;
  }
  return `<div style="border-bottom:0.5px solid ${BUBBLE_BORDER_COLOR};height:5.5mm;margin-top:0.8mm;"></div>`;
}

export function buildOpticFormHtml(design: OpticFormDesign, fill?: OpticFormFill, overlays: OpticFormOverlay[] = []): string {
  const paperWidth = design.paperSize === "A4" ? 210 : 148;
  const paperHeight = design.paperSize === "A4" ? 297 : 210;

  const placements = computeFieldPlacements(design);

  const infoHtml = design.showStudentInfo
    ? placements
        .map(({ field, xMm, yMm, colWidthMm }) => {
          const fillValue = fill?.[field.id];
          return `
          <div style="position:absolute;left:${xMm}mm;top:${yMm}mm;width:${colWidthMm}mm;">
            ${
              isNumericField(field) || isBookletField(field)
                ? `<div style="display:inline-block;max-width:100%;">
                    <div style="height:10mm;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0 1.5mm;box-sizing:border-box;text-align:center;font-size:3mm;font-weight:700;color:${BUBBLE_BORDER_COLOR};letter-spacing:0;line-height:1.15;border:0.5px solid ${BUBBLE_BORDER_COLOR};border-radius:1.5mm;">${escapeHtml(field.label.toLocaleUpperCase("tr-TR"))}</div>
                    ${buildFieldInputHtml(field, fillValue)}
                  </div>`
                : isHeadingField(field)
                  ? `<div style="font-size:${field.fontSizeMm ?? HEADING_DEFAULT_FONT_MM}mm;font-weight:700;color:${BUBBLE_BORDER_COLOR};letter-spacing:${field.letterSpacingMm ?? HEADING_DEFAULT_SPACING_MM}mm;line-height:1.15;white-space:pre-wrap;">${escapeHtml(field.label)}</div>`
                  : `<div style="font-size:2.8mm;font-weight:600;color:${BUBBLE_BORDER_COLOR};padding-left:1mm;">${escapeHtml(field.label.toLocaleUpperCase("tr-TR"))}</div>
                     ${buildFieldInputHtml(field, fillValue)}`
            }
          </div>`;
        })
        .join("")
    : "";

  const gridPlaces = computeGridPlacements(design);

  const gridsHtml = gridPlaces
    .map(
      ({ grid, xMm, yMm }) => `
      <div style="position:absolute;left:${xMm}mm;top:${yMm}mm;width:${gridColumnWidth(grid)}mm;">${buildAnswerGridHtml(grid)}</div>`,
    )
    .join("");

  const cevaplarHeader =
    design.grids.length > 0
      ? `<div style="position:absolute;top:${computeAnswerRegionTop(design)}mm;left:${LEFT_MARGIN_MM}mm;right:${RIGHT_MARGIN_MM}mm;text-align:center;font-size:4.5mm;font-weight:700;color:${BUBBLE_BORDER_COLOR};letter-spacing:1mm;">CEVAPLAR</div>`
      : "";

  const markerMarks =
    `<span style="position:absolute;top:4mm;left:4mm;width:5mm;height:5mm;background:#000;"></span>
     <span style="position:absolute;top:4mm;left:12mm;width:5mm;height:5mm;background:#000;"></span>
     <span style="position:absolute;top:4mm;right:4mm;width:5mm;height:5mm;background:#000;"></span>
     <span style="position:absolute;bottom:4mm;left:4mm;width:5mm;height:5mm;background:#000;"></span>
     <span style="position:absolute;bottom:4mm;right:4mm;width:5mm;height:5mm;background:#000;"></span>`;

  const overlaysHtml = overlays
    .map(
      (o) => `
      <div style="position:absolute;left:${o.xMm}mm;top:${o.yMm}mm;display:inline-block;max-width:${paperWidth - o.xMm - RIGHT_MARGIN_MM}mm;font-size:${o.fontSizeMm ?? 3}mm;font-weight:400;color:#000;line-height:1;letter-spacing:${o.letterSpacingMm ?? 0}mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${o.value ? escapeHtml(o.value) : "&nbsp;"}</div>`,
    )
    .join("");

  return `
    <div style="box-sizing:border-box;position:relative;width:${paperWidth}mm;height:${paperHeight}mm;padding:${MARGIN_MM}mm ${RIGHT_MARGIN_MM}mm ${MARGIN_MM}mm ${LEFT_MARGIN_MM}mm;background:#fff;color:#000;font-family:Arial, Helvetica, sans-serif;overflow:hidden;">
      ${infoHtml}
      ${gridsHtml}
      ${overlaysHtml}
      ${markerMarks}
    </div>
  `;
}

export function createDefaultForm(name: string, paperSize: PaperSize): OpticFormDesign {
  return {
    id: `form-${Date.now()}`,
    name,
    paperSize,
    title: "",
    showStudentInfo: true,
    fields: DEFAULT_OPTIC_FORM_FIELDS.map((f) => ({ ...f })),
    grids: [
      { id: `grid-${Date.now()}-tr`, subject: "Türkçe", questionCount: 15, optionCount: 4 },
      { id: `grid-${Date.now()}-so`, subject: "Sosyal Bilgiler", questionCount: 10, optionCount: 4 },
    ],
    createdAt: new Date().toISOString(),
  };
}

export function generateFormId(): string {
  return `form-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function generateElementId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
