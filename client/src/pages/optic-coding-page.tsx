import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegistry, type Student } from "@/context/RegistryContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, FileDown, Printer, QrCode, Upload, Type } from "lucide-react";
import QRCode from "qrcode";

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
  qrEnabled: boolean;
  qrSizeMm: number;
  textPlacement: Placement;
  qrPlacement: Placement;
}

const PAPER_DIMENSIONS: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
};

const DEFAULT_QR_SIZE_MM = 20;

const buildInitialState = (fields: FieldItem[]): Record<string, FieldState> => {
  const state: Record<string, FieldState> = {};
  fields.forEach((field, idx) => {
    const yBase = 24 + idx * 14;
    state[field.id] = {
      txtEnabled: false,
      qrEnabled: false,
      qrSizeMm: DEFAULT_QR_SIZE_MM,
      textPlacement: { xMm: 16, yMm: yBase },
      qrPlacement: { xMm: 16, yMm: yBase },
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
  const qrCacheRef = useRef<Map<string, string>>(new Map());

  const resolveValue = (student: Student, field: FieldItem) => {
    if (field.freeDataKey && student.extraData) {
      try {
        const data = JSON.parse(student.extraData);
        const val = data[field.freeDataKey];
        if (val !== undefined && val !== null) return String(val);
      } catch { /* ignore */ }
    }

    const sourceKey = field.sourceKey;
    const school = schools.find((s) => s.id === student.schoolId);
    const district = districts.find((d) => d.id === school?.districtId);

    switch (sourceKey) {
      case "name":
        return student.fullName || "";
      case "studentName":
        return student.fullName || "";
      case "studentFirstName": {
        const parts = (student.fullName || "").trim().split(/\s+/).filter(Boolean);
        return parts[0] || student.fullName || "";
      }
      case "studentLastName": {
        const parts = (student.fullName || "").trim().split(/\s+/).filter(Boolean);
        return parts.length > 1 ? parts.slice(1).join(" ") : "";
      }
      case "tc":
        return student.studentNo || "";
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
        return student.grade || "";
      default:
        return "";
    }
  };

  const generateQrSvgUrl = useCallback(async (text: string, sizeMm: number): Promise<string> => {
    const px = Math.round(sizeMm * 96 / 25.4);
    const cacheKey = `${text}|${px}`;
    const cached = qrCacheRef.current.get(cacheKey);
    if (cached) return cached;
    try {
      const svgStr = await QRCode.toString(text, {
        type: "svg",
        margin: 1,
        width: px,
        color: { dark: "#000000", light: "#ffffff" },
      });
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
      qrCacheRef.current.set(cacheKey, dataUrl);
      return dataUrl;
    } catch (e) {
      return "";
    }
  }, []);

  const mappedFields = useMemo(() => {
    const keysSet = new Set<string>();
    for (const student of students) {
      if (student.extraData) {
        try {
          const data = JSON.parse(student.extraData);
          for (const key of Object.keys(data)) {
            keysSet.add(key);
          }
        } catch { /* ignore */ }
      }
    }
    if (keysSet.size === 0) return [];
    return Array.from(keysSet).map((key, idx) => ({
      id: `free-${idx}`,
      mappingKey: "studentName" as MappingKey,
      columnName: key,
      sourceKey: "name" as SourceKey,
      freeDataKey: key,
    }));
  }, [students]);

  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [districtId, setDistrictId] = useState<string>("all");
  const [schoolId, setSchoolId] = useState<string>("all");
  const [className, setClassName] = useState<string>("all");
  const [fontSizeMm, setFontSizeMm] = useState<number>(4);
  const [templateDataUrl, setTemplateDataUrl] = useState<string>("");
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [fieldStateMap, setFieldStateMap] = useState<Record<string, FieldState>>(() => buildInitialState(mappedFields));
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setFieldStateMap(prev => {
      const next = { ...prev };
      let changed = false;
      mappedFields.forEach((field, idx) => {
        if (!next[field.id]) {
          const yBase = 24 + idx * 14;
          next[field.id] = {
            txtEnabled: false,
            qrEnabled: false,
            qrSizeMm: DEFAULT_QR_SIZE_MM,
            textPlacement: { xMm: 16, yMm: yBase },
            qrPlacement: { xMm: 16, yMm: yBase },
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [mappedFields]);

  const paper = PAPER_DIMENSIONS[paperSize];

  const visibleSchools = useMemo(() => {
    if (districtId === "all") return schools;
    return schools.filter((s) => s.districtId === districtId);
  }, [districtId, schools]);

  const scopedStudents = useMemo(() => {
    return students.filter((student) => {
      const school = schools.find((s) => s.id === student.schoolId);
      if (!school) return districtId === "all" && schoolId === "all";
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

  const toggleFieldMode = (fieldId: string, mode: "text" | "qr") => {
    setFieldStateMap((prev) => {
      const cur = prev[fieldId];
      if (!cur) return prev;
      if (mode === "text") {
        return { ...prev, [fieldId]: { ...cur, txtEnabled: !cur.txtEnabled } };
      }
      return { ...prev, [fieldId]: { ...cur, qrEnabled: !cur.qrEnabled } };
    });
  };

  const setQrSize = (fieldId: string, sizeMm: number) => {
    setFieldStateMap((prev) => {
      const cur = prev[fieldId];
      if (!cur) return prev;
      return { ...prev, [fieldId]: { ...cur, qrSizeMm: Math.max(10, Math.min(60, sizeMm)) } };
    });
  };

  const docMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const docUpRef = useRef<((e?: MouseEvent) => void) | null>(null);

  const startDragging = (fieldId: string, mode: "text" | "qr") => {
    setDraggingFieldId(fieldId);
    const moveHandler = (e: MouseEvent) => {
      if (!previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const yPx = e.clientY - rect.top;
      const pxPerMm = rect.width / paper.widthMm;
      const xMm = Math.max(0, Math.min(paper.widthMm - 0.1, xPx / pxPerMm));
      const yMm = Math.max(0, Math.min(paper.heightMm - 0.1, yPx / pxPerMm));
      const pos = { xMm: Math.round(xMm * 100) / 100, yMm: Math.round(yMm * 100) / 100 };
      setFieldStateMap((prev) => {
        const cur = prev[fieldId];
        if (!cur) return prev;
        return {
          ...prev,
          [fieldId]: {
            ...cur,
            [mode === "text" ? "textPlacement" : "qrPlacement"]: pos,
          },
        };
      });
    };
    const upHandler = (_e?: MouseEvent) => {
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

  const buildPageHtml = useCallback((student: Student): string => {
    const blocks: string[] = [];
    for (const field of mappedFields) {
      const state = fieldStateMap[field.id];
      if (!state) continue;
      const value = resolveValue(student, field);
      if (state.txtEnabled && value) {
        blocks.push(`<div style="position:absolute;left:${state.textPlacement.xMm}mm;top:${state.textPlacement.yMm}mm;font-size:${fontSizeMm}mm;line-height:1;color:#000;white-space:nowrap;">${escapeHtml(value)}</div>`);
      }
      if (state.qrEnabled && value) {
        blocks.push(`<img src="" data-qr-text="${escapeHtml(value)}" data-qr-size="${state.qrSizeMm}" style="position:absolute;left:${state.qrPlacement.xMm}mm;top:${state.qrPlacement.yMm}mm;width:${state.qrSizeMm}mm;height:${state.qrSizeMm}mm;image-rendering:pixelated;" />`);
      }
    }
    return `<div class="optic-page" style="position:relative;width:${paper.widthMm}mm;height:${paper.heightMm}mm;overflow:hidden;background:#fff;">${templateDataUrl ? `<img src="${templateDataUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;" />` : ""}${blocks.join("")}</div>`;
  }, [mappedFields, fieldStateMap, resolveValue, fontSizeMm, paper, templateDataUrl]);

  const mmToPx = (mm: number) => Math.round(mm * 96 / 25.4);

  const generatePdfViaHtml2canvas = useCallback(async (): Promise<Blob | null> => {
    const { default: html2canvas } = await import("html2canvas");
    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: paperSize, hotfixes: ["px_scaling"] });
    const wPx = mmToPx(paper.widthMm);
    const hPx = mmToPx(paper.heightMm);

    // Tum SVG karekodlari once olustur (parallel)
    const qrSvgCache = new Map<string, string>();
    const qrPromises: Promise<void>[] = [];
    for (const student of filteredStudents) {
      for (const field of mappedFields) {
        const state = fieldStateMap[field.id];
        if (!state?.qrEnabled) continue;
        const value = resolveValue(student, field);
        if (!value) continue;
        const key = `${value}|${Math.round(state.qrSizeMm * 10)}`;
        if (!qrSvgCache.has(key)) {
          qrPromises.push(
            generateQrSvgUrl(value, state.qrSizeMm).then(url => { qrSvgCache.set(key, url); })
          );
        }
      }
    }
    await Promise.all(qrPromises);

    for (let si = 0; si < filteredStudents.length; si++) {
      if (si > 0) pdf.addPage();

      // Sayfa HTML'ini olustur, DOM'a ekle, QR'lari yukle
      const wrapper = document.createElement("div");
      wrapper.innerHTML = buildPageHtml(filteredStudents[si]);
      const pageEl = wrapper.firstElementChild as HTMLElement;
      pageEl.style.width = `${wPx}px`;
      pageEl.style.height = `${hPx}px`;
      pageEl.style.position = "fixed";
      pageEl.style.left = "-9999px";
      pageEl.style.top = "0";
      pageEl.style.zIndex = "-1";
      document.body.appendChild(pageEl);

      // QR img src'lerini ata (SVG data URL)
      for (const img of Array.from(pageEl.querySelectorAll<HTMLImageElement>("img[data-qr-text]"))) {
        const text = img.getAttribute("data-qr-text") || "";
        const sizeMm = Number(img.getAttribute("data-qr-size")) || 20;
        img.src = qrSvgCache.get(`${text}|${Math.round(sizeMm * 10)}`) || "";
      }

      // Gorsellerin yuklenmesini bekle
      const imgs = Array.from(pageEl.querySelectorAll("img"));
      await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return;
        return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
      }));

      // html2canvas ile yakala
      const canvas = await html2canvas(pageEl, { scale: 1, useCORS: false, logging: false, width: wPx, height: hPx });
      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", 0, 0, paper.widthMm, paper.heightMm, undefined, "FAST");

      document.body.removeChild(pageEl);
    }
    return pdf.output("blob");
  }, [filteredStudents, mappedFields, fieldStateMap, resolveValue, buildPageHtml, generateQrSvgUrl, paper, paperSize]);

  const handleExportPdf = async () => {
    if (!isLoaded || filteredStudents.length === 0) {
      toast({ title: "Hata", description: "Yazdirilacak ogrenci bulunamadi.", variant: "destructive" });
      return;
    }
    const hasActiveField = mappedFields.some((field) => {
      const s = fieldStateMap[field.id];
      return s?.txtEnabled || s?.qrEnabled;
    });
    if (!hasActiveField) {
      toast({ title: "Hata", description: "En az bir alan secmelisiniz.", variant: "destructive" });
      return;
    }
    const blob = await generatePdfViaHtml2canvas();
    if (!blob) {
      toast({ title: "Hata", description: "PDF olusturulamadi.", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "optik-kodlama.pdf";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "PDF Olusturuldu", description: `${filteredStudents.length} ogrenci icin PDF kaydedildi.` });
  };

  const handlePrintAll = async () => {
    if (!isLoaded || filteredStudents.length === 0) {
      toast({ title: "Hata", description: "Yazdirilacak ogrenci bulunamadi.", variant: "destructive" });
      return;
    }
    const hasActiveField = mappedFields.some((field) => {
      const s = fieldStateMap[field.id];
      return s?.txtEnabled || s?.qrEnabled;
    });
    if (!hasActiveField) {
      toast({ title: "Hata", description: "En az bir alan secmelisiniz.", variant: "destructive" });
      return;
    }

    // Tum karekodlari SVG olarak olustur (once, parallel)
    const qrBatch = new Map<string, string>();
    const qrPromises: Promise<void>[] = [];
    for (const student of filteredStudents) {
      for (const field of mappedFields) {
        const state = fieldStateMap[field.id];
        if (!state?.qrEnabled) continue;
        const value = resolveValue(student, field);
        if (!value) continue;
        const key = `${value}|${Math.round(state.qrSizeMm * 10)}`;
        if (!qrBatch.has(key)) {
          qrPromises.push(
            generateQrSvgUrl(value, state.qrSizeMm).then(url => { qrBatch.set(key, url); })
          );
        }
      }
    }
    await Promise.all(qrPromises);

    const allPagesHtml: string[] = [];
    for (const student of filteredStudents) {
      const blocks: string[] = [];
      for (const field of mappedFields) {
        const state = fieldStateMap[field.id];
        if (!state) continue;
        const value = resolveValue(student, field);
        if (state.txtEnabled && value) {
          blocks.push(`<div style="position:absolute;left:${state.textPlacement.xMm}mm;top:${state.textPlacement.yMm}mm;font-size:${fontSizeMm}mm;line-height:1;color:#000;white-space:nowrap;">${escapeHtml(value)}</div>`);
        }
        if (state.qrEnabled && value) {
          const key = `${value}|${Math.round(state.qrSizeMm * 10)}`;
          const qrUrl = qrBatch.get(key) || "";
          if (qrUrl) {
            blocks.push(`<img src="${qrUrl}" alt="QR" style="position:absolute;left:${state.qrPlacement.xMm}mm;top:${state.qrPlacement.yMm}mm;width:${state.qrSizeMm}mm;height:${state.qrSizeMm}mm;image-rendering:pixelated;" />`);
          }
        }
      }
      allPagesHtml.push(`<section class="optic-page">${templateDataUrl ? `<img src="${templateDataUrl}" alt="optic-template" class="optic-template" />` : ""}${blocks.join("")}</section>`);
    }

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      toast({ title: "Hata", description: "Yazdirma penceresi acilamadi.", variant: "destructive" });
      return;
    }
    printWindow.document.write(`<!doctype html><html lang="tr"><head><meta charset="UTF-8" /><style>@page{size:${paperSize} portrait;margin:0;}html,body{margin:0;padding:0;}body{background:#fff;}.optic-page{position:relative;width:${paper.widthMm}mm;height:${paper.heightMm}mm;page-break-after:always;overflow:hidden;}.optic-page:last-child{page-break-after:auto;}.optic-template{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;}</style></head><body>${allPagesHtml.join("")}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    try { printWindow.print(); } catch { /* ignore */ }
    toast({ title: "Yazdirma Baslatildi", description: `${filteredStudents.length} ogrenci icin cikti hazirlandi.` });
  };

  const hasQrEnabled = useMemo(() => {
    return mappedFields.some((f) => fieldStateMap[f.id]?.qrEnabled);
  }, [mappedFields, fieldStateMap]);

  useEffect(() => {
    if (!hasQrEnabled || !filteredStudents[0]) return;
    let cancelled = false;
    const load = async () => {
      const results: Record<string, string> = {};
      for (const field of mappedFields) {
        const state = fieldStateMap[field.id];
        if (!state?.qrEnabled) continue;
        const value = resolveValue(filteredStudents[0], field);
        if (!value) continue;
        const url = await generateQrSvgUrl(value, state.qrSizeMm);
        if (!cancelled) results[field.id] = url;
      }
      if (!cancelled) setQrDataUrls(results);
    };
    load();
    return () => { cancelled = true; };
  }, [hasQrEnabled, mappedFields, filteredStudents, fieldStateMap, generateQrSvgUrl]);

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Optik Hazırlama</h1>
        <p className="text-muted-foreground mt-1">Excel'den gelen alanlari metin veya karekod olarak konumlandirip yazdirabilirsiniz.</p>
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
              <CardDescription>Her alan icin metin ve/veya karekod modunu aktif edip boyutlandirabilirsiniz.</CardDescription>
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
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              title="Metin"
                              className={`p-1 rounded text-xs border ${state.txtEnabled ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
                              onClick={() => toggleFieldMode(field.id, "text")}
                            >
                              <Type className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Karekod"
                              className={`p-1 rounded text-xs border ${state.qrEnabled ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
                              onClick={() => toggleFieldMode(field.id, "qr")}
                            >
                              <QrCode className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {state.qrEnabled && (
                          <div className="mt-2">
                            <Label className="text-[10px] text-muted-foreground">Karekod Boyutu (mm)</Label>
                            <Input
                              type="number"
                              min={10}
                              max={60}
                              step={1}
                              className="h-6 text-xs mt-0.5"
                              value={state.qrSizeMm}
                              onChange={(e) => setQrSize(field.id, Number(e.target.value) || DEFAULT_QR_SIZE_MM)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md bg-muted p-3 text-sm">Secilen ogrenci: <strong>{filteredStudents.length}</strong></div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={handlePrintAll}>
                  <Printer className="mr-2 h-4 w-4" />
                  Yazdir
                </Button>
                <Button className="flex-1" variant="outline" onClick={handleExportPdf}>
                  <FileDown className="mr-2 h-4 w-4" />
                  PDF Export
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Yerlesim Onizleme</CardTitle>
              <CardDescription>Alanlari fare ile surukleyip birakabilirsiniz. Karekodlar otomatik olarak guncellenir.</CardDescription>
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
                    if (!state) return null;
                    const previewValue = filteredStudents[0] ? resolveValue(filteredStudents[0], field) : "";

                    return (
                      <>
                        {state.txtEnabled && (
                          <div
                            key={`txt-${field.id}`}
                            className="absolute cursor-move whitespace-nowrap text-[12px] font-medium select-none"
                            style={{
                              left: `${state.textPlacement.xMm}mm`,
                              top: `${state.textPlacement.yMm}mm`,
                              fontSize: `${fontSizeMm}mm`,
                              color: previewValue ? "#1e40af" : "#94a3b8",
                            }}
                            onMouseDown={() => startDragging(field.id, "text")}
                          >
                            {previewValue || field.columnName}
                          </div>
                        )}
                        {state.qrEnabled && previewValue && qrDataUrls[field.id] && (
                          <div
                            key={`qr-${field.id}`}
                            className="absolute cursor-move inline-block select-none"
                            style={{
                              left: `${state.qrPlacement.xMm}mm`,
                              top: `${state.qrPlacement.yMm}mm`,
                            }}
                            onMouseDown={() => startDragging(field.id, "qr")}
                          >
                            <img
                              src={qrDataUrls[field.id]}
                              alt={`QR-${field.columnName}`}
                              style={{
                                width: `${state.qrSizeMm}mm`,
                                height: `${state.qrSizeMm}mm`,
                                imageRendering: "pixelated",
                              }}
                              draggable={false}
                            />
                          </div>
                        )}
                      </>
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
