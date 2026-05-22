import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function OpticReadingPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [realScanUrl, setRealScanUrl] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<boolean>(false);
  const [draggingAreaId, setDraggingAreaId] = useState<string | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [selectionMode, setSelectionMode] = useState<"draw" | "move">("draw");
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [step, setStep] = useState<"sample" | "mark" | "read">("sample");
  const [rows, setRows] = useState<number>(10);
  const [cols, setCols] = useState<number>(5);
  const [subject, setSubject] = useState<string>("Genel");
  const [areas, setAreas] = useState<Array<{
    id: string;
    subject: string;
    rect: { x: number; y: number; w: number; h: number };
    rows: number;
    cols: number;
    circles: Record<string, boolean>;
  }>>([]);

  const onSampleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFileUrl(url);
    setStep("mark");
  };

  const onRealScanFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setRealScanUrl(url);
  };

  const getPointInPreview = (e: React.MouseEvent | MouseEvent) => {
    if (!previewRef.current) return { x: 0, y: 0 };
    const rectEl = previewRef.current.getBoundingClientRect();
    return { x: e.clientX - rectEl.left, y: e.clientY - rectEl.top };
  };

  const onPreviewMouseDown = (e: React.MouseEvent) => {
    if (!previewRef.current || step === "sample") return;
    const { x, y } = getPointInPreview(e);

    const hitArea = [...areas].reverse().find((area) => {
      const { rect } = area;
      return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    });

    if (selectionMode === "move" && hitArea) {
      setDraggingAreaId(hitArea.id);
      setActiveAreaId(hitArea.id);
      setStartPos({ x, y });
      return;
    }

    setStartPos({ x, y });
    setDrawing(true);
  };

  const onPreviewMouseMove = (e: React.MouseEvent) => {
    if (!previewRef.current || step === "sample") return;
    const { x, y } = getPointInPreview(e);

    if (draggingAreaId && startPos) {
      setAreas((prev) => prev.map((area) => {
        if (area.id !== draggingAreaId) return area;
        const nextX = Math.max(0, Math.min(800 - area.rect.w, x - area.rect.w / 2));
        return {
          ...area,
          rect: {
            ...area.rect,
            x: Math.round(nextX),
          },
        };
      }));
      return;
    }

    if (!drawing || !startPos) return;
    const nx = Math.min(startPos.x, x);
    const ny = Math.min(startPos.y, y);
    const w = Math.abs(x - startPos.x);
    const h = Math.abs(y - startPos.y);
    // live preview not yet stored until mouse up
    setTempRect({ x: nx, y: ny, w, h });
  };

  const [tempRect, setTempRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const onPreviewMouseUp = () => {
    if (draggingAreaId) {
      setDraggingAreaId(null);
      setStartPos(null);
      return;
    }

    if (drawing && tempRect && tempRect.w > 10 && tempRect.h > 10) {
      const newAreaId = `area-${Date.now()}`;
      const normalizedRows = Math.max(1, rows);
      const normalizedCols = Math.max(1, cols);

      setAreas((prev) => [
        ...prev,
        {
          id: newAreaId,
          subject,
          rect: tempRect,
          rows: normalizedRows,
          cols: normalizedCols,
          circles: Object.fromEntries(Array.from({ length: normalizedRows }, (_, r) => Array.from({ length: normalizedCols }, (_, c) => [`${r}_${c}`, false])).flat()),
        },
      ]);
      setActiveAreaId(newAreaId);
      setStep("mark");
    }

    setDrawing(false);
    setStartPos(null);
    setTempRect(null);
  };

  const generateGrid = () => {
    if (!tempRect && !activeAreaId) {
      toast({ title: "Uyarı", description: "Lütfen önce bir dikdörtgen çiziniz." });
      return;
    }

    if (activeAreaId) {
      setAreas((prev) => prev.map((area) => {
        if (area.id !== activeAreaId) return area;
        const newCircles: Record<string, boolean> = {};
        for (let r = 0; r < area.rows; r++) {
          for (let c = 0; c < area.cols; c++) {
            newCircles[`${r}_${c}`] = false;
          }
        }
        return { ...area, circles: newCircles };
      }));
    }
    toast({ title: "Izgara Oluşturuldu", description: `${rows} satır x ${cols} sütun` });
  };

  const toggleCircle = (areaId: string, r: number, c: number) => {
    const key = `${r}_${c}`;
    setAreas((prev) => prev.map((area) => area.id === areaId ? { ...area, circles: { ...area.circles, [key]: !area.circles[key] } } : area));
  };

  const removeArea = (areaId: string) => {
    setAreas((prev) => prev.filter((area) => area.id !== areaId));
    if (activeAreaId === areaId) setActiveAreaId(null);
  };

  const updateArea = (areaId: string, patch: Partial<{ subject: string; rows: number; cols: number }>) => {
    setAreas((prev) => prev.map((area) => {
      if (area.id !== areaId) return area;
      const nextRows = patch.rows ?? area.rows;
      const nextCols = patch.cols ?? area.cols;
      const nextSubject = patch.subject ?? area.subject;
      return {
        ...area,
        subject: nextSubject,
        rows: nextRows,
        cols: nextCols,
      };
    }));
  };

  const activeArea = useMemo(() => areas.find((area) => area.id === activeAreaId) || null, [areas, activeAreaId]);

  const saveConfig = async () => {
    if (areas.length === 0) {
      toast({ title: "Hata", description: "Kaydetmek için en az bir alan oluşturun." });
      return;
    }

    const payload = { subject, areas };

    try {
      await fetch("/api/optics/configs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      toast({ title: "Kaydedildi", description: "Optik alan ayarı kaydedildi." });
      setStep("read");
    } catch (err) {
      toast({ title: "Hata", description: "Sunucuya kaydedilemedi." });
    }
  };

  const saveResults = async () => {
    if (!realScanUrl) {
      toast({ title: "Hata", description: "Önce gerçek tarama dosyasını yükleyin." });
      return;
    }

    const results = areas.map((area) => ({
      areaId: area.id,
      subject: area.subject,
      rect: area.rect,
      answers: Array.from({ length: area.rows }).map((_, r) => {
        const choices: string[] = [];
        for (let c = 0; c < area.cols; c++) {
          if (area.circles[`${r}_${c}`]) choices.push(String.fromCharCode(65 + c));
        }
        return choices.join("") || "";
      }),
    }));

    const payload = { results };
    try {
      await fetch("/api/optics/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      toast({ title: "Kaydedildi", description: "Okuma sonuçları kaydedildi." });
    } catch {
      toast({ title: "Hata", description: "Sonuçlar kaydedilemedi." });
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Optik Okuma</h1>
        <p className="text-muted-foreground mt-1">Önce örnek sayfayı yükleyin, sonra okunacak alanları işaretleyip kaydedin, en son gerçek taramayı aynı alanlarla okuyun.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className={`rounded-lg border p-4 ${step === "sample" ? "border-primary bg-primary/5" : "bg-background"}`}>
          <div className="text-sm font-semibold">1. Örnek Sayfa</div>
          <div className="text-xs text-muted-foreground mt-1">Okunacak formun örnek PDF/görselini yükleyin.</div>
        </div>
        <div className={`rounded-lg border p-4 ${step === "mark" ? "border-primary bg-primary/5" : "bg-background"}`}>
          <div className="text-sm font-semibold">2. Alanları İşaretle</div>
          <div className="text-xs text-muted-foreground mt-1">Birden çok alanı ders bazında çizin, kaydedin.</div>
        </div>
        <div className={`rounded-lg border p-4 ${step === "read" ? "border-primary bg-primary/5" : "bg-background"}`}>
          <div className="text-sm font-semibold">3. Gerçek Veri Oku</div>
          <div className="text-xs text-muted-foreground mt-1">Tarama dosyasını yükleyip kaydedilmiş alanlarla sonucu alın.</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Yükle & Ayarlar</CardTitle>
            <CardDescription>PDF veya görüntü yükleyip alanı seçin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>1) Örnek Sayfa (PDF/JPG/PNG)</Label>
              <Input type="file" accept="image/*,application/pdf" ref={fileInputRef} onChange={onSampleFileChange} />
              <p className="mt-1 text-xs text-muted-foreground">Örnek olmadan alan işaretleme başlatılmaz.</p>
            </div>

            <div>
              <Label>3) Gerçek Tarama Dosyası</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={onRealScanFileChange} disabled={!areas.length} />
              <p className="mt-1 text-xs text-muted-foreground">Alanlar kaydedildikten sonra etkinleşir.</p>
            </div>

            <div>
              <Label>Konu</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Alan Modu</Label>
              <div className="flex gap-2">
                <Button type="button" variant={selectionMode === "draw" ? "default" : "outline"} onClick={() => setSelectionMode("draw")}>Çiz</Button>
                <Button type="button" variant={selectionMode === "move" ? "default" : "outline"} onClick={() => setSelectionMode("move")}>Yatay Taşı</Button>
              </div>
            </div>

            <div>
              <Label>Satır sayısı</Label>
              <Input type="number" min={1} value={rows} onChange={(e) => setRows(Number(e.target.value) || 1)} />
            </div>

            <div>
              <Label>Sütun (seçenek) sayısı</Label>
              <Select onValueChange={(v) => setCols(Number(v))}>
                <SelectTrigger className="w-full"><SelectValue placeholder={`${cols}`} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button onClick={generateGrid} disabled={!fileUrl || step === "sample"}>Alan Izgarası Oluştur</Button>
              <Button variant="ghost" onClick={saveConfig} disabled={!areas.length}>Alan Ayarını Kaydet</Button>
              <Button variant="secondary" onClick={saveResults} disabled={!realScanUrl || !areas.length}>Sonuçları Kaydet</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Örnek Sayfa & Seçim</CardTitle>
            <CardDescription>Sayfa üzerinde dikdörtgen çizerek okumaya dahil alanı seçin, ardından ızgara oluşturun.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-lg border bg-muted/30 p-3">
              <div ref={previewRef} className="relative mx-auto bg-white" style={{ width: 800, height: 1120, userSelect: "none" }} onMouseDown={onPreviewMouseDown} onMouseMove={onPreviewMouseMove} onMouseUp={onPreviewMouseUp}>
                {fileUrl ? <img src={fileUrl} alt="optic-scan" className="w-full h-full object-contain pointer-events-none" /> : (
                  <div className="absolute inset-0 grid place-content-center text-sm text-muted-foreground">
                    <div className="text-center">Önce örnek sayfa yükleyin, sonra alanları işaretleyin.</div>
                  </div>
                )}

                {tempRect && drawing && (
                  <div style={{ position: "absolute", left: tempRect.x, top: tempRect.y, width: tempRect.w, height: tempRect.h, border: "2px dashed #0ea5a4", background: "rgba(14,165,164,0.03)" }} />
                )}

                {areas.map((area) => {
                  const cellWidth = area.rect.w / area.cols;
                  const cellHeight = area.rect.h / area.rows;

                  const PX_PER_MM = 96 / 25.4;
                  const spacingMm = 1;
                  const spacingPx = spacingMm * PX_PER_MM;
                  const circleDiameter = Math.max(6, Math.round(Math.min(cellWidth - spacingPx, cellHeight - spacingPx)));

                  return (
                    <div
                      key={area.id}
                      style={{
                        position: "absolute",
                        left: area.rect.x,
                        top: area.rect.y,
                        width: area.rect.w,
                        height: area.rect.h,
                        border: activeAreaId === area.id ? "2px solid #0ea5a4" : "1px dashed rgba(14,165,164,0.4)",
                        background: activeAreaId === area.id ? "rgba(14,165,164,0.03)" : "transparent",
                        boxSizing: "border-box",
                        cursor: selectionMode === "move" ? "ew-resize" : "default",
                      }}
                      onClick={() => setActiveAreaId(area.id)}
                    >
                      {Array.from({ length: area.rows }).map((_, r) => (
                        Array.from({ length: area.cols }).map((__, c) => {
                          const key = `${r}_${c}`;
                          const isOn = !!area.circles[key];
                          const cx = (c + 0.5) * cellWidth - circleDiameter / 2;
                          const cy = (r + 0.5) * cellHeight - circleDiameter / 2;

                          return (
                            <div
                              key={key}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleCircle(area.id, r, c);
                              }}
                              style={{
                                position: "absolute",
                                left: Math.round(cx),
                                top: Math.round(cy),
                                width: Math.round(circleDiameter),
                                height: Math.round(circleDiameter),
                                borderRadius: "50%",
                                border: "2px solid #0369a1",
                                background: isOn ? "#0369a1" : "transparent",
                                boxSizing: "border-box",
                                cursor: "pointer",
                              }}
                            />
                          );
                        })
                      ))}
                    </div>
                  );
                })}

              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Eklenen Alanlar</CardTitle>
            <CardDescription>Her alanın konusu, satır/sütun sayısı, konumu ve işaretleme durumu burada listelenir. Alanı seçip silip düzenleyebilirsiniz.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              {step === "sample" && "1. aşama: önce örnek sayfayı yükleyin. Sonra alan çizmeye geçeceksiniz."}
              {step === "mark" && "2. aşama: alanları tek tek belirleyin, ders adını verin ve kaydedin."}
              {step === "read" && "3. aşama: gerçek taramayı yükleyin ve kayıtlı alanlar üzerinden sonucu saklayın."}
            </div>

            {areas.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Henüz alan eklenmedi. Örnek sayfa üzerinde bir dikdörtgen çizerek başlayın.</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {areas.map((area, index) => (
                  <div key={area.id} className={`rounded-lg border p-4 ${activeAreaId === area.id ? "border-primary bg-primary/5" : "bg-background"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">Alan {index + 1}</div>
                        <div className="text-sm text-muted-foreground">{area.subject}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeArea(area.id)}>Sil</Button>
                    </div>

                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Konu</div><div className="font-medium text-right">{area.subject}</div>
                      <div>Satır</div><div className="font-medium text-right">{area.rows}</div>
                      <div>Sütun</div><div className="font-medium text-right">{area.cols}</div>
                      <div>X</div><div className="font-medium text-right">{Math.round(area.rect.x)} px</div>
                      <div>Y</div><div className="font-medium text-right">{Math.round(area.rect.y)} px</div>
                      <div>Genişlik</div><div className="font-medium text-right">{Math.round(area.rect.w)} px</div>
                      <div>Yükseklik</div><div className="font-medium text-right">{Math.round(area.rect.h)} px</div>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor={`area-subject-${area.id}`} className="text-xs">Ders Adı</Label>
                        <Input
                          id={`area-subject-${area.id}`}
                          value={area.subject}
                          onChange={(e) => updateArea(area.id, { subject: e.target.value })}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-1">
                          <Label htmlFor={`area-rows-${area.id}`} className="text-xs">Satır</Label>
                          <Input
                            id={`area-rows-${area.id}`}
                            type="number"
                            min={1}
                            value={area.rows}
                            onChange={(e) => updateArea(area.id, { rows: Math.max(1, Number(e.target.value) || 1) })}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor={`area-cols-${area.id}`} className="text-xs">Sütun</Label>
                          <Input
                            id={`area-cols-${area.id}`}
                            type="number"
                            min={1}
                            max={5}
                            value={area.cols}
                            onChange={(e) => updateArea(area.id, { cols: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
                          />
                        </div>
                      </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setActiveAreaId(area.id)}>Seç</Button>
                      <Button variant="outline" size="sm" onClick={() => updateArea(area.id, { subject: area.subject })}>Yenile</Button>
                    </div>
                  </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
