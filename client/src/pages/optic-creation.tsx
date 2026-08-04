import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  buildOpticFormHtml,
  buildOpticFormManifest,
  computeFieldPlacements,
  computeGridPlacements,
  createDefaultForm,
  formFieldHeightMm,
  generateElementId,
  generateFormId,
  gridColumnWidth,
  gridHeightMm,
  GRID_SNAP_MM,
  HEADING_DEFAULT_FONT_MM,
  HEADING_MIN_FONT_MM,
  HEADING_MAX_FONT_MM,
  isBookletField,
  isBoxField,
  isHeadingField,
  isNumericField,
  normalizeFormField,
  PDF_RENDER_DPI,
  type AnswerGrid,
  type FormTextField,
  type OpticFormDesign,
} from "@/lib/optic-form";
import { mmToPx, PX_PER_MM } from "@/lib/optic-coding";
import { FileDown, Move, Plus, Printer, Save, Trash2 } from "lucide-react";

const DRAG_SNAP_MM = 1;

interface SavedForm {
  id: string;
  name: string;
  paperSize: "A4" | "A5";
  title: string;
  showStudentInfo: boolean;
  fields: FormTextField[];
  grids: AnswerGrid[];
  createdAt: string;
}

export default function OpticCreate() {
  const { toast } = useToast();
  const [forms, setForms] = useState<SavedForm[]>([]);
  const [form, setForm] = useState<OpticFormDesign | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const overlayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragState = useRef<{
    key: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    snapX: number;
    snapY: number;
    wMm: number;
    hMm: number;
    snapMm: number;
  } | null>(null);

  const loadForms = useCallback(async () => {
    try {
      const res = await fetch("/api/optics/form-designs", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setForms(
        (Array.isArray(data) ? data : []).map((f) => ({
          ...f,
          fields: Array.isArray(f.fields) ? f.fields.map(normalizeFormField) : f.fields,
        })),
      );
    } catch {
      setForms([]);
    }
  }, []);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  const patch = (changes: Partial<OpticFormDesign>) => {
    setForm((prev) => (prev ? { ...prev, ...changes } : prev));
  };

  const paper = useMemo(() => (form?.paperSize === "A5" ? { widthMm: 148, heightMm: 210 } : { widthMm: 210, heightMm: 297 }), [form?.paperSize]);

  const previewHtml = useMemo(() => (form ? buildOpticFormHtml(form) : ""), [form]);

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
  }, [previewWidthPx, !!form]);

  const placements = useMemo(() => (form ? computeFieldPlacements(form) : []), [form]);
  const gridPlaces = useMemo(() => (form ? computeGridPlacements(form) : []), [form]);

  const overlays = useMemo(() => {
    if (!form) return [];
    const items: { key: string; label: string; xMm: number; yMm: number; wMm: number; hMm: number; snapMm: number }[] = [];
    if (form.showStudentInfo) {
      for (const p of placements) {
        items.push({
          key: `field-${p.field.id}`,
          label: p.field.label,
          xMm: p.xMm,
          yMm: p.yMm,
          wMm: p.colWidthMm,
          hMm: formFieldHeightMm(p.field),
          snapMm: isNumericField(p.field) || isBookletField(p.field) ? GRID_SNAP_MM : DRAG_SNAP_MM,
        });
      }
    }
    for (const p of gridPlaces) {
      items.push({
        key: `grid-${p.grid.id}`,
        label: p.grid.subject,
        xMm: p.xMm,
        yMm: p.yMm,
        wMm: gridColumnWidth(p.grid),
        hMm: gridHeightMm(p.grid),
        snapMm: GRID_SNAP_MM,
      });
    }
    return items;
  }, [form, placements, gridPlaces]);

  const snapToGrid = (v: number, s: number) => Math.round(v / s) * s;

  const onOverlayPointerDown = (e: React.PointerEvent, o: { key: string; xMm: number; yMm: number; wMm: number; hMm: number; snapMm: number }) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = overlayRefs.current[o.key];
    if (!el) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore (e.g. synthetic events without an active pointer)
    }
    dragState.current = {
      key: o.key,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: o.xMm,
      origY: o.yMm,
      snapX: o.xMm,
      snapY: o.yMm,
      wMm: o.wMm,
      hMm: o.hMm,
      snapMm: o.snapMm,
    };
  };

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    e.preventDefault();
    const dx = (e.clientX - d.startClientX) / PX_PER_MM / previewScale;
    const dy = (e.clientY - d.startClientY) / PX_PER_MM / previewScale;
    d.snapX = snapToGrid(d.origX + dx, d.snapMm);
    d.snapY = snapToGrid(d.origY + dy, d.snapMm);
    d.snapX = Math.min(Math.max(d.snapX, 0), paper.widthMm - d.wMm);
    d.snapY = Math.min(Math.max(d.snapY, 0), paper.heightMm - d.hMm);
    const el = overlayRefs.current[d.key];
    if (el) {
      el.style.left = `${mmToPx(d.snapX)}px`;
      el.style.top = `${mmToPx(d.snapY)}px`;
    }
  };

  const onOverlayPointerUp = () => {
    const d = dragState.current;
    if (!d) return;
    dragState.current = null;
    if (d.snapX !== d.origX || d.snapY !== d.origY) {
      if (d.key.startsWith("field-")) {
        updateField(d.key.slice("field-".length), { xMm: d.snapX, yMm: d.snapY });
      } else if (d.key.startsWith("grid-")) {
        updateGrid(d.key.slice("grid-".length), { xMm: d.snapX, yMm: d.snapY });
      }
    }
  };

  const addGrid = () => {
    if (!form) return;
    patch({
      grids: [
        ...form.grids,
        { id: generateElementId(), subject: `Ders ${form.grids.length + 1}`, questionCount: 15, optionCount: 4 },
      ],
    });
  };

  const updateGrid = (id: string, changes: Partial<AnswerGrid>) => {
    if (!form) return;
    patch({ grids: form.grids.map((g) => (g.id === id ? { ...g, ...changes } : g)) });
  };

  const removeGrid = (id: string) => {
    if (!form) return;
    patch({ grids: form.grids.filter((g) => g.id !== id) });
  };

  const addField = () => {
    if (!form) return;
    patch({ fields: [...form.fields, { id: generateElementId(), label: `Alan ${form.fields.length + 1}`, widthMm: 88 }] });
  };

  const updateField = (id: string, changes: Partial<FormTextField>) => {
    if (!form) return;
    patch({ fields: form.fields.map((f) => (f.id === id ? { ...f, ...changes } : f)) });
  };

  const removeField = (id: string) => {
    if (!form) return;
    patch({ fields: form.fields.filter((f) => f.id !== id) });
  };

  const saveForm = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        id: form.id,
        name: form.name,
        paperSize: form.paperSize,
        title: form.title,
        showStudentInfo: form.showStudentInfo,
        fields: form.fields,
        grids: form.grids,
        manifest: buildOpticFormManifest(form),
        createdAt: form.createdAt,
      };
      await apiRequest("POST", "/api/optics/form-designs", payload);
      toast({ title: "Form kaydedildi", description: `"${form.name}" kaydedildi.` });
      await loadForms();
    } catch {
      toast({ title: "Kayıt hatası", description: "Form kaydedilemedi.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    if (!form) return;
    const { default: html2canvas } = await import("html2canvas");
    const { default: jsPDF } = await import("jspdf");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: form.paperSize, hotfixes: ["px_scaling"] });
    const wrapper = document.createElement("div");
    wrapper.innerHTML = previewHtml;
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
    pdf.addImage(imgData, "PNG", 0, 0, paper.widthMm, paper.heightMm, undefined, "FAST");
    document.body.removeChild(pageEl);

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.name.replace(/[^\w\s-]/g, "").trim() || "optic-form"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "PDF Oluşturuldu", description: "Optik form PDF olarak indirildi." });
  };

  const printForm = () => {
    if (!form) return;
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      toast({ title: "Hata", description: "Yazdırma penceresi açılamadı.", variant: "destructive" });
      return;
    }
    printWindow.document.write(
      `<!doctype html><html lang="tr"><head><meta charset="UTF-8" /><style>@page{size:${form.paperSize} portrait;margin:0;}html,body{margin:0;padding:0;}body{background:#fff;}</style></head><body>${previewHtml}</body></html>`,
    );
    printWindow.document.close();
    printWindow.focus();
    try {
      printWindow.print();
    } catch {
      // ignore
    }
    toast({ title: "Yazdırma Başlatıldı", description: `"${form.name}" yazdırma için hazırlandı.` });
  };

  if (!form) {
    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
        <div>
          <h1 className="text-3xl font-heading font-bold">Optik Oluşturma</h1>
          <p className="text-muted-foreground mt-1">Yeni bir optik form oluşturun veya kayıtlı bir formu düzenleyin.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Yeni Form</CardTitle>
              <CardDescription>Boş bir optik cevap formu tasarlayın.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-form-name">Form Adı</Label>
                <Input id="new-form-name" placeholder="Örn. 8.Sınıf Deneme Sınavı" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-form-size">Kağıt Boyutu</Label>
                <select id="new-form-size" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" defaultValue="A4">
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                </select>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  const nameInput = document.getElementById("new-form-name") as HTMLInputElement | null;
                  const sizeInput = document.getElementById("new-form-size") as HTMLSelectElement | null;
                  const name = nameInput?.value.trim() || "Yeni Optik Form";
                  const paperSize = (sizeInput?.value as "A4" | "A5") || "A4";
                  setForm(createDefaultForm(name, paperSize));
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Formu Oluştur
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kayıtlı Formlar</CardTitle>
              <CardDescription>Daha önce tasarladığınız formları düzenleyin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[420px] overflow-auto">
              {forms.length === 0 && <p className="text-sm text-muted-foreground">Henüz kayıtlı form yok.</p>}
              {forms.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 p-3 hover:border-primary/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{f.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {f.paperSize} · {f.grids.length} ders · {f.fields.length} bilgi alanı
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setForm({ ...f })}>
                    Aç
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
      <div className="flex items-end gap-4 rounded-lg border bg-card px-4 py-2 shadow-sm">
        <div className="flex items-end gap-3">
          <div className="shrink-0 space-y-1">
            <Label htmlFor="form-name" className="text-xs">Form Adı</Label>
            <Input id="form-name" className="h-8 w-72" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div className="shrink-0 space-y-1">
            <Label htmlFor="form-size" className="text-xs">Kağıt Boyutu</Label>
            <select
              id="form-size"
              className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-sm"
              value={form.paperSize}
              onChange={(e) => patch({ paperSize: e.target.value as "A4" | "A5" })}
            >
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </select>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Button size="sm" variant="outline" onClick={() => setForm(null)}>
            ← Form Listesi
          </Button>
          <Button size="sm" onClick={printForm}>
            <Printer className="mr-1.5 h-4 w-4" />
            Yazdır
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf}>
            <FileDown className="mr-1.5 h-4 w-4" />
            PDF
          </Button>
          <Button size="sm" variant="secondary" onClick={saveForm} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[270px_1fr_250px] gap-3 items-start">
        {/* LEFT: Ayarlar */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Öğrenci Bilgi Alanları</CardTitle>
              <CardDescription>Form üzerinde boş bırakılan yazma alanları.</CardDescription>
            </CardHeader>
            <CardContent
              className="space-y-3"
              style={{ maxHeight: previewHeightPx * previewScale + 32, overflowY: "auto" }}
            >
              {form.fields.map((field) => (
                <div key={field.id} className="rounded-lg border border-border/70 p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Input
                      className="h-7 text-sm"
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeField(field.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Tür</Label>
                      <select
                        className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                        value={isHeadingField(field) ? "heading" : isBoxField(field) ? "box" : isBookletField(field) ? "booklet" : isNumericField(field) ? "numeric" : "text"}
                        onChange={(e) => updateField(field.id, { type: e.target.value as FormTextField["type"] })}
                      >
                        <option value="text">Metin</option>
                        <option value="numeric">Sayısal Alan</option>
                        <option value="booklet">Kitapçık</option>
                        <option value="box">Kutu</option>
                        <option value="heading">Yazı</option>
                      </select>
                    </div>
                    {isHeadingField(field) ? (
                      <div>
                        <Label className="flex justify-between text-xs">
                          Yazı Boyutu
                          <span>{field.fontSizeMm ?? HEADING_DEFAULT_FONT_MM}mm</span>
                        </Label>
                        <input
                          type="range"
                          min={HEADING_MIN_FONT_MM}
                          max={HEADING_MAX_FONT_MM}
                          step={0.5}
                          className="w-full"
                          value={field.fontSizeMm ?? HEADING_DEFAULT_FONT_MM}
                          onChange={(e) => updateField(field.id, { fontSizeMm: Number(e.target.value) })}
                        />
                      </div>
                    ) : isBoxField(field) ? (
                      <div>
                        <Label className="text-xs">Köşe Yarıçapı (mm)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          step={0.5}
                          className="h-7"
                          value={field.borderRadiusMm ?? 2}
                          onChange={(e) => updateField(field.id, { borderRadiusMm: Number(e.target.value) || 0 })}
                        />
                      </div>
                    ) : isNumericField(field) || isBookletField(field) ? (
                      <div>
                        <Label className="text-xs">{isBookletField(field) ? "Seçenek Sayısı" : "Sütun Sayısı"}</Label>
                        <Input
                          type="number"
                          min={isBookletField(field) ? 2 : 1}
                          max={isBookletField(field) ? 12 : 30}
                          className="h-7"
                          value={field.digitCount ?? (isBookletField(field) ? 4 : 11)}
                          onChange={(e) => updateField(field.id, { digitCount: Number(e.target.value) || 1 })}
                        />
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                  {isHeadingField(field) && (
                    <div>
                      <Label className="flex justify-between text-xs">
                        Harf Aralığı
                        <span>{field.letterSpacingMm ?? 0}mm</span>
                      </Label>
                      <input
                        type="range"
                        min={0}
                        max={5}
                        step={0.1}
                        className="w-full"
                        value={field.letterSpacingMm ?? 0}
                        onChange={(e) => updateField(field.id, { letterSpacingMm: Number(e.target.value) })}
                      />
                    </div>
                  )}
                  {isBoxField(field) && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Genişlik (mm)</Label>
                        <Input
                          type="number"
                          min={10}
                          max={200}
                          step={0.5}
                          className="h-7"
                          value={field.widthMm}
                          onChange={(e) => updateField(field.id, { widthMm: Number(e.target.value) || 10 })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Yükseklik (mm)</Label>
                        <Input
                          type="number"
                          min={3}
                          max={100}
                          step={0.5}
                          className="h-7"
                          value={field.heightMm ?? 14}
                          onChange={(e) => updateField(field.id, { heightMm: Number(e.target.value) || 3 })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={addField}>
                <Plus className="mr-2 h-4 w-4" />
                Bilgi Alanı Ekle
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* CENTER: Önizleme */}
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Önizleme</CardTitle>
            <CardDescription>Formun birebir çıktısı.</CardDescription>
          </CardHeader>
          <CardContent>
            <div ref={previewAreaRef} className="overflow-hidden rounded-lg border bg-muted/30 p-4">
              <div
                className="relative mx-auto"
                style={{ width: previewWidthPx * previewScale, height: previewHeightPx * previewScale }}
              >
                <div
                  ref={previewRef}
                  className="absolute left-0 top-0 select-none overflow-hidden bg-white shadow-md"
                  style={{
                    width: previewWidthPx,
                    height: previewHeightPx,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                  }}
                >
                <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                {overlays.map((o) => (
                  <div
                    key={o.key}
                    ref={(el) => {
                      overlayRefs.current[o.key] = el;
                    }}
                    onPointerDown={(e) => onOverlayPointerDown(e, o)}
                    onPointerMove={onOverlayPointerMove}
                    onPointerUp={onOverlayPointerUp}
                    title={`${o.label} — sürükleyerek taşı`}
                    className="group"
                    style={{
                      position: "absolute",
                      left: mmToPx(o.xMm),
                      top: mmToPx(o.yMm),
                      width: mmToPx(o.wMm),
                      height: mmToPx(o.hMm),
                      cursor: "move",
                      border: "1.5px dashed rgba(59,130,246,0.55)",
                      background: "rgba(59,130,246,0.05)",
                      boxSizing: "border-box",
                      touchAction: "none",
                      userSelect: "none",
                      zIndex: 10,
                    }}
                  >
                    <span className="pointer-events-none absolute right-1 top-1 text-[10px] font-semibold text-blue-500 opacity-60 group-hover:opacity-100">
                      <Move className="h-3.5 w-3.5 inline" /> {Math.round(o.xMm)}mm,{Math.round(o.yMm)}mm
                    </span>
                  </div>
                ))}
              </div>
            </div>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Cevap Tabloları */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Cevap Tabloları</CardTitle>
            <CardDescription>Her ders için baloncuk tablosu.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.grids.map((grid) => (
              <div key={grid.id} className="rounded-lg border border-border/70 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    className="h-7 text-sm"
                    value={grid.subject}
                    onChange={(e) => updateGrid(grid.id, { subject: e.target.value })}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeGrid(grid.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Soru</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      className="h-7"
                      value={grid.questionCount}
                      onChange={(e) => updateGrid(grid.id, { questionCount: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Seçenek</Label>
                    <select
                      className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                      value={grid.optionCount}
                      onChange={(e) => updateGrid(grid.id, { optionCount: Number(e.target.value) as 4 | 5 })}
                    >
                      <option value={4}>4 (A-D)</option>
                      <option value={5}>5 (A-E)</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={addGrid}>
              <Plus className="mr-2 h-4 w-4" />
              Ders Tablosu Ekle
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
