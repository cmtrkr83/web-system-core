import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegistry, type Student } from "@/context/RegistryContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  buildOpticFormHtml,
  fetchFormDesigns,
  isHeadingField,
  PDF_RENDER_DPI,
  QR_DEFAULT_SIZE_MM,
  type OpticFormDesign,
  type OpticFormFill,
  type OpticFormOverlay,
} from "@/lib/optic-form";
import {
  buildQrDataUrl,
  createPdfFromPages,
  extractExcelColumns,
  findDistrict,
  findSchool,
  mmToPx,
  openPrintWindow,
  PAPER_DIMENSIONS,
  PX_PER_MM,
  resolveColumnValue,
  snapToGrid,
} from "@/lib/optic-coding";
import { AlertCircle, FileDown, GripVertical, Plus, Printer, QrCode, Trash2 } from "lucide-react";

const DRAG_SNAP_MM = 1;
const OVERLAY_W_MM = 45;
const OVERLAY_H_MM = 11;
const QR_MIN_SIZE_MM = 10;
const QR_MAX_SIZE_MM = 60;
const QR_RENDER_PX = 600;

interface CodingElement {
  id: string;
  columnKey: string;
  label: string;
  xMm: number;
  yMm: number;
  kind: "text" | "qr";
  boundFieldId?: string;
  fontSizeMm?: number;
  letterSpacingMm?: number;
  qrSizeMm?: number;
}

