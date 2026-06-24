import { useEffect, useMemo, useRef, useState } from "react";
import { useRegistry, type Student } from "@/context/RegistryContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Printer, Upload } from "lucide-react";

type PaperSize = "A4" | "A5";

type SourceKey =
  | "name"
  | "studentName"
  | "studentFirstName"
  | "studentLastName"
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
  | "studentName"
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

interface FieldItem {
  id: string;
  mappingKey: MappingKey;
  columnName: string;
  sourceKey: SourceKey;
  freeDataKey?: string;
}

interface FieldState {
  txtEnabled: boolean;
  textPlacement: Placement;
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
  "studentName",
  "studentFirstName",
  "studentLastName",
  "studentNumber",
  "schoolNumber",
  "class",
  "grade",
];

const DEFAULT_COLUMN_NAMES: Record<MappingKey, string> = {
  district: "Ilce",
  schoolName: "Okul Adi",
  schoolCode: "Kurum Kodu",
  studentName: "Ogrenci Adi",
  studentFirstName: "Ogrenci Adi",
  studentLastName: "Ogrenci Soyadi",
  studentNumber: "Ogrenci No",
  schoolNumber: "Okul No",
  class: "Sube",
  grade: "Sinif Seviyesi",
};

const mapToSourceKey = (key: MappingKey): SourceKey => {
  switch (key) {
    case "district":
      return "districtName";
    case "schoolName":
      return "schoolName";
    case "schoolCode":
      return "schoolCode";
    case "studentName":
      return "name";
    case "studentFirstName":
      return "studentFirstName";
    case "studentLastName":
      return "studentLastName";
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

const buildFieldsFromStorage = (): FieldItem[] => {
  try {
    const raw = localStorage.getItem("optic-coding:last-mapping");
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredMapping;
    const mapping = parsed.columnMapping || {};

    return MAPPING_ORDER
      .map((key) => {
        const columnName = String(mapping[key] || DEFAULT_COLUMN_NAMES[key]).trim();

        return {
          id: key,
          mappingKey: key,
          columnName,
          sourceKey: mapToSourceKey(key),
        } as FieldItem;
      })
      .filter(Boolean) as FieldItem[];
  } catch {
    return [];
  }
};

const fallbackFields: FieldItem[] = [
  { id: "district", mappingKey: "district", columnName: DEFAULT_COLUMN_NAMES.district, sourceKey: "districtName" },
  { id: "schoolName", mappingKey: "schoolName", columnName: DEFAULT_COLUMN_NAMES.schoolName, sourceKey: "schoolName" },
  { id: "schoolCode", mappingKey: "schoolCode", columnName: DEFAULT_COLUMN_NAMES.schoolCode, sourceKey: "schoolCode" },
  { id: "studentName", mappingKey: "studentName", columnName: DEFAULT_COLUMN_NAMES.studentName, sourceKey: "name" },
  { id: "studentFirstName", mappingKey: "studentFirstName", columnName: DEFAULT_COLUMN_NAMES.studentFirstName, sourceKey: "studentFirstName" },
  { id: "studentLastName", mappingKey: "studentLastName", columnName: DEFAULT_COLUMN_NAMES.studentLastName, sourceKey: "studentLastName" },
  { id: "studentNumber", mappingKey: "studentNumber", columnName: DEFAULT_COLUMN_NAMES.studentNumber, sourceKey: "tc" },
  { id: "schoolNumber", mappingKey: "schoolNumber", columnName: DEFAULT_COLUMN_NAMES.schoolNumber, sourceKey: "schoolNo" },
  { id: "class", mappingKey: "class", columnName: DEFAULT_COLUMN_NAMES.class, sourceKey: "class" },
  { id: "grade", mappingKey: "grade", columnName: DEFAULT_COLUMN_NAMES.grade, sourceKey: "salon" },
];

const buildInitialState = (fields: FieldItem[]): Record<string, FieldState> => {
  const state: Record<string, FieldState> = {};

  fields.forEach((field, idx) => {
    state[field.id] = {
      txtEnabled: true,
      textPlacement: { xMm: 16, yMm: 24 + idx * 9 },
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
    const freeDataKeys = new Set<string>();
    for (const student of students) {
      if (student.freeData) {
        try {
          const data = JSON.parse(student.freeData);
          for (const key of Object.keys(data)) {
            freeDataKeys.add(key);
          }
        } catch { /* ignore */ }
      }
    }

    if (freeDataKeys.size > 0) {
      return Array.from(freeDataKeys).map((key, idx) => ({
        id: `free-${idx}`,
        mappingKey: "studentName" as MappingKey,
        columnName: key,
        sourceKey: "name" as SourceKey,
        freeDataKey: key,
      }));
    }

    const fromStorage = buildFieldsFromStorage();
    return fromStorage.length > 0 ? fromStorage : fallbackFields;
  }, [students]);

  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [districtId, setDistrictId] = useState<string>("all");
  const [schoolId, setSchoolId] = useState<string>("all");
  const [className, setClassName] = useState<string>("all");
  const [fontSizeMm, setFontSizeMm] = useState<number>(4);
  const [templateDataUrl, setTemplateDataUrl] = useState<string>("");
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [fieldStateMap, setFieldStateMap] = useState<Record<string, FieldState>>(() => buildInitialState(mappedFields));

  useEffect(() => {
    setFieldStateMap(prev => {
      const next = { ...prev };
      let changed = false;
      mappedFields.forEach((field, idx) => {
        if (!next[field.id]) {
          next[field.id] = {
            txtEnabled: true,
            textPlacement: { xMm: 16, yMm: 24 + idx * 9 },
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [mappedFields]);

  const paper = PAPER_DIMENSIONS[paperSize];
  // preview is rendered in mm units so positioning is consistent with print output

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

  const resolveValue = (student: Student, field: FieldItem) => {
    if (field.freeDataKey && student.freeData) {
      try {
        const data = JSON.parse(student.freeData);
        const val = data[field.freeDataKey];
        if (val !== undefined && val !== null) return String(val);
      } catch { /* ignore */ }
    }

    const sourceKey = field.sourceKey;
    const school = schools.find((s) => s.id === student.schoolId);
    const district = districts.find((d) => d.id === school?.districtId);

    switch (sourceKey) {
      case "name":
        return student.name || "";
      case "studentName":
        return student.name || "";
      case "studentFirstName": {
        const parts = (student.name || "").trim().split(/\s+/).filter(Boolean);
        return parts[0] || student.name || "";
      }
      case "studentLastName": {
        const parts = (student.name || "").trim().split(/\s+/).filter(Boolean);
        return parts.length > 1 ? parts.slice(1).join(" ") : "";
      }
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

  const toggleTextMode = (fieldId: string, checked: boolean) => {
    setFieldStateMap((prev) => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        txtEnabled: checked,
      },
    }));
  };

  const docMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const docUpRef = useRef<((e?: MouseEvent) => void) | null>(null);

  const startDragging = (fieldId: string) => {
    setDraggingFieldId(fieldId);

    const moveHandler = (e: MouseEvent) => {
      if (!previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const yPx = e.clientY - rect.top;
      const pxPerMm = rect.width / paper.widthMm; // px per mm
      const xMm = Math.max(0, Math.min(paper.widthMm - 0.1, xPx / pxPerMm));
      const yMm = Math.max(0, Math.min(paper.heightMm - 0.1, yPx / pxPerMm));

      setFieldStateMap((prev) => ({
        ...prev,
        [fieldId]: {
          ...prev[fieldId],
          textPlacement: { xMm: Math.round(xMm * 100) / 100, yMm: Math.round(yMm * 100) / 100 },
        },
      }));
    };

    const upHandler = (e: MouseEvent | undefined) => {
      setDraggingFieldId(null);
      if (docMoveRef.current) document.removeEventListener("mousemove", docMoveRef.current);
      if (docUpRef.current) document.removeEventListener("mouseup", docUpRef.current);
      docMoveRef.current = null;
      docUpRef.current = null;
    };

    docMoveRef.current = moveHandler;
    docUpRef.current = upHandler;
    document.addEventListener("mousemove", moveHandler);
    document.addEventListener("mouseup", upHandler);
  };

  const stopDragging = () => {
    docUpRef.current?.(undefined);
  };

  const handleTemplateUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTemplateDataUrl(typeof reader.result === "string" ? reader.result : "");
      toast({ title: "Başarılı", description: `"${file.name}" yüklendi.` });
    };
    reader.onerror = () => {
      toast({ title: "Hata", description: "Dosya okunamadı.", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  };

  const handlePrintAll = () => {
    if (!isLoaded || filteredStudents.length === 0) {
      toast({ title: "Hata", description: "Yazdirilacak ogrenci bulunamadi.", variant: "destructive" });
      return;
    }

    const hasActiveField = mappedFields.some((field) => Boolean(fieldStateMap[field.id]?.txtEnabled));
    if (!hasActiveField) {
      toast({ title: "Hata", description: "En az bir alan secmelisiniz.", variant: "destructive" });
      return;
    }

    const pagesHtml = filteredStudents
      .map((student) => {
        const blocks = mappedFields
          .map((field) => {
            const state = fieldStateMap[field.id];
            if (!state?.txtEnabled) return "";

            const value = resolveValue(student, field);
            return `<div style="position:absolute;left:${state.textPlacement.xMm}mm;top:${state.textPlacement.yMm}mm;font-size:${fontSizeMm}mm;line-height:1;color:#000;white-space:nowrap;">${escapeHtml(String(value || ""))}</div>`;
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
    try {
      printWindow.print();
    } catch {
      toast({ title: "Hata", description: "Yazdırma sırasında hata oluştu.", variant: "destructive" });
    }

    toast({ title: "Yazdirma Baslatildi", description: `${filteredStudents.length} ogrenci icin cikti hazirlandi.` });
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Optik Hazırlama</h1>
        <p className="text-muted-foreground mt-1">Alanlar Excel eslesmesinden otomatik gelir. Secili alanlari fare ile istediginiz yere surukleyebilirsiniz.</p>
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
              <CardDescription>Eslesen Excel sutunlari otomatik listelenir. Tum alanlar kartlar halinde gorunur ve sadece metin olarak suruklenir.</CardDescription>
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
                <div className="grid gap-3 grid-cols-2 max-h-[420px] overflow-auto pr-1">
                  {mappedFields.map((field) => {
                    const state = fieldStateMap[field.id];
                    if (!state) return null;

                    return (
                      <div key={field.id} className="rounded-lg border border-border/70 bg-background p-3 shadow-sm transition-colors hover:border-primary/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="text-sm font-medium leading-none truncate">{field.columnName}</div>
                          </div>
                          <Checkbox checked={state.txtEnabled} onCheckedChange={(v) => toggleTextMode(field.id, v === true)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md bg-muted p-3 text-sm">Secilen ogrenci: <strong>{filteredStudents.length}</strong></div>

              <Button className="w-full" onClick={handlePrintAll}>
                <Printer className="mr-2 h-4 w-4" />
                Secili Alanlari Yazdir
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Yerlesim Onizleme</CardTitle>
              <CardDescription>Alanlari fare ile surukleyip birakabilirsiniz. Sadece metin yerlesimi kullanilir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-auto rounded-lg border bg-muted/30 p-3">
                <div ref={previewRef} className="relative mx-auto bg-white shadow-md select-none" style={{ width: `${paper.widthMm}mm`, height: `${paper.heightMm}mm` }} onMouseUp={stopDragging}>
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
                    if (!state?.txtEnabled) return null;

                    const previewValue = filteredStudents[0] ? resolveValue(filteredStudents[0], field) : "";

                    return (
                      <div
                        key={field.id}
                        className="absolute cursor-move whitespace-nowrap text-[12px] font-medium text-blue-900 select-none"
                        style={{
                          left: `${state.textPlacement.xMm}mm`,
                          top: `${state.textPlacement.yMm}mm`,
                          fontSize: `${fontSizeMm}mm`,
                        }}
                        onMouseDown={() => startDragging(field.id)}
                      >
                        {previewValue || ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
