import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { normalizeOpticConfig } from "@/lib/optic/config-normalizer";
import {
  defaultGridAnchors,
  getAllBubblePositions,
  normalizeDrawnRect,
  pageToAreaNormalized,
} from "@/lib/optic/grid-positions";
import { imageDataToCanvas } from "@/lib/optic/image-utils";
import { renderPdfPages } from "@/lib/optic/pdf-renderer";
import { processPage } from "@/lib/optic/scan-processor";
import type { GridAnchors, NormalizedRect, OpticAreaConfig, OpticSheetConfig } from "@/lib/optic/types";
import {
  Crosshair,
  Eye,
  Loader2,
  Plus,
  Save,
  Square,
  Target,
  Trash2,
  Upload,
} from "lucide-react";

type EditorMode = "frame" | "area" | "calibrate";

interface EditableArea {
  id: string;
  subject: string;
  questionCount: number;
  optionCount: number;
  rect: NormalizedRect;
  gridAnchors: GridAnchors | null;
}

const CALIBRATE_STEPS: Array<{ key: keyof GridAnchors; label: string }> = [
  { key: "topLeft", label: "1. soru / A şıkkı merkezi" },
  { key: "topRight", label: "1. soru / son şık merkezi" },
  { key: "bottomLeft", label: "Son soru / A şıkkı merkezi" },
  { key: "bottomRight", label: "Son soru / son şık merkezi" },
];

interface OpticCalibrationEditorProps {
  onConfigSaved?: (config: OpticSheetConfig) => void;
}