function generateCodingId(): string {
  return `coding-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function OpticCoding() {
  const { districts, schools, students, isLoaded } = useRegistry();
  const { toast } = useToast();

  const [formDesigns, setFormDesigns] = useState<OpticFormDesign[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [elements, setElements] = useState<CodingElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const [districtId, setDistrictId] = useState<string>("all");
  const [schoolId, setSchoolId] = useState<string>("all");
  const [className, setClassName] = useState<string>("all");
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

  const [previewScale, setPreviewScale] = useState(1);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const overlayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragState = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    snapX: number;
    snapY: number;
  } | null>(null);
  const resizeState = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origSize: number;
    snapSize: number;
    xMm: number;
    yMm: number;
  } | null>(null);

  const elementBoxMm = (el: CodingElement): { w: number; h: number } =>
    el.kind === "qr"
      ? { w: el.qrSizeMm ?? QR_DEFAULT_SIZE_MM, h: el.qrSizeMm ?? QR_DEFAULT_SIZE_MM }
      : { w: OVERLAY_W_MM, h: OVERLAY_H_MM };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchFormDesigns();
      if (cancelled) return;
      setFormDesigns(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDesign = formDesigns.find((f) => f.id === selectedFormId) || null;

  const handleSelectForm = (id: string) => {
    setSelectedFormId(id);
    setElements([]);
    setSelectedElementId(null);
  };

  useEffect(() => {
    if (!selectedFormId && formDesigns.length > 0) {
      handleSelectForm(formDesigns[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDesigns]);

  const excelColumns = useMemo(() => extractExcelColumns(students), [students]);
  const availableColumns = useMemo(
    () => excelColumns.map((key) => ({ key, label: key })),
    [excelColumns],
  );

  const visibleSchools = useMemo(() => {
    if (districtId === "all") return schools;
    return schools.filter((s) => s.districtId === districtId);
  }, [districtId, schools]);

  const scopedStudents = useMemo(() => {
    return students.filter((student) => {
      const school = findSchool(student, schools);
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

  const paper = selectedDesign ? PAPER_DIMENSIONS[selectedDesign.paperSize] : PAPER_DIMENSIONS.A4;
  const previewWidthPx = mmToPx(paper.widthMm);
  const previewHeightPx = mmToPx(paper.heightMm);

  useEffect(() => {
    const el = previewAreaRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const availW = Math.max(0, rect.width - 32);
      const availH = Math.max(0, rect.height - 32);
      setPreviewScale(Math.min(1, availW / previewWidthPx, availH / previewHeightPx));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewWidthPx, previewHeightPx, !!selectedDesign, isLoaded]);

  const buildFill = useCallback(
    (student: Student): OpticFormFill => {
      const school = findSchool(student, schools);
      const district = findDistrict(school, districts);
      const fill: OpticFormFill = {};
      for (const el of elements) {
        if (!el.boundFieldId) continue;
        const value = resolveColumnValue(student, school, district, el.columnKey);
        if (value) fill[el.boundFieldId] = value;
      }
      return fill;
    },
    [elements, schools, districts],
  );

  const buildOverlays = useCallback(
    async (student: Student): Promise<OpticFormOverlay[]> => {
      const school = findSchool(student, schools);
      const district = findDistrict(school, districts);
      const out: OpticFormOverlay[] = [];
      for (const el of elements) {
        if (el.boundFieldId) continue;
        const value = resolveColumnValue(student, school, district, el.columnKey);
        if (el.kind === "qr") {
          const qrSizeMm = el.qrSizeMm ?? QR_DEFAULT_SIZE_MM;
          const qrDataUrl = value ? await buildQrDataUrl(value, QR_RENDER_PX) : undefined;
          out.push({ id: el.id, label: el.label, kind: "qr", xMm: el.xMm, yMm: el.yMm, value, qrSizeMm, qrDataUrl });
        } else {
          out.push({ id: el.id, label: el.label, kind: "text", xMm: el.xMm, yMm: el.yMm, value, fontSizeMm: el.fontSizeMm, letterSpacingMm: el.letterSpacingMm });
        }
      }
      return out;
    },
    [elements, schools, districts],
  );

  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const student = filteredStudents[0];
      if (!student || !selectedDesign) {
        setPreviewHtml("");
        return;
      }
      const overlays = await buildOverlays(student);
      if (cancelled) return;
      setPreviewHtml(buildOpticFormHtml(selectedDesign, buildFill(student), overlays));
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDesign, filteredStudents, buildFill, buildOverlays]);

  const selectedElement = elements.find((el) => el.id === selectedElementId) || null;

  const addElement = (col: { key: string; label: string }, pos?: { xMm: number; yMm: number }, kind: "text" | "qr" = "text") => {
    if (elements.some((el) => el.columnKey === col.key)) return;
    const paperSize = selectedDesign ? PAPER_DIMENSIONS[selectedDesign.paperSize] : PAPER_DIMENSIONS.A4;
    const baseX = pos?.xMm ?? 10;
    const baseY = pos?.yMm ?? 10 + (elements.length % 10) * 9;
    const box = kind === "qr" ? { w: QR_DEFAULT_SIZE_MM, h: QR_DEFAULT_SIZE_MM } : { w: OVERLAY_W_MM, h: OVERLAY_H_MM };
    const xMm = Math.min(Math.max(baseX, 0), paperSize.widthMm - box.w);
    const yMm = Math.min(Math.max(baseY, 0), paperSize.heightMm - box.h);
    const el: CodingElement = {
      id: generateCodingId(),
      columnKey: col.key,
      label: col.label,
      xMm,
      yMm,
      kind,
      ...(kind === "qr" ? { qrSizeMm: QR_DEFAULT_SIZE_MM } : {}),
    };
    setElements((prev) => [...prev, el]);
    setSelectedElementId(el.id);
  };

  const updateElement = (id: string, changes: Partial<CodingElement>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...changes } : el)));
  };

  const removeElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  const onOverlayPointerDown = (e: React.PointerEvent, el: CodingElement) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSelectedElementId(el.id);
    const domEl = overlayRefs.current[el.id];
    if (!domEl) return;
    try {
      domEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore (e.g. synthetic events without an active pointer)
    }
    dragState.current = {
      id: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: el.xMm,
      origY: el.yMm,
      snapX: el.xMm,
      snapY: el.yMm,
    };
  };

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    e.preventDefault();
    const el = elements.find((x) => x.id === d.id);
    if (!el) return;
    const box = elementBoxMm(el);
    const dx = (e.clientX - d.startClientX) / PX_PER_MM / previewScale;
    const dy = (e.clientY - d.startClientY) / PX_PER_MM / previewScale;
    d.snapX = snapToGrid(d.origX + dx, DRAG_SNAP_MM);
    d.snapY = snapToGrid(d.origY + dy, DRAG_SNAP_MM);
    d.snapX = Math.min(Math.max(d.snapX, 0), paper.widthMm - box.w);
    d.snapY = Math.min(Math.max(d.snapY, 0), paper.heightMm - box.h);
    const domEl = overlayRefs.current[d.id];
    if (domEl) {
      domEl.style.left = `${mmToPx(d.snapX)}px`;
      domEl.style.top = `${mmToPx(d.snapY)}px`;
    }
  };

  const onOverlayPointerUp = () => {
    const d = dragState.current;
    if (!d) return;
    dragState.current = null;
    if (d.snapX !== d.origX || d.snapY !== d.origY) {
      updateElement(d.id, { xMm: d.snapX, yMm: d.snapY });
    }
  };

  const onResizePointerDown = (e: React.PointerEvent, el: CodingElement) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedElementId(el.id);
    const handle = e.currentTarget;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const size = el.qrSizeMm ?? QR_DEFAULT_SIZE_MM;
    resizeState.current = {
      id: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origSize: size,
      snapSize: size,
      xMm: el.xMm,
      yMm: el.yMm,
    };
  };

  const onResizePointerMove = (e: React.PointerEvent) => {
    const d = resizeState.current;
    if (!d) return;
    e.preventDefault();
    const dx = (e.clientX - d.startClientX) / PX_PER_MM / previewScale;
    const dy = (e.clientY - d.startClientY) / PX_PER_MM / previewScale;
    const maxSize = Math.min(paper.widthMm - d.xMm, paper.heightMm - d.yMm, QR_MAX_SIZE_MM);
    d.snapSize = Math.min(Math.max(snapToGrid(d.origSize + Math.max(dx, dy), DRAG_SNAP_MM), QR_MIN_SIZE_MM), maxSize);
    const domEl = overlayRefs.current[d.id];
    if (domEl) {
      domEl.style.width = `${mmToPx(d.snapSize)}px`;
      domEl.style.height = `${mmToPx(d.snapSize)}px`;
    }
  };

  const onResizePointerUp = () => {
    const d = resizeState.current;
    if (!d) return;
    resizeState.current = null;
    if (d.snapSize !== d.origSize) {
      updateElement(d.id, { qrSizeMm: d.snapSize });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    const key = e.dataTransfer.getData("text/plain");
    const col = availableColumns.find((c) => c.key === key);
    if (!col) return;
    if (elements.some((el) => el.columnKey === col.key)) return;
    e.preventDefault();
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xMm = (e.clientX - rect.left) / previewScale / PX_PER_MM;
    const yMm = (e.clientY - rect.top) / previewScale / PX_PER_MM;
    addElement(col, { xMm, yMm });
  };

  const exportPdf = async () => {
    if (!isLoaded || filteredStudents.length === 0) {
      toast({ title: "Hata", description: "Yazdırılacak öğrenci bulunamadı.", variant: "destructive" });
      return;
    }
    if (!selectedDesign) {
      toast({ title: "Hata", description: "Bir optik form seçilmelidir.", variant: "destructive" });
      return;
    }

    try {
      setExporting({ done: 0, total: filteredStudents.length });
      const pages = await Promise.all(
        filteredStudents.map(async (student) =>
          buildOpticFormHtml(selectedDesign, buildFill(student), await buildOverlays(student)),
        ),
      );
      const blob = await createPdfFromPages({
        pages,
        widthPx: previewWidthPx,
        heightPx: previewHeightPx,
        widthMm: paper.widthMm,
        heightMm: paper.heightMm,
        paperSize: selectedDesign.paperSize,
        renderDpi: PDF_RENDER_DPI,
        onProgress: (done, total) => setExporting({ done, total }),
      });
      setExporting(null);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "optik-kodlama.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF Oluşturuldu", description: `${filteredStudents.length} öğrenci için kaydedildi.` });
    } catch {
      setExporting(null);
      toast({ title: "PDF hatası", description: "PDF oluşturulamadı.", variant: "destructive" });
    }
  };

  const printAll = async () => {
    if (!isLoaded || filteredStudents.length === 0) {
      toast({ title: "Hata", description: "Yazdırılacak öğrenci bulunamadı.", variant: "destructive" });
      return;
    }
    if (!selectedDesign) {
      toast({ title: "Hata", description: "Bir optik form seçilmelidir.", variant: "destructive" });
      return;
    }

    try {
      const pages = await Promise.all(
        filteredStudents.map(async (student) =>
          buildOpticFormHtml(selectedDesign, buildFill(student), await buildOverlays(student)),
        ),
      );
      if (!openPrintWindow(pages, selectedDesign.paperSize)) {
        toast({ title: "Hata", description: "Yazdırma penceresi açılamadı.", variant: "destructive" });
        return;
      }
      toast({ title: "Yazdırma Başlatıldı", description: `${filteredStudents.length} öğrenci için hazırlandı.` });
    } catch {
      toast({ title: "Hata", description: "QR kodlar oluşturulamadı.", variant: "destructive" });
    }
  };

  const boundCount = useMemo(() => elements.filter((el) => el.boundFieldId).length, [elements]);

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Optik Kodlama</h1>
          <p className="text-muted-foreground mt-1">Excel sütunlarını seçip optik form üzerine yerleştirin.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={printAll} disabled={!selectedDesign || filteredStudents.length === 0 || !!exporting}>
            <Printer className="mr-2 h-4 w-4" />
            Yazdır
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={!selectedDesign || filteredStudents.length === 0 || !!exporting}>
            <FileDown className="mr-2 h-4 w-4" />
            {exporting ? `PDF ${exporting.done}/${exporting.total}` : "PDF"}
          </Button>
        </div>
      </div>

      {!isLoaded ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Henüz Veri Yüklenmemiş</h3>
            <p className="text-muted-foreground max-w-md">Optik kodlama için önce sınav seçimi sayfasından Excel dosyası yükleyiniz.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-[300px_1fr_260px] gap-4 items-start">
          {/* LEFT: Form seçimi + sütunlar + filtreler */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Optik Form</CardTitle>
                <CardDescription>Doldurulacak form tasarımını seçin.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="form-select">Form</Label>
                  <select
                    id="form-select"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={selectedFormId}
                    onChange={(e) => handleSelectForm(e.target.value)}
                  >
                    <option value="">Seçin...</option>
                    {formDesigns.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.paperSize})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedDesign && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    {selectedDesign.name} · {selectedDesign.paperSize}
                    <div className="text-xs text-muted-foreground mt-1">
                      {selectedDesign.fields.length} bilgi alanı · {selectedDesign.grids.length} cevap tablosu
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedDesign && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Excel Sütunları</CardTitle>
                  <CardDescription>Bir sütunu sürükleyip forma bırakın veya + ile ekleyin.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1" style={{ maxHeight: 360, overflowY: "auto" }}>
                  {availableColumns.length === 0 && <p className="text-sm text-muted-foreground">Yüklenen veride sütun yok.</p>}
                  {availableColumns.map((col) => {
                    const isMapped = elements.some((el) => el.columnKey === col.key);
                    return (
                      <div
                        key={col.key}
                        draggable={!isMapped}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", col.key);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className={`group flex items-center justify-between rounded-lg border px-2.5 py-2 ${isMapped ? "border-green-300/60 bg-green-50/40" : "border-border/70 hover:bg-muted/50 cursor-grab"}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GripVertical className={`h-3.5 w-3.5 shrink-0 ${isMapped ? "text-muted-foreground/30" : "text-muted-foreground/60"}`} />
                          <span className={`text-sm truncate ${isMapped ? "text-muted-foreground" : ""}`}>{col.label}</span>
                        </div>
                        {isMapped ? (
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Eşlendi</span>
                        ) : (
                          <div className="ml-1 flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              title="QR olarak ekle"
                              onClick={() => addElement(col, undefined, "qr")}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground opacity-60 hover:opacity-100 hover:bg-primary hover:text-white transition-opacity"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Forma ekle"
                              onClick={() => addElement(col)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground opacity-60 hover:opacity-100 hover:bg-primary hover:text-white transition-opacity"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Filtreler</CardTitle>
                <CardDescription>Yazdırılacak öğrenci aralığı.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="district-filter">İlçe</Label>
                  <select
                    id="district-filter"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={districtId}
                    onChange={(e) => {
                      setDistrictId(e.target.value);
                      setSchoolId("all");
                      setClassName("all");
                    }}
                  >
                    <option value="all">Tümü</option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="school-filter">Okul</Label>
                  <select
                    id="school-filter"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={schoolId}
                    onChange={(e) => {
                      setSchoolId(e.target.value);
                      setClassName("all");
                    }}
                  >
                    <option value="all">Tümü</option>
                    {visibleSchools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="class-filter">Şube</Label>
                  <select
                    id="class-filter"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                  >
                    <option value="all">Tümü</option>
                    {classOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-md bg-muted p-3 text-sm">
                  Seçilen öğrenci: <strong>{filteredStudents.length}</strong>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CENTER: Önizleme */}
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Önizleme</CardTitle>
              <CardDescription>Forma bırakın, sürükleyerek konumlandırın.</CardDescription>
            </CardHeader>
            <CardContent>
              <div ref={previewAreaRef} className="overflow-hidden rounded-lg border bg-muted/30 p-4">
                <div className="relative mx-auto" style={{ width: previewWidthPx * previewScale, height: previewHeightPx * previewScale }}>
                  {previewHtml ? (
                    <div
                      ref={previewRef}
                      className="absolute left-0 top-0 select-none overflow-hidden bg-white shadow-md"
                      style={{
                        width: previewWidthPx,
                        height: previewHeightPx,
                        transform: `scale(${previewScale})`,
                        transformOrigin: "top left",
                      }}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                      {elements.map((el) => {
                        const isSelected = el.id === selectedElementId;
                        const box = elementBoxMm(el);
                        return (
                          <div
                            key={el.id}
                            ref={(node) => {
                              overlayRefs.current[el.id] = node;
                            }}
                            onPointerDown={(e) => onOverlayPointerDown(e, el)}
                            onPointerMove={onOverlayPointerMove}
                            onPointerUp={onOverlayPointerUp}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElementId(el.id);
                            }}
                            style={{
                              position: "absolute",
                              left: mmToPx(el.xMm),
                              top: mmToPx(el.yMm),
                              width: mmToPx(box.w),
                              height: mmToPx(box.h),
                              cursor: "move",
                              border: isSelected ? "1.5px dashed rgb(59 130 246)" : "none",
                              boxSizing: "border-box",
                              touchAction: "none",
                              userSelect: "none",
                              zIndex: 10,
                            }}
                          >
                            {isSelected && el.kind === "qr" && (
                              <span className="pointer-events-none absolute left-1 top-1 rounded bg-blue-600 px-1 py-0.5 text-[9px] font-semibold text-white">
                                QR
                              </span>
                            )}
                            {isSelected && el.kind === "qr" && (
                              <span
                                onPointerDown={(e) => onResizePointerDown(e, el)}
                                onPointerMove={onResizePointerMove}
                                onPointerUp={onResizePointerUp}
                                className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-blue-600"
                                style={{ touchAction: "none" }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="absolute inset-0 grid place-content-center text-sm text-muted-foreground border-2 border-dashed border-muted-foreground/25">
                      <div className="text-center space-y-1">
                        <AlertCircle className="w-5 h-5 mx-auto" />
                        <p>Form seçin ve öğrenci yükleyin.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {filteredStudents[0] && (
                <p className="text-xs text-muted-foreground mt-2">
                  Önizleme öğrencisi: <strong>{filteredStudents[0].fullName}</strong>
                </p>
              )}
            </CardContent>
          </Card>

          {/* RIGHT: Yerleştirilenler */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Yerleştirilenler</CardTitle>
              <CardDescription>Eklenen öğeler ve bağlama.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {elements.length === 0 && (
                <p className="text-sm text-muted-foreground">Henüz öğe yok. Soldaki sütunlardan ekleyin.</p>
              )}
              {elements.map((el) => {
                const isSelected = el.id === selectedElementId;
                return (
                  <div
                    key={el.id}
                    onClick={() => setSelectedElementId(el.id)}
                    className={`rounded-lg border p-2.5 space-y-2 cursor-pointer ${isSelected ? "border-blue-400 bg-blue-50/40" : "border-border/70"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{el.label}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {Math.round(el.xMm)}mm, {Math.round(el.yMm)}mm
                          {el.kind === "qr" ? " · QR" : el.boundFieldId ? " · bağlı" : " · serbest"}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeElement(el.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {el.kind !== "qr" && (
                      <select
                        className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                        value={el.boundFieldId ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateElement(el.id, { boundFieldId: e.target.value || undefined })}
                      >
                        <option value="">— Serbest (etiket + değer) —</option>
                        {selectedDesign?.fields.filter((f) => !isHeadingField(f)).map((f) => (
                          <option key={f.id} value={f.id}>
                            Bağla: {f.label || "(isimsiz alan)"}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
              {selectedElement && selectedElement.kind !== "qr" && (
                <div className="rounded-lg border border-border/70 p-2.5 space-y-2">
                  <Label className="text-xs">Yazı Boyutu (mm)</Label>
                  <Input
                    type="number"
                    min={2}
                    max={12}
                    step={0.5}
                    className="h-8"
                    value={selectedElement.fontSizeMm ?? 3}
                    onChange={(e) => updateElement(selectedElement.id, { fontSizeMm: Number(e.target.value) || undefined })}
                  />
                  <Label className="text-xs">Harf Aralığı (mm)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    className="h-8"
                    value={selectedElement.letterSpacingMm ?? 0}
                    onChange={(e) => updateElement(selectedElement.id, { letterSpacingMm: Number(e.target.value) || 0 })}
                  />
                </div>
              )}
              {selectedElement && selectedElement.kind === "qr" && (
                <div className="rounded-lg border border-border/70 p-2.5 space-y-2">
                  <Label className="text-xs">QR Boyutu (mm)</Label>
                  <Input
                    type="number"
                    min={QR_MIN_SIZE_MM}
                    max={QR_MAX_SIZE_MM}
                    step={1}
                    className="h-8"
                    value={selectedElement.qrSizeMm ?? QR_DEFAULT_SIZE_MM}
                    onChange={(e) =>
                      updateElement(selectedElement.id, {
                        qrSizeMm: Math.min(Math.max(Number(e.target.value) || QR_DEFAULT_SIZE_MM, QR_MIN_SIZE_MM), QR_MAX_SIZE_MM),
                      })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">Sayfada sürükleyip köşe tutamacından da boyutlandırabilirsiniz.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
