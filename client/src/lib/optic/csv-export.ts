import type { ScanSession } from "./types";

const BOM = "\uFEFF";

export function buildScanCsv(session: ScanSession): string {
  const fieldKeys = new Set<string>();
  for (const page of session.pages) {
    Object.keys(page.qrFields).forEach((key) => fieldKeys.add(key));
  }

  const qrColumns = Array.from(fieldKeys).sort((a, b) => a.localeCompare(b, "tr-TR"));
  const header = [
    "sayfa",
    "karekod",
    ...qrColumns,
    "ders",
    "soru_no",
    "cevap",
    "guven",
    "durum",
  ].join(";");

  const rows: string[] = [header];

  for (const page of session.pages) {
    const pageNo = page.pageIndex + 1;
    const qr = sanitize(page.qrData);

    for (const area of page.areas) {
      for (const answer of area.answers) {
        const cols = [
          String(pageNo),
          qr,
          ...qrColumns.map((key) => sanitize(page.qrFields[key] ?? "")),
          sanitize(area.subject),
          String(answer.questionNumber),
          sanitize(answer.answer),
          String(answer.confidence),
          answer.status,
        ];
        rows.push(cols.join(";"));
      }
    }
  }

  return BOM + rows.join("\n");
}

export function downloadCsv(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function sanitize(value: string): string {
  return String(value ?? "").replace(/[;\n\r]/g, " ").trim();
}
