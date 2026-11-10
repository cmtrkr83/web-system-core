import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/base/buttons/button";
import { InputBase as Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Slider } from "@/components/base/slider/slider";
import { Select, SelectItem } from "@/components/base/select/select";
import { toast } from "@/components/base/toast/toast";
import { apiRequest } from "@/lib/queryClient";
import {
  buildOpticFormHtml,
  buildOpticFormManifest,
  computeFieldPlacements,
  computeGridPlacements,
  createDefaultForm,
  fetchFormDesigns,
  formFieldHeightMm,
  generateElementId,
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
  PDF_RENDER_DPI,
  type AnswerGrid,
  type FormTextField,
  type OpticFormDesign,
} from "@/lib/optic-form";
import { createPdfFromPages, mmToPx, openPrintWindow, PX_PER_MM, snapToGrid } from "@/lib/optic-coding";
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
  const [forms, setForms] = useState<SavedForm[]>([]);
  const [form, setForm] = useState<OpticFormDesign | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [newFormName, setNewFormName] = useState("");
  const [newFormSize, setNewFormSize] = useState<"A4" | "A5">("A4");
  const [dimensionDrafts, setDimensionDrafts] = useState<Record<string, string>>({});

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
    setForms(await fetchFormDesigns());
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

  useEffect(() => {
    const root = previewRef.current;
    if (!form || !root) return;
    let changed = false;
    const next = form.fields.map((f) => {
      if (!isHeadingField(f) || f.autoWidth === false) return f;
      const el = root.querySelector<HTMLElement>(`[data-heading-id="${f.id}"]`);
      if (!el) return f;
      const wMm = Math.round((el.offsetWidth / PX_PER_MM) * 10) / 10;
      if (wMm > 0 && Math.abs(wMm - (f.widthMm ?? 0)) > 0.4) {
        changed = true;
        return { ...f, widthMm: wMm };
      }
      return f;
    });
    if (changed) patch({ fields: next });
  }, [form, previewHtml]);

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

  const updateDimensionDraft = (id: string, dimension: "widthMm" | "heightMm", value: string) => {
    setDimensionDrafts((prev) => ({ ...prev, [`${id}:${dimension}`]: value }));
    if (value === "") return;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    updateField(id, dimension === "widthMm" ? { widthMm: numericValue } : { heightMm: numericValue });
  };

  const commitDimensionDraft = (
    id: string,
    dimension: "widthMm" | "heightMm",
    min: number,
    max: number,
  ) => {
    const key = `${id}:${dimension}`;
    const value = dimensionDrafts[key];
    if (value !== undefined && value !== "") {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        const clampedValue = Math.min(max, Math.max(min, numericValue));
        updateField(id, dimension === "widthMm" ? { widthMm: clampedValue } : { heightMm: clampedValue });
      }
    }
    setDimensionDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
        version: form.version ?? 1,
      };
      await apiRequest("POST", "/api/optics/form-designs", payload);
      toast.success("Form kaydedildi", { description: `"${form.name}" kaydedildi.` });
      await loadForms();
    } catch {
      toast.error("Kayıt hatası", { description: "Form kaydedilemedi." });
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    if (!form) return;
    try {
      const blob = await createPdfFromPages({
        pages: [previewHtml],
        widthPx: previewWidthPx,
        heightPx: previewHeightPx,
        widthMm: paper.widthMm,
        heightMm: paper.heightMm,
        paperSize: form.paperSize,
        renderDpi: PDF_RENDER_DPI,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.name.replace(/[^\w\s-]/g, "").trim() || "optic-form"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF Oluşturuldu", { description: "Optik form PDF olarak indirildi." });
    } catch {
      toast.error("PDF hatası", { description: "PDF oluşturulamadı." });
    }
  };

  const printForm = () => {
    if (!form) return;
    const printDocument = openPrintWindow(form.paperSize);
    if (!printDocument) {
      toast.error("Hata", { description: "Yazdırma penceresi açılamadı." });
      return;
    }
    void printDocument.appendPage(previewHtml).then(() => {
      printDocument.print();
      toast("Yazdırma Başlatıldı", { description: `"${form.name}" yazdırma için hazırlandı.` });
    }).catch((error: unknown) => {
      printDocument.close();
      toast.error("Yazdırma hatası", {
        description: error instanceof Error ? error.message : "Optik form hazırlanamadı.",
      });
    });
  };

  const deleteForm = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" formu silinecek. Emin misiniz?`)) return;
    try {
      await apiRequest("DELETE", `/api/optics/form-designs/${id}`);
      toast("Form silindi", { description: `"${name}" silindi.` });
      await loadForms();
    } catch {
      toast.error("Silme hatası", { description: "Form silinemedi." });
    }
  };

  if (!form) {
    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
        <div>
          <h1 className="text-title-1-semibold text-text-primary">Optik Oluşturma</h1>
          <p className="text-text-tertiary mt-1">Yeni bir optik form oluşturun veya kayıtlı bir formu düzenleyin.</p>
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
                <Input
                  id="new-form-name"
                  placeholder="Örn. 8.Sınıf Deneme Sınavı"
                  value={newFormName}
                  onChange={(e) => setNewFormName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Select
                  label="Kağıt Boyutu"
                  selectedKey={newFormSize}
                  onSelectionChange={(key) => setNewFormSize(String(key) as "A4" | "A5")}
                >
                  <SelectItem id="A4">A4</SelectItem>
                  <SelectItem id="A5">A5</SelectItem>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={() => setForm(createDefaultForm(newFormName.trim() || "Yeni Optik Form", newFormSize))} variant="ghost" leadingIcon={Plus}
              >

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
              {forms.length === 0 && <p className="text-sm text-text-tertiary">Henüz kayıtlı form yok.</p>}
              {forms.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-separator-border/70 p-3 hover:border-accent-600/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{f.name}</div>
                    <div className="text-[11px] text-text-tertiary">
                      {f.paperSize} · {f.grids.length} ders · {f.fields.length} bilgi alanı
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="secondary"
                      className="text-text-error-primary hover:bg-border-error-default/10 hover:text-text-error-primary"
                      title="Formu sil"
                      aria-label="Formu sil"
                      onClick={() => deleteForm(f.id, f.name)} iconOnly leadingIcon={Trash2}
                    ></Button>
                    <Button size="small" variant="secondary" className="text-status-lime-text hover:bg-status-lime-background/40" onClick={() => setForm({ ...f })}>
                      Aç
                    </Button>
                  </div>
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
      <div className="flex items-end gap-4 rounded-lg border bg-background-primary-default px-4 py-2 shadow-sm">
        <div className="flex items-end gap-3">
          <div className="shrink-0 space-y-1">
            <Label htmlFor="form-name" className="text-caption-1-medium">Form Adı</Label>
            <Input id="form-name" fieldClassName="w-72" size="small" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div className="shrink-0 space-y-1">
            <Label htmlFor="form-title" className="text-caption-1-medium">Form Başlığı</Label>
            <Input
              id="form-title"
              fieldClassName="w-56" size="small"
              value={form.title ?? ""}
              placeholder="Örn. LGS Deneme Sınavı"
              onChange={(e) => patch({ title: e.target.value })}
            />
          </div>
          <div className="shrink-0 space-y-1">
            <Select
              label={<span className="text-caption-1-medium">Kağıt Boyutu</span>}
              selectedKey={form.paperSize}
              size="sm"
              className="w-24"
              onSelectionChange={(key) => patch({ paperSize: String(key) as "A4" | "A5" })}
            >
              <SelectItem id="A4">A4</SelectItem>
              <SelectItem id="A5">A5</SelectItem>
            </Select>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Button size="small" variant="ghost" leadingIcon={Move} onClick={() => setForm(null)}>
            ← Form Listesi
          </Button>
          <Button size="small" leadingIcon={Printer} onClick={printForm} variant="ghost">
            Yazdır
          </Button>
          <Button size="small" variant="ghost" leadingIcon={FileDown} onClick={exportPdf}>
            PDF
          </Button>
          <Button size="small" variant="ghost" leadingIcon={Save} onClick={saveForm} disabled={saving}>
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
            </CardHeader>
            <CardContent
              className="space-y-3"
              style={{ maxHeight: previewHeightPx * previewScale + 32, overflowY: "auto" }}
            >
              {form.fields.map((field) => (
                <div key={field.id} className="rounded-lg border border-separator-border/70 p-2.5 space-y-2">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <Input
                      className="min-w-0 text-sm" size="small"
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                    />
                    <Button size="small" variant="secondary" className="shrink-0 text-text-error-primary hover:bg-border-error-default/10 hover:text-text-error-primary" onClick={() => removeField(field.id)} iconOnly leadingIcon={Trash2} aria-label="Bilgi alanını kaldır" />
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-2">
                    <div className="min-w-0">
                      <Select
                        label={<span className="block h-5 whitespace-nowrap text-caption-2-medium">Tür</span>}
                        size="sm"
                        selectedKey={isHeadingField(field) ? "heading" : isBoxField(field) ? "box" : isBookletField(field) ? "booklet" : isNumericField(field) ? "numeric" : "text"}
                        onSelectionChange={(key) => updateField(field.id, { type: String(key) as FormTextField["type"] })}
                      >
                        <SelectItem id="text">Metin</SelectItem>
                        <SelectItem id="numeric">Sayısal Alan</SelectItem>
                        <SelectItem id="booklet">Kitapçık</SelectItem>
                        <SelectItem id="box">Kutu</SelectItem>
                        <SelectItem id="heading">Yazı</SelectItem>
                      </Select>
                    </div>
                    {isHeadingField(field) ? (
                      <div>
                        <Label className="min-h-5 justify-between whitespace-nowrap text-caption-2-medium">
                          Yazı Boyutu
                          <span>{field.fontSizeMm ?? HEADING_DEFAULT_FONT_MM}mm</span>
                        </Label>
                        <Slider
                          aria-label="Yazı boyutu"
                          minValue={HEADING_MIN_FONT_MM}
                          maxValue={HEADING_MAX_FONT_MM}
                          step={0.5}
                          showTooltip={false}
                          value={field.fontSizeMm ?? HEADING_DEFAULT_FONT_MM}
                          onChange={(value) => updateField(field.id, { fontSizeMm: value })}
                        />
                      </div>
                    ) : isBoxField(field) ? (
                      <div className="min-w-0">
                        <Label className="min-h-5 whitespace-nowrap text-caption-2-medium" htmlFor={`kose-yaricapi-mm-${field.id}`}>Köşe yarıçapı (mm)</Label>
                        <Input
                          id={`kose-yaricapi-mm-${field.id}`}
                          type="number"
                          min={0}
                          max={20}
                          step={0.5}
                          size="small"
                          value={field.borderRadiusMm ?? 2}
                          onChange={(e) => updateField(field.id, { borderRadiusMm: Number(e.target.value) || 0 })}
                        />
                      </div>
                    ) : isNumericField(field) || isBookletField(field) ? (
                      <div className="min-w-0">
                        <Label className="min-h-5 whitespace-nowrap text-caption-2-medium" htmlFor={`alan-sayisi-${field.id}`}>{isBookletField(field) ? "Seçenek Sayısı" : "Sütun Sayısı"}</Label>
                        <Input
                          id={`alan-sayisi-${field.id}`}
                          type="number"
                          min={isBookletField(field) ? 2 : 1}
                          max={isBookletField(field) ? 12 : 30}
                          size="small"
                          value={field.digitCount ?? (isBookletField(field) ? 4 : 11)}
                          onChange={(e) => updateField(field.id, { digitCount: Number(e.target.value) || 1 })}
                        />
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                  {isHeadingField(field) && (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-caption-1-medium" htmlFor={`genislik-baslik-${field.id}`}>Genişlik</Label>
                          <Checkbox
                            size="sm"
                            isSelected={field.autoWidth !== false}
                            onChange={(isSelected) => updateField(field.id, { autoWidth: isSelected })}
                          >
                            Otomatik
                          </Checkbox>
                        </div>
                        <Input
                          id={`genislik-baslik-${field.id}`}
                          type="number"
                          min={10}
                          max={200}
                          step={0.5}
                          size="small"
                          className="optic-form-number-input"
                          value={field.autoWidth !== false ? "" : dimensionDrafts[`${field.id}:widthMm`] ?? field.widthMm ?? 88}
                          placeholder="Otomatik"
                          disabled={field.autoWidth !== false}
                          onChange={(e) => {
                            updateField(field.id, { autoWidth: false });
                            updateDimensionDraft(field.id, "widthMm", e.target.value);
                          }}
                          onBlur={() => commitDimensionDraft(field.id, "widthMm", 10, 200)}
                        />
                      </div>
                      <div>
                        <Label className="justify-between text-caption-1-medium">
                          Harf Aralığı
                          <span>{field.letterSpacingMm ?? 0}mm</span>
                        </Label>
                        <Slider
                          aria-label="Harf aralığı"
                          minValue={0}
                          maxValue={5}
                          step={0.1}
                          showTooltip={false}
                          value={field.letterSpacingMm ?? 0}
                          onChange={(value) => updateField(field.id, { letterSpacingMm: value })}
                        />
                      </div>
                    </>
                  )}
                  {isBoxField(field) && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="min-w-0">
                        <Label className="min-h-5 whitespace-nowrap text-caption-2-medium" htmlFor={`genislik-mm-${field.id}`}>Genişlik (mm)</Label>
                        <Input
                          id={`genislik-mm-${field.id}`}
                          type="number"
                          min={10}
                          max={200}
                          step={0.5}
                          size="small"
                          className="optic-form-number-input"
                          value={dimensionDrafts[`${field.id}:widthMm`] ?? field.widthMm}
                          onChange={(e) => updateDimensionDraft(field.id, "widthMm", e.target.value)}
                          onBlur={() => commitDimensionDraft(field.id, "widthMm", 10, 200)}
                        />
                      </div>
                      <div className="min-w-0">
                        <Label className="min-h-5 whitespace-nowrap text-caption-2-medium" htmlFor={`yukseklik-mm-${field.id}`}>Yükseklik (mm)</Label>
                        <Input
                          id={`yukseklik-mm-${field.id}`}
                          type="number"
                          min={3}
                          max={100}
                          step={0.5}
                          size="small"
                          className="optic-form-number-input"
                          value={dimensionDrafts[`${field.id}:heightMm`] ?? field.heightMm ?? 14}
                          onChange={(e) => updateDimensionDraft(field.id, "heightMm", e.target.value)}
                          onBlur={() => commitDimensionDraft(field.id, "heightMm", 3, 100)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <Button variant="ghost" className="w-full" onClick={addField} leadingIcon={Plus}>

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
            <div ref={previewAreaRef} className="overflow-hidden rounded-lg border bg-background-secondary-default/30 p-4">
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
          </CardHeader>
          <CardContent className="space-y-3">
            {form.grids.map((grid) => (
              <div key={grid.id} className="rounded-lg border border-separator-border/70 p-2.5 space-y-2">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <Input
                    className="min-w-0 text-sm" size="small"
                    value={grid.subject}
                    onChange={(e) => updateGrid(grid.id, { subject: e.target.value })}
                  />
                  <Button size="small" variant="secondary" className="shrink-0 text-text-error-primary hover:bg-border-error-default/10 hover:text-text-error-primary" onClick={() => removeGrid(grid.id)} iconOnly leadingIcon={Trash2} aria-label="Ders tablosunu kaldır" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-caption-1-medium" htmlFor="soru">Soru</Label>
                    <Input
                      id="soru"
                      type="number"
                      min={1}
                      max={100}
                      size="small"
                      value={grid.questionCount}
                      onChange={(e) => updateGrid(grid.id, { questionCount: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Select
                      label={<span className="text-caption-1-medium">Seçenek</span>}
                      size="sm"
                      selectedKey={grid.optionCount}
                      onSelectionChange={(key) => updateGrid(grid.id, { optionCount: Number(key) as 4 | 5 })}
                    >
                      <SelectItem id={4}>4 (A-D)</SelectItem>
                      <SelectItem id={5}>5 (A-E)</SelectItem>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="ghost" className="w-full" onClick={addGrid} leadingIcon={Plus}>

              Ders Tablosu Ekle
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
