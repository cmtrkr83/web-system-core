import { useMemo, useRef, useState } from "react";
import { useRegistry, type Student } from "@/context/RegistryContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Printer, Upload } from "lucide-react";

type PaperSize = "A4" | "A5";
type OmrNormalizeMode = "exact" | "right" | "left";

type SourceKey =
  | "name"
  | "tc"
  | "schoolNo"
  | "schoolName"
  | "schoolCode"
  | "districtName"
  | "class"
  | "salon";

type MappingKey =
  | "district"
  | "schoolName"
  | "schoolCode"
  | "studentFirstName"
  | "studentLastName"
  | "studentNumber"
  | "schoolNumber"
  | "class"
  | "grade";

interface Placement {
  xMm: number;
  yMm: number;
}

interface OmrConfig {
  digits: number;
  rows: number;
  startDigit: number;
  cellGapXmm: number;
  cellGapYmm: number;
  bubbleRadiusMm: number;
  normalizeMode: OmrNormalizeMode;
}

interface FieldItem {
  id: string;
  mappingKey: MappingKey;
  columnName: string;
  sourceKey: SourceKey;
}

interface FieldState {
  txtEnabled: boolean;
  omrEnabled: boolean;
  textPlacement: Placement;
  omrPlacement: Placement;
  omr: OmrConfig;
}

interface OmrParseResult {
  rowIndexes: number[];
  error?: string;
}

interface StoredMapping {
  sourceFileName?: string;
  savedAt?: string;
  columnMapping?: Partial<Record<MappingKey, string>>;
}

const PAPER_DIMENSIONS: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
};

const MAPPING_ORDER: MappingKey[] = [
  "district",
  "schoolName",
  "schoolCode",
  "studentFirstName",
  "studentLastName",
  "studentNumber",
  "schoolNumber",
  "class",
  "grade",
];

const mapToSourceKey = (key: MappingKey): SourceKey => {
  switch (key) {
    case "district":
      return "districtName";
    case "schoolName":
      return "schoolName";
    case "schoolCode":
      return "schoolCode";
    case "studentFirstName":
      return "name";
    case "studentLastName":
      return "name";
    case "studentNumber":
      return "tc";
    case "schoolNumber":
      return "schoolNo";
    case "class":
      return "class";
    case "grade":
      return "salon";
    default:
      return "name";
  }
};

const defaultDigitsBySource = (source: SourceKey) => {
  if (source === "tc") return 8;
  if (source === "schoolNo") return 5;
  if (source === "salon") return 4;
  return 6;
};

const buildFieldsFromStorage = (): FieldItem[] => {
  try {
    const raw = localStorage.getItem("optic-coding:last-mapping");
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredMapping;
    const mapping = parsed.columnMapping || {};

    const fields = MAPPING_ORDER
      .map((key) => {
        const columnName = String(mapping[key] || "").trim();
        if (!columnName) return null;

        return {
          id: key,
          mappingKey: key,
          columnName,
          sourceKey: mapToSourceKey(key),
        } as FieldItem;
      })
      .filter(Boolean) as FieldItem[];

    return fields;
  } catch {
    return [];
  }
};

const fallbackFields: FieldItem[] = [
  { id: "district", mappingKey: "district", columnName: "Ilce", sourceKey: "districtName" },
  { id: "schoolName", mappingKey: "schoolName", columnName: "Okul Adi", sourceKey: "schoolName" },
  { id: "schoolCode", mappingKey: "schoolCode", columnName: "Kurum Kodu", sourceKey: "schoolCode" },
  { id: "studentNumber", mappingKey: "studentNumber", columnName: "OPAQ", sourceKey: "tc" },
  { id: "schoolNumber", mappingKey: "schoolNumber", columnName: "Okul No", sourceKey: "schoolNo" },
  { id: "class", mappingKey: "class", columnName: "Sube", sourceKey: "class" },
  { id: "grade", mappingKey: "grade", columnName: "Sinif Seviyesi", sourceKey: "salon" },
];