export function OpticCalibrationEditor({ onConfigSaved }: OpticCalibrationEditorProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [mode, setMode] = useState<EditorMode>("frame");
  const [showBubbles, setShowBubbles] = useState(true);
  const [frameRect, setFrameRect] = useState<NormalizedRect | null>(null);
  const [areas, setAreas] = useState<EditableArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<NormalizedRect | null>(null);
  const [calibrateStep, setCalibrateStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? null;

  const loadTemplate = async (file: File) => {
    setIsLoading(true);
    try {
      const pages = await renderPdfPages(file, 2);
      const page = pages[0];
      setImageData(page);
      setPreviewUrl(imageDataToCanvas(page).toDataURL("image/png"));
      setTemplateFile(file);
      setFrameRect(null);
      setAreas([]);
      setSelectedAreaId(null);
      setCalibrateStep(0);
    } catch {
      toast({ title: "Hata", description: "Sablon PDF acilamadi.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const pageCoordsFromEvent = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imageData) return;

    const cw = container.clientWidth;
    const ch = (imageData.height / imageData.width) * cw;
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, cw, ch);

    const scaleX = cw;
    const scaleY = ch;

    if (frameRect) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(
        frameRect.x * scaleX,
        frameRect.y * scaleY,
        frameRect.w * scaleX,
        frameRect.h * scaleY,
      );
      ctx.fillStyle = "rgba(239,68,68,0.08)";
      ctx.fillRect(
        frameRect.x * scaleX,
        frameRect.y * scaleY,
        frameRect.w * scaleX,
        frameRect.h * scaleY,
      );
    }

    if (drawCurrent) {
      ctx.strokeStyle = mode === "frame" ? "#ef4444" : "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        drawCurrent.x * scaleX,
        drawCurrent.y * scaleY,
        drawCurrent.w * scaleX,
        drawCurrent.h * scaleY,
      );
    }

    for (const area of areas) {
      const isSelected = area.id === selectedAreaId;
      ctx.strokeStyle = isSelected ? "#16a34a" : "#2563eb";
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(
        area.rect.x * scaleX,
        area.rect.y * scaleY,
        area.rect.w * scaleX,
        area.rect.h * scaleY,
      );

      ctx.fillStyle = isSelected ? "rgba(22,163,74,0.12)" : "rgba(37,99,235,0.08)";
      ctx.fillRect(
        area.rect.x * scaleX,
        area.rect.y * scaleY,
        area.rect.w * scaleX,
        area.rect.h * scaleY,
      );

      ctx.fillStyle = isSelected ? "#166534" : "#1e40af";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(area.subject, area.rect.x * scaleX + 4, area.rect.y * scaleY + 14);

      if (area.gridAnchors) {
        const anchorPoints: Array<{ label: string; pt: { x: number; y: number } }> = [
          { label: "TL", pt: area.gridAnchors.topLeft },
          { label: "TR", pt: area.gridAnchors.topRight },
          { label: "BL", pt: area.gridAnchors.bottomLeft },
          { label: "BR", pt: area.gridAnchors.bottomRight },
        ];
        for (const { label, pt } of anchorPoints) {
          const ax = (area.rect.x + pt.x * area.rect.w) * scaleX;
          const ay = (area.rect.y + pt.y * area.rect.h) * scaleY;
          ctx.beginPath();
          ctx.arc(ax, ay, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#f59e0b";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = "#92400e";
          ctx.font = "9px sans-serif";
          ctx.fillText(label, ax + 7, ay + 3);
        }
      }

      if (showBubbles) {
        const configArea: OpticAreaConfig = {
          id: area.id,
          pageIndex: 0,
          subject: area.subject,
          questionCount: area.questionCount,
          optionCount: area.optionCount,
          rect: area.rect,
          gridAnchors: area.gridAnchors ?? undefined,
        };
        const bubbles = getAllBubblePositions(cw, ch, configArea);
        for (const bubble of bubbles) {
          ctx.beginPath();
          ctx.arc(bubble.cx, bubble.cy, 4, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? "rgba(22,163,74,0.7)" : "rgba(37,99,235,0.5)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }, [imageData, frameRect, areas, selectedAreaId, drawCurrent, mode, showBubbles]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = pageCoordsFromEvent(e);
    if (!coords) return;

    if (mode === "calibrate" && selectedArea) {
      const local = pageToAreaNormalized(coords.x, coords.y, selectedArea.rect);
      const step = CALIBRATE_STEPS[calibrateStep];
      const partial: Partial<GridAnchors> = {
        ...(selectedArea.gridAnchors ?? defaultGridAnchors(selectedArea.questionCount, selectedArea.optionCount)),
        [step.key]: local,
      };

      const nextAnchors = partial as GridAnchors;
      setAreas((prev) =>
        prev.map((a) => (a.id === selectedArea.id ? { ...a, gridAnchors: nextAnchors } : a)),
      );

      if (calibrateStep < CALIBRATE_STEPS.length - 1) {
        setCalibrateStep((s) => s + 1);
      } else {
        toast({ title: "Kalibrasyon tamam", description: `${selectedArea.subject} baloncuklari hizalandi.` });
        setCalibrateStep(0);
      }
      return;
    }

    if (mode === "frame" || mode === "area") {
      setDrawStart(coords);
      setDrawCurrent(normalizeDrawnRect(coords.x, coords.y, coords.x, coords.y));
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawStart) return;
    const coords = pageCoordsFromEvent(e);
    if (!coords) return;
    setDrawCurrent(normalizeDrawnRect(drawStart.x, drawStart.y, coords.x, coords.y));
  };

  const handleMouseUp = () => {
    if (!drawCurrent || !drawStart) return;

    if (mode === "frame") {
      if (drawCurrent.w > 0.02 && drawCurrent.h > 0.02) {
        setFrameRect(drawCurrent);
        toast({ title: "Cerceve kaydedildi", description: "Siyah dikdortgen alani belirlendi." });
      }
    } else if (mode === "area") {
      if (drawCurrent.w > 0.01 && drawCurrent.h > 0.02) {
        const id = `area-${Date.now()}`;
        const newArea: EditableArea = {
          id,
          subject: `Ders ${areas.length + 1}`,
          questionCount: 10,
          optionCount: 4,
          rect: drawCurrent,
          gridAnchors: null,
        };
        setAreas((prev) => [...prev, newArea]);
        setSelectedAreaId(id);
        toast({
          title: "Alan eklendi",
          description: "Baloncuklari sadece iceren dikdortgen cizin (baslik haric).",
        });
      }
    }

    setDrawStart(null);
    setDrawCurrent(null);
  };

  const removeArea = (id: string) => {
    setAreas((prev) => prev.filter((a) => a.id !== id));
    if (selectedAreaId === id) setSelectedAreaId(null);
  };

  const startCalibrate = () => {
    if (!selectedArea) {
      toast({ title: "Alan secin", description: "Once bir ders alani secin.", variant: "destructive" });
      return;
    }
    setMode("calibrate");
    setCalibrateStep(0);
    toast({
      title: "Baloncuk hizalama",
      description: CALIBRATE_STEPS[0].label + " — tiklayin.",
    });
  };

  const resetAnchors = () => {
    if (!selectedArea) return;
    setAreas((prev) =>
      prev.map((a) =>
        a.id === selectedArea.id
          ? { ...a, gridAnchors: defaultGridAnchors(a.questionCount, a.optionCount) }
          : a,
      ),
    );
    setCalibrateStep(0);
  };

  const buildConfig = (): OpticSheetConfig => ({
    id: Date.now().toString(),
    fileName: templateFile?.name,
    pageCount: 1,
    frameRect: frameRect ?? undefined,
    areas: areas.map((a) => ({
      id: a.id,
      pageIndex: 0,
      subject: a.subject,
      questionCount: a.questionCount,
      optionCount: a.optionCount,
      rect: a.rect,
      gridAnchors: a.gridAnchors ?? undefined,
    })),
    createdAt: new Date().toISOString(),
  });

  const testRead = () => {
    if (!imageData || !areas.length) return;
    const config = buildConfig();
    const result = processPage(imageData, 0, config);
    const filled = result.areas.reduce(
      (sum, area) => sum + area.answers.filter((a) => a.answer).length,
      0,
    );
    const total = result.areas.reduce((sum, area) => sum + area.answers.length, 0);
    toast({
      title: "Test okuma",
      description: `${filled}/${total} isaret algilandi. ${result.warnings.length} uyari.`,
    });
  };

  const saveConfig = async () => {
    if (!frameRect) {
      toast({ title: "Cerceve eksik", description: "Once siyah cerceveyi cizin.", variant: "destructive" });
      return;
    }
    if (!areas.length) {
      toast({ title: "Alan eksik", description: "En az bir ders alani ekleyin.", variant: "destructive" });
      return;
    }

    const uncalibrated = areas.filter((a) => !a.gridAnchors);
    if (uncalibrated.length) {
      toast({
        title: "Kalibrasyon onerilir",
        description: `${uncalibrated.length} alanda baloncuk hizalama yapilmadi. Yine de kaydediliyor.`,
      });
    }

    setIsSaving(true);
    try {
      const payload = {
        fileName: templateFile?.name ?? "sablon.pdf",
        pageCount: 1,
        frameRect,
        areas: areas.map((a) => ({
          id: a.id,
          pageIndex: 0,
          subject: a.subject,
          questionCount: a.questionCount,
          optionCount: a.optionCount,
          rect: a.rect,
          gridAnchors: a.gridAnchors ?? defaultGridAnchors(a.questionCount, a.optionCount),
        })),
        savedAt: new Date().toISOString(),
      };

      await apiRequest("POST", "/api/optics/configs", payload);
      const normalized = normalizeOpticConfig({ id: Date.now().toString(), ...payload });
      if (normalized) onConfigSaved?.(normalized);

      toast({ title: "Sablon kaydedildi", description: "Tarama sekmesinden yeni sablonu secin." });
    } catch {
      toast({ title: "Kayit hatasi", description: "Sablon sunucuya yazilamadi.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1 h-fit">
        <CardHeader>
          <CardTitle>Sablon Kalibrasyonu</CardTitle>
          <CardDescription>
            Siyah cerceve, ders alanlari ve baloncuk konumlarini kendiniz belirleyin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Ornek Kagit (PDF)</Label>
            <Input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadTemplate(file);
              }}
            />
          </div>

          <div className="rounded-md bg-muted p-3 text-xs space-y-1">
            <p className="font-medium">Adimlar:</p>
            <p>1. Siyah cerceveyi cizin</p>
            <p>2. Her dersin baloncuk sutununu cizin (baslik haric)</p>
            <p>3. 4 kose baloncuga tiklayarak hizalayin</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant={mode === "frame" ? "default" : "outline"}
              onClick={() => setMode("frame")}
            >
              <Square className="mr-1 h-3 w-3" />
              Cerceve
            </Button>
            <Button size="sm" variant={mode === "area" ? "default" : "outline"} onClick={() => setMode("area")}>
              <Plus className="mr-1 h-3 w-3" />
              Alan
            </Button>
            <Button
              size="sm"
              variant={mode === "calibrate" ? "default" : "outline"}
              onClick={startCalibrate}
              disabled={!selectedArea}
            >
              <Target className="mr-1 h-3 w-3" />
              Baloncuk
            </Button>
            <Button
              size="sm"
              variant={showBubbles ? "default" : "outline"}
              onClick={() => setShowBubbles((v) => !v)}
            >
              <Eye className="mr-1 h-3 w-3" />
              Onizleme
            </Button>
          </div>

          {mode === "calibrate" && selectedArea && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <Crosshair className="inline h-3 w-3 mr-1" />
              {CALIBRATE_STEPS[calibrateStep]?.label ?? "Tamamlandi"}
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-auto">
            {areas.map((area) => (
              <div
                key={area.id}
                className={`rounded-lg border p-3 space-y-2 cursor-pointer transition-colors ${
                  selectedAreaId === area.id ? "border-green-500 bg-green-50/50" : "hover:border-primary/40"
                }`}
                onClick={() => setSelectedAreaId(area.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={area.subject}
                    onChange={(e) =>
                      setAreas((prev) =>
                        prev.map((a) => (a.id === area.id ? { ...a, subject: e.target.value } : a)),
                      )
                    }
                    className="h-7 text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeArea(area.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Soru</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={area.questionCount}
                      className="h-7"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 1;
                        setAreas((prev) =>
                          prev.map((a) =>
                            a.id === area.id ? { ...a, questionCount: val, gridAnchors: null } : a,
                          ),
                        );
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Sik</Label>
                    <select
                      className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                      value={area.optionCount}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = Number(e.target.value) as 4 | 5;
                        setAreas((prev) =>
                          prev.map((a) =>
                            a.id === area.id ? { ...a, optionCount: val, gridAnchors: null } : a,
                          ),
                        );
                      }}
                    >
                      <option value={4}>4 (A-D)</option>
                      <option value={5}>5 (A-E)</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {area.gridAnchors ? (
                    <Badge variant="secondary" className="text-xs">Hizalandi</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-amber-700">Hizalanmadi</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          {selectedArea && (
            <Button size="sm" variant="outline" className="w-full" onClick={resetAnchors}>
              Varsayilan grid'e sifirla
            </Button>
          )}

          <Button className="w-full" variant="outline" onClick={testRead} disabled={!imageData || !areas.length}>
            Test Oku
          </Button>

          <Button className="w-full" onClick={saveConfig} disabled={isSaving || isLoading}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Sablonu Kaydet
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Gorsel Editor</CardTitle>
          <CardDescription>
            Kirmizi = siyah cerceve, mavi = ders alani, yesil daireler = okuma noktalari
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Sablon yukleniyor...
            </div>
          ) : !previewUrl ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <Upload className="h-10 w-10 mb-3 opacity-40" />
              <p>Ornek optik kagidi PDF olarak yukleyin.</p>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="relative w-full select-none cursor-crosshair rounded-lg border overflow-hidden"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <img src={previewUrl} alt="Sablon" className="w-full block pointer-events-none" draggable={false} />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
