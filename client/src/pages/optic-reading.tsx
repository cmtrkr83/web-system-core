import { useCallback, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { AlertCircle, CheckCircle2, FileScan, Loader2, Upload, ImageIcon, RotateCw, Crop, QrCode, XCircle, CircleDot, Circle, ListChecks, Download, Files } from "lucide-react";

import { useToast } from "@/hooks/use-toast";

interface Question {
  no: number;
  answer: string | null;
}

interface Bubbles {
  detected: boolean;
  total: number;
  filled: number;
  empty: number;
  missing: number;
  rejected: number;
  standard_radius: number;
  grid_rows: number;
  questions_per_row: number[];
  options_per_question: number;
  questions?: Question[];
}

interface DetectFrameResult {
  success: boolean;
  file_name: string;
  image_width: number;
  image_height: number;
  area_detected: boolean;
  skew_angle: number;
  preview_base64: string | null;
  cropped_base64: string | null;
  bounding_box?: { x: number; y: number; w: number; h: number };
  corners?: number[][];
  area_ratio?: number;
  crop_width?: number;
  crop_height?: number;
  qr_data?: string;
  error: string | null;
  processed_path?: string;
  bubbles?: Bubbles;
  bubble_overlay_base64?: string;
  bubble_binary_base64?: string;
}

export default function OpticReading() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBatching, setIsBatching] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<DetectFrameResult | null>(null);
  const [batchResults, setBatchResults] = useState<DetectFrameResult[] | null>(null);
  const [batchCsv, setBatchCsv] = useState<string | null>(null);
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"preview" | "cropped" | "bubbles" | "binary" | "answers">("preview");
  const [threshold, setThreshold] = useState(120);
  const [isReProcessing, setIsReProcessing] = useState(false);
  const uploadedPathRef = useRef<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const isImage = file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/tiff"
        || file.name.toLowerCase().endsWith(".jpg") || file.name.toLowerCase().endsWith(".jpeg")
        || file.name.toLowerCase().endsWith(".png");
      if (isImage) {
        files.push(file);
      }
    }

    if (files.length === 0) {
      toast({
        title: "Geçersiz dosya",
        description: "JPEG veya PNG dosyası seçin.",
        variant: "destructive",
      });
      return;
    }

    setImageFiles(files);
    setResult(null);
    setBatchResults(null);
    setBatchCsv(null);
    setUploadedPaths([]);
    uploadedPathRef.current = null;
    setThreshold(120);

    // İlk dosyanın önizlemesini göster
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(files[0]);
  };

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch("/api/optics/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error(err.message || "Dosya yükleme başarısız");
    }

    const uploadData = await uploadRes.json();
    return uploadData.filePath;
  }, []);

  const detectFrame = useCallback(async (thr?: number) => {
    if (imageFiles.length === 0) {
      toast({ title: "Dosya seçilmedi", description: "Önce bir görsel dosyası seçin.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    let filePath: string;

    try {
      filePath = await uploadFile(imageFiles[0]);
      setUploadedPaths([filePath]);
      uploadedPathRef.current = filePath;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Yükleme hatası";
      toast({ title: "Yükleme hatası", description: msg, variant: "destructive" });
      setIsUploading(false);
      return;
    }

    setIsUploading(false);
    setIsProcessing(true);

    try {
      const res = await fetch("/api/optics/detect-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, threshold: thr ?? threshold }),
      });

      const data: DetectFrameResult = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Çerçeve tespiti başarısız");
      }

      setResult(data);
      setBatchResults(null);
      setBatchCsv(null);

      if (data.area_detected) {
        toast({
          title: "Alan tespit edildi" + (data.qr_data ? " + Karekod okundu" : ""),
          description: `Eğiklik: ${data.skew_angle}° | ${data.bounding_box?.w || 0}x${data.bounding_box?.h || 0}${data.qr_data ? ` | QR: ${data.qr_data}` : ""}`,
        });
      } else {
        toast({
          title: "Alan tespit edilemedi",
          description: data.error || "Siyah kenarlıklı cevap alanı bulunamadı.",
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "İşlem hatası";
      toast({ title: "İşlem hatası", description: msg, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [imageFiles, uploadFile, toast, threshold]);

  const handleThresholdChange = useCallback(async (value: number[]) => {
    const newThr = value[0];
    setThreshold(newThr);

    const path = uploadedPathRef.current;
    if (!path) return;

    setIsReProcessing(true);
    try {
      const res = await fetch("/api/optics/detect-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: path, threshold: newThr }),
      });
      const data: DetectFrameResult = await res.json();
      if (res.ok) {
        setResult(data);
        setActiveTab("bubbles");
      } else {
        toast({ title: "Eşik güncelleme hatası", description: data.error || "İşlem başarısız", variant: "destructive" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ağ hatası";
      toast({ title: "Eşik güncelleme hatası", description: msg, variant: "destructive" });
    } finally {
      setIsReProcessing(false);
    }
  }, [toast]);

  const batchProcess = useCallback(async () => {
    if (imageFiles.length === 0) {
      toast({ title: "Dosya seçilmedi", description: "En az bir JPEG dosyası seçin.", variant: "destructive" });
      return;
    }

    setIsBatching(true);
    setBatchProgress({ current: 0, total: imageFiles.length });
    setBatchResults(null);
    setBatchCsv(null);
    setResult(null);

    const allResults: DetectFrameResult[] = [];

    try {
      for (let i = 0; i < imageFiles.length; i++) {
        setBatchProgress({ current: i + 1, total: imageFiles.length });

        // 1. Dosyayı yükle
        const filePath = await uploadFile(imageFiles[i]);

        // 2. detect-frame çağır (önizleme için)
        const res = await fetch("/api/optics/detect-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath, threshold }),
        });

        if (res.ok) {
          const data: DetectFrameResult = await res.json();
          allResults.push(data);

          // Önizlemeyi güncelle (dinamik!)
          setResult(data);
          setActiveTab("preview");

          if (!data.area_detected) {
            toast({
              title: `Uyarı: ${imageFiles[i].name}`,
              description: "Alan tespit edilemedi, atlanıyor.",
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: `Hata: ${imageFiles[i].name}`,
            description: "İşlem başarısız, atlanıyor.",
            variant: "destructive",
          });
        }
      }

      setBatchResults(allResults);
      setUploadedPaths(allResults.map(() => ""));
      setActiveTab("answers");

      // CSV'yi frontend'de oluştur
      const maxQ = allResults.reduce((m, r) => Math.max(m, r.bubbles?.questions?.length ?? 0), 0);
      const header = ["Dosya", "QR", "Toplam Soru", "Cevaplanan", ...Array.from({ length: maxQ }, (_, i) => `Soru ${i + 1}`)];
      const rows = allResults.map((r) => {
        const qs = r.bubbles?.questions ?? [];
        const filled = qs.filter((q) => q.answer).length;
        return [
          r.file_name,
          r.qr_data || "",
          String(qs.length),
          String(filled),
          ...qs.map((q) => q.answer || ""),
          ...Array.from({ length: maxQ - qs.length }, () => ""),
        ];
      });
      const csvContent = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
      setBatchCsv(csvContent);

      toast({
        title: `${allResults.length} dosya işlendi`,
        description: "CSV indirilebilir. Cevaplar sekmesini açın.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Batch hatası";
      toast({ title: "Batch işlem hatası", description: msg, variant: "destructive" });
    } finally {
      setIsBatching(false);
      setBatchProgress({ current: 0, total: 0 });
    }
  }, [imageFiles, uploadFile, threshold, toast]);

  const downloadCsv = useCallback(() => {
    if (!batchCsv) return;
    const blob = new Blob([batchCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `optic_sonuclar_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [batchCsv]);

  const handleSaveResults = async () => {
    const activeResult = result || (batchResults?.[0] ?? null);
    if (!activeResult) return;

    try {
      const payload: Record<string, unknown> = {
        fileName: imageFiles[0]?.name || activeResult.file_name,
        pageCount: 1,
        qrData: activeResult.qr_data || "",
        results: [{
          pageIndex: 0,
          areaId: "main",
          subject: "Optik",
          frameDetected: activeResult.area_detected,
          skewAngle: activeResult.skew_angle,
          boundingBox: activeResult.bounding_box,
          answers: [],
        }],
      };

      const saveRes = await fetch("/api/optics/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        throw new Error(err.message || "Kaydetme başarısız");
      }

      toast({ title: "Kaydedildi", description: "Sonuçlar sunucuya kaydedildi." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kaydetme hatası";
      toast({ title: "Kaydetme hatası", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Optik Okuma</h1>
        <p className="text-muted-foreground mt-1">
          JPEG/PNG görsel yükleyin. Tek dosya tespit veya birden çok dosyayı toplu işleme.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>İşlem Adımları</CardTitle>
            <CardDescription>Görsel yükle, alanı tespit et, sonucu kaydet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file-upload">Görsel Dosyaları (JPEG/PNG — birden çok seçilebilir)</Label>
              <Input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,.jpg,.jpeg,image/png,.png"
                multiple
                onChange={handleFileChange}
              />
              {imageFiles.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {imageFiles.length} dosya seçildi (toplam {imageFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024 < 1
                      ? `${(imageFiles.reduce((s, f) => s + f.size, 0) / 1024).toFixed(0)} KB`
                      : `${(imageFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB`
                    })
                  </p>
                  <div className="max-h-20 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
                    {imageFiles.map((f, i) => (
                      <div key={i} className="truncate">
                        {i + 1}. {f.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {imagePreviewUrl && !result && (
              <div className="rounded-md overflow-hidden border">
                <img
                  src={imagePreviewUrl}
                  alt="Preview"
                  className="w-full h-auto object-contain max-h-60"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => detectFrame()}
                disabled={isUploading || isProcessing || imageFiles.length === 0}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Yükleniyor...
                  </>
                ) : isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Alan tespit ediliyor...
                  </>
                ) : (
                  <>
                    <FileScan className="mr-2 h-4 w-4" />
                    Alanı Tespit Et
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={batchProcess}
                disabled={isBatching || isProcessing || imageFiles.length < 2}
                title={imageFiles.length < 2 ? "En az 2 dosya seçin" : "Tüm dosyaları işle"}
              >
                {isBatching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {batchProgress.current}/{batchProgress.total}
                  </>
                ) : (
                  <>
                    <Files className="mr-2 h-4 w-4" />
                    Tümünü İşle
                  </>
                )}
              </Button>
            </div>

            {(result || batchResults) && (result?.area_detected || batchResults) && (
              <div className="space-y-2 border rounded-lg p-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Tespit Eşiği: {threshold}
                  {isReProcessing && <Loader2 className="h-3 w-3 animate-spin" />}
                </Label>
                <Slider
                  value={[threshold]}
                  onValueChange={handleThresholdChange}
                  min={30}
                  max={220}
                  step={5}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Düşük (30)</span>
                  <span>Yüksek (220)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Düşük değer: daha az baloncuk dolu sayılır. Yüksek değer: daha fazla baloncuk dolu sayılır.
                </p>
              </div>
            )}

            {batchResults && batchResults.length > 0 && (
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Toplam Dosya</span>
                  <span className="text-sm font-medium">{batchResults.length}</span>
                </div>
                {batchCsv && (
                  <Button className="w-full" variant="outline" onClick={downloadCsv}>
                    <Download className="mr-2 h-4 w-4" />
                    CSV İndir
                  </Button>
                )}
              </div>
            )}

            {result && (
              <>
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Durum</span>
                    {result.area_detected ? (
                      <Badge className="bg-green-600">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Alan Bulundu
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        Bulunamadı
                      </Badge>
                    )}
                  </div>

                  {result.area_detected && result.bounding_box && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Boyut</span>
                        <span className="text-sm font-medium">{result.bounding_box.w} x {result.bounding_box.h} px</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Konum</span>
                        <span className="text-sm font-medium">X:{result.bounding_box.x} Y:{result.bounding_box.y}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Oran</span>
                        <span className="text-sm font-medium">%{(result.area_ratio! * 100).toFixed(1)}</span>
                      </div>
                      {result.crop_width && result.crop_height && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Kırpılan</span>
                          <span className="text-sm font-medium">{result.crop_width} x {result.crop_height} px</span>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Eğiklik</span>
                    <span className={`text-sm font-medium flex items-center ${Math.abs(result.skew_angle) > 1 ? "text-amber-500" : "text-green-600"}`}>
                      <RotateCw className="mr-1 h-3 w-3" />
                      {result.skew_angle}°
                    </span>
                  </div>

                  {result.bubbles && result.bubbles.detected && (
                    <>
                      <div className="border-t my-1" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Grid</span>
                        <span className="text-sm font-medium">{result.bubbles.grid_rows} satır x {result.bubbles.options_per_question} şık</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Baloncuklar</span>
                        <span className="text-sm font-medium">{result.bubbles.total}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          <CircleDot className="inline h-3 w-3 mr-1 text-green-600" />
                          Dolu
                        </span>
                        <span className="text-sm font-medium text-green-600">{result.bubbles.filled}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          <Circle className="inline h-3 w-3 mr-1 text-red-500" />
                          Boş
                        </span>
                        <span className="text-sm font-medium text-red-500">{result.bubbles.empty}</span>
                      </div>
                      {result.bubbles.missing > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Eksik</span>
                          <span className="text-sm font-medium text-amber-500">{result.bubbles.missing}</span>
                        </div>
                      )}
                      {result.bubbles.rejected > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Elenen</span>
                          <span className="text-sm font-medium text-muted-foreground">{result.bubbles.rejected}</span>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">QR Kod</span>
                    {result.qr_data ? (
                      <Badge variant="secondary" className="text-xs font-mono">
                        <QrCode className="mr-1 h-3 w-3" />
                        {result.qr_data}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        <XCircle className="mr-1 h-3 w-3" />
                        Okunamadı
                      </Badge>
                    )}
                  </div>
                </div>

                <Button className="w-full" onClick={handleSaveResults}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Sonuçları Kaydet
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Önizleme</CardTitle>
            <CardDescription>
              {result
                ? result.area_detected
                  ? batchResults ? `${batchResults.length} dosya işlendi — Cevaplar sekmesini açın` : "Yeşil çizgi ile tespit edilen cevap alanı"
                  : "Alan tespit edilemedi"
                : batchResults
                  ? `${batchResults.length} dosya işlendi — Cevaplar sekmesini açın`
                  : "Görsel yükleyip alan tespiti yapın"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result && !imagePreviewUrl && (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <ImageIcon className="h-10 w-10 mb-3 opacity-40" />
                <p>Görsel yükleyip "Alanı Tespit Et" butonuna tıklayın.</p>
              </div>
            )}

            {!result && imagePreviewUrl && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <ImageIcon className="h-10 w-10 mb-3 opacity-40" />
                <p>Görsel yüklendi. Tespit için butona tıklayın.</p>
              </div>
            )}

            {result && !result.area_detected && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Alan Tespit Edilemedi</AlertTitle>
                <AlertDescription>
                  {result.error || "Siyah kenarlıklı cevap alanı bulunamadı. Görselin düzgün yüklendiğinden ve cevap alanının görünür olduğundan emin olun."}
                  {result.processed_path && (
                    <p className="mt-2 text-xs opacity-70">
                      Hatalı görsel kaydedildi: {result.processed_path}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {result && result.preview_base64 && (
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={activeTab === "preview" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab("preview")}
                  >
                    <Crop className="mr-1 h-4 w-4" />
                    Tespit
                  </Button>
                  {result.cropped_base64 && (
                    <Button
                      variant={activeTab === "cropped" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveTab("cropped")}
                    >
                      <ImageIcon className="mr-1 h-4 w-4" />
                      Kırpılmış
                    </Button>
                  )}
                  {result.bubble_overlay_base64 && (
                    <Button
                      variant={activeTab === "bubbles" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveTab("bubbles")}
                    >
                      <CircleDot className="mr-1 h-4 w-4" />
                      Baloncuklar
                    </Button>
                  )}
                  {result.bubble_binary_base64 && (
                    <Button
                      variant={activeTab === "binary" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveTab("binary")}
                    >
                      <CircleDot className="mr-1 h-4 w-4" />
                      Binarize
                    </Button>
                  )}
                  {result.bubbles?.questions && result.bubbles.questions.length > 0 && !batchResults && (
                    <Button
                      variant={activeTab === "answers" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveTab("answers")}
                    >
                      <ListChecks className="mr-1 h-4 w-4" />
                      Cevaplar
                    </Button>
                  )}
                  {batchResults && batchResults.length > 0 && (
                    <Button
                      variant={activeTab === "answers" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveTab("answers")}
                    >
                      <ListChecks className="mr-1 h-4 w-4" />
                      Cevaplar ({batchResults.length})
                    </Button>
                  )}
                </div>

                <div className="rounded-md overflow-hidden border bg-black/5">
                  {activeTab === "preview" && (
                    <img
                      src={`data:image/jpeg;base64,${result.preview_base64}`}
                      alt="Tespit edilen alan"
                      className="w-full h-auto object-contain max-h-[600px]"
                    />
                  )}
                  {activeTab === "cropped" && result.cropped_base64 && (
                    <img
                      src={`data:image/jpeg;base64,${result.cropped_base64}`}
                      alt="Kırpılmış cevap alanı"
                      className="w-full h-auto object-contain max-h-[600px]"
                    />
                  )}
                  {activeTab === "bubbles" && result.bubble_overlay_base64 && (
                    <img
                      src={`data:image/jpeg;base64,${result.bubble_overlay_base64}`}
                      alt="Baloncuk tespiti"
                      className="w-full h-auto object-contain max-h-[600px]"
                    />
                  )}
                  {activeTab === "binary" && result.bubble_binary_base64 && (
                    <img
                      src={`data:image/jpeg;base64,${result.bubble_binary_base64}`}
                      alt="Binarize görüntü"
                      className="w-full h-auto object-contain max-h-[600px]"
                    />
                  )}
                  {activeTab === "answers" && (batchResults?.length ? (
                    <div className="max-h-[600px] overflow-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b bg-muted/50 sticky top-0">
                            <th className="text-left px-2 py-2 font-medium">Dosya</th>
                            <th className="text-left px-2 py-2 font-medium">QR</th>
                            <th className="text-left px-2 py-2 font-medium">Soru</th>
                            <th className="text-left px-2 py-2 font-medium">Cevap</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batchResults.map((br, fi) => {
                            const qs = br.bubbles?.questions ?? [];
                            return qs.length > 0 ? qs.map((q) => (
                              <tr key={`${fi}-${q.no}`} className="border-b hover:bg-muted/30">
                                <td className="px-2 py-1 text-xs text-muted-foreground max-w-[120px] truncate">
                                  {br.file_name?.substring(0, 25) || `#${fi + 1}`}
                                </td>
                                <td className="px-2 py-1 text-xs font-mono text-muted-foreground">{br.qr_data || "-"}</td>
                                <td className="px-2 py-1">{q.no}</td>
                                <td className="px-2 py-1">
                                  {q.answer ? (
                                    <span className="font-mono font-bold text-green-600 text-sm">{q.answer}</span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                              </tr>
                            )) : (
                              <tr key={fi} className="border-b hover:bg-muted/30">
                                <td className="px-2 py-1 text-xs text-muted-foreground">{br.file_name}</td>
                                <td className="px-2 py-1 text-xs text-muted-foreground">{br.qr_data || "-"}</td>
                                <td colSpan={2} className="px-2 py-1 text-muted-foreground text-xs">Soru bulunamadı</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : result.bubbles?.questions ? (
                    <div className="max-h-[600px] overflow-auto">
                      <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground">
                        <span>QR: {result.qr_data || "-"}</span>
                        <span>{result.file_name}</span>
                      </div>
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b bg-muted/50 sticky top-0">
                            <th className="text-left px-3 py-2 font-medium w-20">Soru No</th>
                            <th className="text-left px-3 py-2 font-medium">Cevap</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.bubbles.questions.map((q) => (
                            <tr key={q.no} className="border-b hover:bg-muted/30">
                              <td className="px-3 py-1.5 text-muted-foreground">{q.no}</td>
                              <td className="px-3 py-1.5">
                                {q.answer ? (
                                  <span className="font-mono font-bold text-green-600 text-base">{q.answer}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}

            {result && (
              <Alert variant={result.qr_data ? "default" : "destructive"} className={result.qr_data ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : ""}>
                {result.qr_data ? (
                  <>
                    <QrCode className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-700 dark:text-blue-400">
                      Karekod Okundu
                    </AlertTitle>
                    <AlertDescription className="text-blue-600 dark:text-blue-500">
                      <span className="text-lg font-mono font-bold tracking-wider block mt-1">
                        {result.qr_data}
                      </span>
                      <span className="text-xs mt-1 block opacity-70">
                        Bu karekod, öğrenci/sınav bilgilerini içerir. İlerleyen aşamada cevap alanları ile eşlenecek.
                      </span>
                    </AlertDescription>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Karekod Okunamadı</AlertTitle>
                    <AlertDescription>
                      Görselde karekod tespit edilemedi. Karekodsuz sayfalar manuel olarak eşlenebilir.
                    </AlertDescription>
                  </>
                )}
              </Alert>
            )}

            {result && result.area_detected && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-700 dark:text-green-400">Alan Başarıyla Tespit Edildi</AlertTitle>
                <AlertDescription className="text-green-600 dark:text-green-500">
                  Siyah kenarlıklı cevap alanı bulundu
                  {result.skew_angle !== 0 && ` ve ${result.skew_angle}° eğiklik düzeltildi`}.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
