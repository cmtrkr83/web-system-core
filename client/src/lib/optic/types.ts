export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Baloncuk gridinin 4 köşe merkez noktası (alan içinde 0-1 normalize) */
export interface GridAnchors {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

export interface OpticAreaConfig {
  id: string;
  pageIndex: number;
  subject: string;
  questionCount: number;
  optionCount: number;
  rect: NormalizedRect;
  gridAnchors?: GridAnchors;
}

export interface OpticSheetConfig {
  id: string;
  fileName?: string;
  pageCount?: number;
  frameRect?: NormalizedRect;
  areas: OpticAreaConfig[];
  createdAt?: string;
}

export interface BubbleScore {
  letter: string;
  score: number;
}

export interface QuestionAnswer {
  questionNumber: number;
  answer: string;
  confidence: number;
  scores: BubbleScore[];
  status: "ok" | "blank" | "multiple" | "weak";
}

export interface AreaResult {
  areaId: string;
  pageIndex: number;
  subject: string;
  answers: QuestionAnswer[];
  alignmentScore: number;
}

export interface PageScanResult {
  pageIndex: number;
  qrData: string;
  qrFields: Record<string, string>;
  areas: AreaResult[];
  warnings: string[];
  skewAngle: number;
  borderDetected: boolean;
}

export interface ScanSession {
  fileName: string;
  pageCount: number;
  configId: string;
  pages: PageScanResult[];
  processedAt: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface BubblePosition {
  row: number;
  col: number;
  letter: string;
  cx: number;
  cy: number;
}