const buildInitialState = (fields: FieldItem[]): Record<string, FieldState> => {
  const state: Record<string, FieldState> = {};

  fields.forEach((field, idx) => {
    state[field.id] = {
      txtEnabled: idx < 3,
      omrEnabled: false,
      textPlacement: { xMm: 16, yMm: 24 + idx * 9 },
      omrPlacement: { xMm: 100, yMm: 24 + idx * 9 },
      omr: {
        digits: defaultDigitsBySource(field.sourceKey),
        rows: 10,
        startDigit: 0,
        cellGapXmm: 6.2,
        cellGapYmm: 6.2,
        bubbleRadiusMm: 2.4,
        normalizeMode: "right",
      },
    };
  });

  return state;
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export default function OpticCoding() {
  const { districts, schools, students, isLoaded } = useRegistry();
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement | null>(null);

  const mappedFields = useMemo(() => {
    const fromStorage = buildFieldsFromStorage();
    return fromStorage.length > 0 ? fromStorage : fallbackFields;
  }, []);

  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [districtId, setDistrictId] = useState<string>("all");
  const [schoolId, setSchoolId] = useState<string>("all");
  const [className, setClassName] = useState<string>("all");
  const [fontSizeMm, setFontSizeMm] = useState<number>(4);
  const [templateDataUrl, setTemplateDataUrl] = useState<string>("");
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [fieldStateMap, setFieldStateMap] = useState<Record<string, FieldState>>(() => buildInitialState(mappedFields));
  const [validationIssues, setValidationIssues] = useState<string[]>([]);

  const paper = PAPER_DIMENSIONS[paperSize];
  const previewWidthPx = 460;
  const previewScale = previewWidthPx / paper.widthMm;
  const previewHeightPx = paper.heightMm * previewScale;

  const visibleSchools = useMemo(() => {
    if (districtId === "all") return schools;
    return schools.filter((s) => s.districtId === districtId);
  }, [districtId, schools]);

  const scopedStudents = useMemo(() => {
    return students.filter((student) => {
      const school = schools.find((s) => s.id === student.schoolId);
      if (!school) return false;
      if (districtId !== "all" && school.districtId !== districtId) return false;
      if (schoolId !== "all" && school.id !== schoolId) return false;
      return true;
    });
  }, [students, schools, districtId, schoolId]);

  const classOptions = useMemo(() => {
    const classes = new Set(scopedStudents.map((s) => s.class).filter(Boolean));
    return Array.from(classes).sort((a, b) => a.localeCompare(b, "tr-TR"));
  }, [scopedStudents]);

  const filteredStudents = useMemo(() => {
    if (className === "all") return scopedStudents;
    return scopedStudents.filter((s) => s.class === className);
  }, [scopedStudents, className]);

  const sampleStudent = filteredStudents[0] || null;

  const resolveValue = (student: Student, sourceKey: SourceKey) => {
    const school = schools.find((s) => s.id === student.schoolId);
    const district = districts.find((d) => d.id === school?.districtId);

    switch (sourceKey) {
      case "name":
        return student.name || "";
      case "tc":
        return student.tc || "";
      case "schoolNo":
        return student.schoolNo || "";
      case "schoolName":
        return school?.name || "";
      case "schoolCode":
        return school?.code || school?.id || "";
      case "districtName":
        return district?.name || "";
      case "class":
        return student.class || "";
      case "salon":
        return student.salon || "";
      default:
        return "";
    }
  };

  const parseOmr = (rawValue: string, config: OmrConfig): OmrParseResult => {
    const onlyDigits = String(rawValue).replace(/\D/g, "");
    if (!onlyDigits) return { rowIndexes: [], error: "Sayisal deger yok" };

    let normalized = onlyDigits;

    if (config.normalizeMode === "exact" && normalized.length !== config.digits) {
      return { rowIndexes: [], error: `${config.digits} hane bekleniyor` };
    }

    if (config.normalizeMode === "right") {
      if (normalized.length < config.digits) return { rowIndexes: [], error: `${config.digits} haneden kisa` };
      normalized = normalized.slice(-config.digits);
    }

    if (config.normalizeMode === "left") {
      if (normalized.length < config.digits) return { rowIndexes: [], error: `${config.digits} haneden kisa` };
      normalized = normalized.slice(0, config.digits);
    }

    if (normalized.length !== config.digits) {
      return { rowIndexes: [], error: `${config.digits} hane bekleniyor` };
    }

    const rowIndexes: number[] = [];
    for (const ch of normalized) {
      const num = Number(ch);
      if (Number.isNaN(num)) return { rowIndexes: [], error: "Sayisal olmayan karakter var" };

      const rowIndex = num - config.startDigit;
      if (rowIndex < 0 || rowIndex >= config.rows) {
        return { rowIndexes: [], error: `Rakam araligi ${config.startDigit}-${config.startDigit + config.rows - 1}` };
      }
      rowIndexes.push(rowIndex);
    }

    return { rowIndexes };
  };

  const toggleRenderMode = (fieldId: string, mode: "txt" | "omr", checked: boolean) => {
    setFieldStateMap((prev) => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        txtEnabled: mode === "txt" ? checked : prev[fieldId].txtEnabled,
        omrEnabled: mode === "omr" ? checked : prev[fieldId].omrEnabled,
      },
    }));
  };

  const updateOmr = (fieldId: string, patch: Partial<OmrConfig>) => {
    setFieldStateMap((prev) => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        omr: {
          ...prev[fieldId].omr,
          ...patch,
        },
      },
    }));
  };

  const startDragging = (itemId: string) => setDraggingItemId(itemId);
  const stopDragging = () => setDraggingItemId(null);

  const handlePreviewMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingItemId || !previewRef.current) return;

    const [fieldId, mode] = draggingItemId.split(":") as [string, "txt" | "omr"];
    const rect = previewRef.current.getBoundingClientRect();
    const xMm = Math.max(0, Math.min(paper.widthMm - 5, (event.clientX - rect.left) / previewScale));
    const yMm = Math.max(0, Math.min(paper.heightMm - 5, (event.clientY - rect.top) / previewScale));

    setFieldStateMap((prev) => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        textPlacement: mode === "txt" ? { xMm, yMm } : prev[fieldId].textPlacement,
        omrPlacement: mode === "omr" ? { xMm, yMm } : prev[fieldId].omrPlacement,
      },
    }));
  };

  const handleTemplateUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setTemplateDataUrl(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  };

  const buildIssues = () => {
    const issues: string[] = [];

    for (const student of filteredStudents) {
      for (const field of mappedFields) {
        const state = fieldStateMap[field.id];
        if (!state?.omrEnabled) continue;

        const value = resolveValue(student, field.sourceKey);
        if (!value) continue;

        const parsed = parseOmr(value, state.omr);
        if (parsed.error) {
          issues.push(`${student.name} - ${field.columnName}: ${parsed.error}`);
        }
      }
    }

    return issues;
  };

  const handlePrintAll = () => {
    if (!isLoaded || filteredStudents.length === 0) {
      toast({ title: "Hata", description: "Yazdirilacak ogrenci bulunamadi.", variant: "destructive" });
      return;
    }

    const hasActiveField = mappedFields.some((f) => {
      const state = fieldStateMap[f.id];
      return Boolean(state?.txtEnabled || state?.omrEnabled);
    });

    if (!hasActiveField) {
      toast({ title: "Hata", description: "En az bir alan secmelisiniz.", variant: "destructive" });
      return;
    }

    const issues = buildIssues();
    setValidationIssues(issues.slice(0, 60));

    if (issues.length > 0) {
      toast({ title: "Uyari", description: `${issues.length} kayitta OMR uyumsuzlugu var. Uygunsuz alanlar bos gecilecek.` });
    }

    const pagesHtml = filteredStudents
      .map((student) => {
        const blocks = mappedFields
          .map((field) => {
            const state = fieldStateMap[field.id];
            if (!state) return "";

            const value = resolveValue(student, field.sourceKey);
            const parts: string[] = [];

            if (state.txtEnabled) {
              parts.push(`<div style="position:absolute;left:${state.textPlacement.xMm}mm;top:${state.textPlacement.yMm}mm;font-size:${fontSizeMm}mm;line-height:1;color:#000;white-space:nowrap;">${escapeHtml(String(value || ""))}</div>`);
            }

            if (state.omrEnabled && value) {
              const parsed = parseOmr(value, state.omr);
              if (!parsed.error) {
                const omrDots = parsed.rowIndexes
                  .map((rowIndex, colIndex) => {
                    const left = state.omrPlacement.xMm + colIndex * state.omr.cellGapXmm;
                    const top = state.omrPlacement.yMm + rowIndex * state.omr.cellGapYmm;
                    const diameter = state.omr.bubbleRadiusMm * 2;
                    return `<div style="position:absolute;left:${left}mm;top:${top}mm;width:${diameter}mm;height:${diameter}mm;border-radius:50%;background:#000;"></div>`;
                  })
                  .join("");
                parts.push(omrDots);
              }
            }

            return parts.join("");
          })
          .join("");

        return `<section class="optic-page">${templateDataUrl ? `<img src="${templateDataUrl}" alt="optic-template" class="optic-template" />` : ""}${blocks}</section>`;
      })
      .join("");

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      toast({ title: "Hata", description: "Yazdirma penceresi acilamadi.", variant: "destructive" });
      return;
    }

    printWindow.document.write(`<!doctype html><html lang="tr"><head><meta charset="UTF-8" /><style>@page{size:${paperSize} portrait;margin:0;}html,body{margin:0;padding:0;}body{background:#fff;}.optic-page{position:relative;width:${paper.widthMm}mm;height:${paper.heightMm}mm;page-break-after:always;overflow:hidden;}.optic-page:last-child{page-break-after:auto;}.optic-template{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;}</style></head><body>${pagesHtml}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();

    toast({ title: "Yazdirma Baslatildi", description: `${filteredStudents.length} ogrenci icin cikti hazirlandi.` });
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Optik Kodlama</h1>
        <p className="text-muted-foreground mt-1">Alanlar Excel eslesmesinden otomatik gelir. Her alani TXT, OMR veya ikisi birden secebilirsiniz.</p>
      </div>

      {!isLoaded ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Henuz Veri Yuklenmemis</h3>
            <p className="text-muted-foreground max-w-md">Optik kodlama icin once Kutuk Belirleme sayfasindan Excel dosyasi yukleyiniz.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Alan Secimi</CardTitle>
              <CardDescription>Eslesen Excel sutunlari otomatik listelenir. Kodlama profili kullanilmadan tum kontrol bu paneldedir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="paper-size">Kagit Boyutu</Label>
                <select id="paper-size" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={paperSize} onChange={(e) => setPaperSize(e.target.value as PaperSize)}>
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="district-filter">Ilce</Label>
                <select id="district-filter" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={districtId} onChange={(e) => { setDistrictId(e.target.value); setSchoolId("all"); setClassName("all"); }}>
                  <option value="all">Tumu</option>
                  {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="school-filter">Okul</Label>
                <select id="school-filter" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setClassName("all"); }}>
                  <option value="all">Tumu</option>
                  {visibleSchools.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="class-filter">Sube</Label>
                <select id="class-filter" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={className} onChange={(e) => setClassName(e.target.value)}>
                  <option value="all">Tumu</option>
                  {classOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-upload">Hazir Optik Gorseli</Label>
                <Input id="template-upload" type="file" accept="image/*" onChange={handleTemplateUpload} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="font-size">Metin Boyutu (mm)</Label>
                <Input id="font-size" type="number" min={2} max={8} step={0.2} value={fontSizeMm} onChange={(e) => setFontSizeMm(Number(e.target.value) || 4)} />
              </div>

              <div className="space-y-2">
                <Label>Eslesen Alanlar</Label>
                <div className="space-y-3 rounded-md border p-3 max-h-[360px] overflow-auto">
                  {mappedFields.map((field) => {
                    const state = fieldStateMap[field.id];
                    if (!state) return null;

                    return (
                      <div key={field.id} className="rounded border border-border/70 p-2 space-y-2">
                        <div className="text-sm font-medium">{field.columnName}</div>
                        <div className="flex items-center gap-6 text-sm">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={state.txtEnabled} onCheckedChange={(v) => toggleRenderMode(field.id, "txt", v === true)} />
                            <span>TXT</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox checked={state.omrEnabled} onCheckedChange={(v) => toggleRenderMode(field.id, "omr", v === true)} />
                            <span>OMR</span>
                          </label>
                        </div>

                        {state.omrEnabled && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="space-y-1">
                              <Label className="text-xs">Hane</Label>
                              <Input type="number" min={1} max={20} value={state.omr.digits} onChange={(e) => updateOmr(field.id, { digits: Math.max(1, Number(e.target.value) || 1) })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Yaricap (mm)</Label>
                              <Input type="number" min={0.5} max={3.5} step={0.1} value={state.omr.bubbleRadiusMm} onChange={(e) => updateOmr(field.id, { bubbleRadiusMm: Math.max(0.5, Number(e.target.value) || 0.5) })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Sutun Araligi</Label>
                              <Input type="number" min={1} max={12} step={0.1} value={state.omr.cellGapXmm} onChange={(e) => updateOmr(field.id, { cellGapXmm: Math.max(1, Number(e.target.value) || 1) })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Satir Araligi</Label>
                              <Input type="number" min={1} max={12} step={0.1} value={state.omr.cellGapYmm} onChange={(e) => updateOmr(field.id, { cellGapYmm: Math.max(1, Number(e.target.value) || 1) })} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md bg-muted p-3 text-sm">Secilen ogrenci: <strong>{filteredStudents.length}</strong></div>

              <Button className="w-full" onClick={handlePrintAll}>
                <Printer className="mr-2 h-4 w-4" />
                Secili Alanlarla Yazdir
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Yerlesim Onizleme</CardTitle>
              <CardDescription>TXT ve OMR katmanlarini ayri ayri surukleyebilirsiniz. Sadece secili olanlar yazdirilir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-auto rounded-lg border bg-muted/30 p-3">
                <div ref={previewRef} className="relative mx-auto bg-white shadow-md select-none" style={{ width: `${previewWidthPx}px`, height: `${previewHeightPx}px` }} onMouseMove={handlePreviewMouseMove} onMouseUp={stopDragging} onMouseLeave={stopDragging}>
                  {templateDataUrl ? (
                    <img src={templateDataUrl} alt="Optik sablon" className="absolute inset-0 h-full w-full object-fill pointer-events-none" />
                  ) : (
                    <div className="absolute inset-0 grid place-content-center text-sm text-muted-foreground border-2 border-dashed border-muted-foreground/25">
                      <div className="text-center space-y-1">
                        <Upload className="w-5 h-5 mx-auto" />
                        <p>Sablon yuklerseniz burada gorunur.</p>
                      </div>
                    </div>
                  )}

                  {mappedFields.map((field) => {
                    const state = fieldStateMap[field.id];
                    if (!state) return null;

                    const previewValue = sampleStudent ? resolveValue(sampleStudent, field.sourceKey) : "";
                    const parsed = previewValue ? parseOmr(previewValue, state.omr) : null;

                    const omrWidth = (state.omr.digits - 1) * state.omr.cellGapXmm * previewScale + state.omr.bubbleRadiusMm * 2 * previewScale;
                    const omrHeight = (state.omr.rows - 1) * state.omr.cellGapYmm * previewScale + state.omr.bubbleRadiusMm * 2 * previewScale;

                    return (
                      <div key={field.id}>
                        {state.txtEnabled && (
                          <div className="absolute px-2 py-0.5 text-[11px] rounded border border-blue-300 bg-blue-100/90 text-blue-900 font-medium cursor-move" style={{ left: `${state.textPlacement.xMm * previewScale}px`, top: `${state.textPlacement.yMm * previewScale}px` }} onMouseDown={() => startDragging(`${field.id}:txt`)}>
                            {field.columnName}
                          </div>
                        )}

                        {state.omrEnabled && (
                          <div className="absolute cursor-move" style={{ left: `${state.omrPlacement.xMm * previewScale}px`, top: `${state.omrPlacement.yMm * previewScale}px` }} onMouseDown={() => startDragging(`${field.id}:omr`)}>
                            <div className="relative border border-emerald-400/80 bg-transparent" style={{ width: `${omrWidth}px`, height: `${omrHeight}px` }}>
                              {parsed && !parsed.error
                                ? parsed.rowIndexes.map((rowIndex, colIndex) => {
                                    const r = state.omr.bubbleRadiusMm * previewScale;
                                    const left = colIndex * state.omr.cellGapXmm * previewScale;
                                    const top = rowIndex * state.omr.cellGapYmm * previewScale;
                                    return (
                                      <div
                                        key={`${field.id}-${colIndex}-${rowIndex}`}
                                        className="bg-black"
                                        style={{
                                          position: "absolute",
                                          left: `${left}px`,
                                          top: `${top}px`,
                                          width: `${r * 2}px`,
                                          height: `${r * 2}px`,
                                          borderRadius: "999px",
                                        }}
                                      />
                                    );
                                  })
                                : null}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {validationIssues.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                  <div className="font-medium mb-1">Yazdirma Uyari Listesi (ilk 60)</div>
                  <ul className="list-disc list-inside space-y-1 text-amber-900">
                    {validationIssues.map((issue, idx) => <li key={`${issue}-${idx}`}>{issue}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
