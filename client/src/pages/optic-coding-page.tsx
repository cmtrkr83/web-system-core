import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegistry, type Student } from "@/context/RegistryContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  buildOpticFormHtml,
  isHeadingField,
  normalizeFormField,
  PDF_RENDER_DPI,
  type OpticFormDesign,
  type OpticFormFill,
  type OpticFormOverlay,
} from "@/lib/optic-form";
import {
  extractExcelColumns,
  findDistrict,
  findSchool,
  mmToPx,
  PAPER_DIMENSIONS,
  PX_PER_MM,
  resolveColumnValue,
  STANDARD_COLUMNS,
} from "@/lib/optic-coding";
import { AlertCircle, FileDown, GripVertical, Link2, Move, Plus, Printer, Trash2 } from "lucide-react";

const DRAG_SNAP_MM = 1;
const OVERLAY_W_MM = 45;
const OVERLAY_H_MM = 11;

interface CodingElement {
  id: string;
  columnKey: string;
  label: string;
  xMm: number;
  yMm: number;
  boundFieldId?: string;
  fontSizeMm?: number;
  letterSpacingMm?: number;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/optics/form-designs", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setFormDesigns(
          (Array.isArray(data) ? data : []).map((d) => ({
            ...d,
            fields: Array.isArray(d.fields) ? d.fields.map(normalizeFormField) : d.fields,
          })),
        );
      } catch {
        // ignore load errors
      }
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
    () => [...STANDARD_COLUMNS.map((c) => ({ key: `std:${c.key}`, label: c.label })), ...excelColumns.map((key) => ({ key, label: key }))],
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
      const avail = Math.max(0, el.clientWidth - 32);
      setPreviewScale(Math.min(1, avail / previewWidthPx));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewWidthPx, !!selectedDesign]);

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
    (student: Student): OpticFormOverlay[] => {
      const school = findSchool(student, schools);
      const district = findDistrict(school, districts);
      return elements
        .filter((el) => !el.boundFieldId)
        .map((el) => ({
          id: el.id,
          label: el.label,
          xMm: el.xMm,
          yMm: el.yMm,
          fontSizeMm: el.fontSizeMm,
          letterSpacingMm: el.letterSpacingMm,
          value: resolveColumnValue(student, school, district, el.columnKey),
        }));
    },
    [elements, schools, districts],
  );

  const previewHtml = useMemo(() => {
    const student = filteredStudents[0];
    if (!student || !selectedDesign) return "";
    return buildOpticFormHtml(selectedDesign, buildFill(student), buildOverlays(student));
  }, [selectedDesign, filteredStudents, buildFill, buildOverlays]);

  const selectedElement = elements.find((el) => el.id === selectedElementId) || null;

  const addElement = (col: { key: string; label: string }, pos?: { xMm: number; yMm: number }) => {
    const paperSize = selectedDesign ? PAPER_DIMENSIONS[selectedDesign.paperSize] : PAPER_DIMENSIONS.A4;
    const baseX = pos?.xMm ?? 10;
    const baseY = pos?.yMm ?? 10 + (elements.length % 10) * 9;
    const xMm = Math.min(Math.max(baseX, 0), paperSize.widthMm - OVERLAY_W_MM);
    const yMm = Math.min(Math.max(baseY, 0), paperSize.heightMm - OVERLAY_H_MM);
    const el: CodingElement = { id: generateCodingId(), columnKey: col.key, label: col.label, xMm, yMm };
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

  const snapToGrid = (v: number, s: number) => Math.round(v / s) * s;

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
    const dx = (e.clientX - d.startClientX) / PX_PER_MM / previewScale;
    const dy = (e.clientY - d.startClientY) / PX_PER_MM / previewScale;
    d.snapX = snapToGrid(d.origX + dx, DRAG_SNAP_MM);
    d.snapY = snapToGrid(d.origY + dy, DRAG_SNAP_MM);
    d.snapX = Math.min(Math.max(d.snapX, 0), paper.widthMm - OVERLAY_W_MM);
    d.snapY = Math.min(Math.max(d.snapY, 0), paper.heightMm - OVERLAY_H_MM);
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    const key = e.dataTransfer.getData("text/plain");
    const col = availableColumns.find((c) => c.key === key);
    if (!col) return;
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

    const { default: html2canvas } = await import("html2canvas");
    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: selectedDesign.paperSize, hotfixes: ["px_scaling"] });

    for (const student of filteredStudents) {
      const pageHtml = buildOpticFormHtml(selectedDesign, buildFill(student), buildOverlays(student));

      const wrapper = document.createElement("div");
      wrapper.innerHTML = pageHtml;
      const pageEl = wrapper.firstElementChild as HTMLElement;
      pageEl.style.width = `${previewWidthPx}px`;
      pageEl.style.height = `${previewHeightPx}px`;
      pageEl.style.position = "fixed";
      pageEl.style.left = "-9999px";
      pageEl.style.top = "0";
      document.body.appendChild(pageEl);

      const imgs = Array.from(pageEl.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return;
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }),
      );

      const canvas = await html2canvas(pageEl, { scale: PDF_RENDER_DPI / 96, useCORS: true, logging: false, width: previewWidthPx, height: previewHeightPx });
      const imgData = canvas.toDataURL("image/png");
      if (filteredStudents.indexOf(student) > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, paper.widthMm, paper.heightMm, undefined, "FAST");
      document.body.removeChild(pageEl);
    }

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "optik-kodlama.pdf";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "PDF Oluşturuldu", description: `${filteredStudents.length} öğrenci için kaydedildi.` });
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

    const allPages: string[] = [];
    for (const student of filteredStudents) {
      allPages.push(buildOpticFormHtml(selectedDesign, buildFill(student), buildOverlays(student)));
    }

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      toast({ title: "Hata", description: "Yazdırma penceresi açılamadı.", variant: "destructive" });
      return;
    }
    printWindow.document.write(`<!doctype html><html lang="tr"><head><meta charset="UTF-8" /><style>@page{size:${selectedDesign.paperSize} portrait;margin:0;}html,body{margin:0;padding:0;}body{background:#fff;}.optic-page{page-break-after:always;}.optic-page:last-child{page-break-after:auto;}</style></head><body>${allPages
      .map((page) => `<section class="optic-page">${page}</section>`)
      .join("")}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    try {
      printWindow.print();
    } catch {
      // ignore
    }
    toast({ title: "Yazdırma Başlatıldı", description: `${filteredStudents.length} öğrenci için hazırlandı.` });
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
          <Button onClick={printAll} disabled={!selectedDesign || filteredStudents.length === 0}>
            <Printer className="mr-2 h-4 w-4" />
            Yazdır
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={!selectedDesign || filteredStudents.length === 0}>
            <FileDown className="mr-2 h-4 w-4" />
            PDF
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
                  {availableColumns.map((col) => (
                    <div
                      key={col.key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", col.key);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className="group flex items-center justify-between rounded-lg border border-border/70 px-2.5 py-2 hover:bg-muted/50 cursor-grab"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                        <span className="text-sm truncate">{col.label}</span>
                      </div>
                      <button
                        type="button"
                        title="Forma ekle"
                        onClick={() => addElement(col)}
                        className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground opacity-60 hover:opacity-100 hover:bg-primary hover:text-white transition-opacity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
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
                        const fieldLabel = el.boundFieldId ? selectedDesign?.fields.find((f) => f.id === el.boundFieldId)?.label : null;
                        const isSelected = el.id === selectedElementId;
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
                            className="group"
                            style={{
                              position: "absolute",
                              left: mmToPx(el.xMm),
                              top: mmToPx(el.yMm),
                              width: mmToPx(OVERLAY_W_MM),
                              height: mmToPx(OVERLAY_H_MM),
                              cursor: "move",
                              border: isSelected ? "2px solid rgb(59 130 246)" : "1.5px dashed rgba(59,130,246,0.55)",
                              background: "rgba(59,130,246,0.05)",
                              boxSizing: "border-box",
                              touchAction: "none",
                              userSelect: "none",
                              zIndex: 10,
                            }}
                          >
                            <span className="pointer-events-none absolute left-1.5 top-1 text-[10px] font-semibold text-blue-600 truncate" style={{ maxWidth: mmToPx(OVERLAY_W_MM) - 4 }}>
                              {el.label}
                              {fieldLabel ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <Link2 className="h-2.5 w-2.5 inline" /> {fieldLabel}
                                </span>
                              ) : null}
                            </span>
                            <span className="pointer-events-none absolute right-1 bottom-0.5 text-[10px] font-semibold text-blue-500 opacity-60 group-hover:opacity-100">
                              <Move className="h-3 w-3 inline" /> {Math.round(el.xMm)}mm,{Math.round(el.yMm)}mm
                            </span>
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
                          {el.boundFieldId ? " · bağlı" : " · serbest"}
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
                  </div>
                );
              })}
              {selectedElement && (
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
