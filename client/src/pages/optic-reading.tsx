import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, Download, FileScan, Loader2, Save, Upload, XCircle } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { pdfToJpegFiles } from "@/lib/optic/pdf-renderer";
import { downloadCsv } from "@/lib/optic/csv-export";
import {
  buildOpticFormManifest,
  fetchFormDesigns,
  type OpticFormDesign,
  type OpticManifest,
} from "@/lib/optic-form";

interface FieldRead {
  id: string;
  label: string;
  type: "numeric" | "booklet";
  value: string;
  confidence: number;
}

interface AnswerRead {
  no: number;
  answer: string;
  confidence: number;
}

interface GridRead {
  subject: string;
  questionCount: number;
  answers: AnswerRead[];
}

interface ReadResult {
  success: boolean;
  file_name: string;
  image_width: number;
  image_height: number;
  qr: string;
  marks_detected: number;
  fields: FieldRead[];
  grids: GridRead[];
  overlay_base64?: string;
  error?: string;
}

function confidenceColor(c: number): string {
  if (c >= 0.6) return "text-green-600";
  if (c >= 0.3) return "text-amber-500";
  return "text-red-500";
}

function classifyField(f: FieldRead): "tcNo" | "booklet" | "examId" {
  if (f.type === "booklet") return "booklet";
  const label = f.label.toLocaleUpperCase("tr-TR");
  if (label.includes("KİMLİK") || f.id === "field-tc") return "tcNo";
  return "examId";
}

function fieldValue(field: FieldRead): string {
  return field.value;
}

function optionLetters(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}

export default function OpticReading() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [designs, setDesigns] = useState<OpticFormDesign[]>([]);
  const [designId, setDesignId] = useState<string>("");
  const [manifest, setManifest] = useState<OpticManifest | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ReadResult[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const design = useMemo(() => designs.find((d) => d.id === designId) ?? null, [designs, designId]);

  useEffect(() => {
    fetchFormDesigns().then((list) => {
      setDesigns(list);
      if (list.length > 0) setDesignId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (design) setManifest(buildOpticFormManifest(design));
  }, [design]);

  const handleDesignChange = (value: string) => {
    setDesignId(value);
    setResults([]);
    setSelected(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const images: File[] = [];
    const pdfs: File[] = [];
    for (const file of Array.from(fileList)) {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        pdfs.push(file);
      } else {
        images.push(file);
      }
    }

    if (pdfs.length > 0) {
      setIsConvertingPdf(true);
      try {
        for (const pdf of pdfs) {
          images.push(...(await pdfToJpegFiles(pdf)));
        }
      } catch {
        toast({ title: "PDF hatası", description: "PDF sayfaları dönüştürülemedi.", variant: "destructive" });
        setIsConvertingPdf(false);
        return;
      }
      setIsConvertingPdf(false);
    }

    if (images.length === 0) {
      toast({ title: "Geçersiz dosya", description: "JPEG, PNG veya PDF dosyası seçin.", variant: "destructive" });
      return;
    }

    setFiles(images);
    setResults([]);
    setSelected(null);
    event.target.value = "";
  };

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/optics/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Dosya yükleme başarısız");
    }
    const data = await res.json();
    return data.filePath as string;
  }, []);

  const readAll = useCallback(async () => {
    if (!design) {
      toast({ title: "Form seçilmedi", description: "Önce bir optik form tasarımı seçin.", variant: "destructive" });
      return;
    }
    if (files.length === 0) {
      toast({ title: "Dosya seçilmedi", description: "En az bir görsel seçin.", variant: "destructive" });
      return;
    }

    setIsReading(true);
    setProgress({ done: 0, total: files.length });
    setResults([]);
    setSelected(null);

    try {
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        paths.push(await uploadFile(files[i]));
        setProgress({ done: i + 1, total: files.length });
      }

      const res = await fetch("/api/optics/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest: buildOpticFormManifest(design), files: paths }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Okuma başarısız");
      }
      const data = (await res.json()) as ReadResult[];
      setResults(data);

      const firstOk = data.findIndex((r) => r.success);
      setSelected(firstOk >= 0 ? firstOk : 0);

      const okCount = data.filter((r) => r.success).length;
      toast({
        title: `${okCount}/${data.length} sayfa okundu`,
        description: okCount === data.length ? "Tüm sayfalar başarıyla okundu." : "Bazı sayfalar okunamadı.",
        variant: okCount === data.length ? "default" : "destructive",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Okuma hatası";
      toast({ title: "Okuma hatası", description: msg, variant: "destructive" });
    } finally {
      setIsReading(false);
      setProgress({ done: 0, total: 0 });
    }
  }, [design, files, uploadFile, toast]);

  const updateAnswer = (fi: number, gi: number, no: number, answer: string) => {
    setResults((prev) =>
      prev.map((r, i) =>
        i !== fi
          ? r
          : {
              ...r,
              grids: r.grids.map((g, j) =>
                j !== gi
                  ? g
                  : { ...g, answers: g.answers.map((a) => (a.no === no ? { ...a, answer } : a)) },
              ),
            },
      ),
    );
  };

  const handleSave = async () => {
    const ok = results.filter((r) => r.success);
    if (ok.length === 0) {
      toast({ title: "Kaydedilecek sonuç yok", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    let saved = 0;
    try {
      for (const r of ok) {
        const tcField = r.fields.find((f) => classifyField(f) === "tcNo");
        const bookletField = r.fields.find((f) => classifyField(f) === "booklet");
        const examField = r.fields.find((f) => classifyField(f) === "examId");
        const answersTotal = r.grids.reduce((s, g) => s + g.answers.length, 0);
        const confSum = r.grids.reduce((s, g) => s + g.answers.reduce((a, b) => a + b.confidence, 0), 0);

        const payload = {
          fileName: r.file_name,
          pageCount: 1,
          qrData: r.qr,
          tcNo: tcField?.value ?? "",
          booklet: bookletField?.value ?? "",
          examId: examField?.value ?? "",
          confidence: answersTotal > 0 ? confSum / answersTotal : 0,
          results: r.grids.map((g) => ({
            pageIndex: 0,
            areaId: g.subject,
            subject: g.subject,
            answers: g.answers.map((a) => ({
              questionNumber: a.no,
              answer: a.answer,
              confidence: a.confidence,
              scores: [],
            })),
          })),
        };
        const res = await fetch("/api/optics/scans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) saved++;
      }
      toast({
        title: `${saved}/${ok.length} kayıt kaydedildi`,
        variant: saved === ok.length ? "default" : "destructive",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kaydetme hatası";
      toast({ title: "Kaydetme hatası", description: msg, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCsv = () => {
    if (results.length === 0) return;
    const ok = results.filter((r) => r.success);
    if (ok.length === 0) return;
    const fieldLabels = ok[0].fields.map((f) => f.label);
    const subjects = ok[0].grids.map((g) => g.subject);

    const header = ["Dosya", "QR", ...fieldLabels, ...subjects.map((s) => `${s} Cevap`), "Cevaplanan"];
    const rows = ok.map((r) => {
      const cells = [
        r.file_name,
        r.qr,
        ...r.fields.map((f) => fieldValue(f)),
        ...subjects.map((s) => {
          const g = r.grids.find((gr) => gr.subject === s);
          return g ? g.answers.map((a) => a.answer).join(",") : "";
        }),
        String(r.grids.reduce((sum, g) => sum + g.answers.filter((a) => a.answer).length, 0)),
      ];
      return cells.join(";");
    });
    downloadCsv("\uFEFF" + [header.join(";"), ...rows].join("\n"), `optic_okuma_${Date.now()}`);
  };

  const selectedResult = selected !== null ? results[selected] : null;

  const renderAnswerCell = (fi: number, gi: number, a: AnswerRead, optionCount: number) => (
    <Select
      value={a.answer || "__"}
      onValueChange={(v) => updateAnswer(fi, gi, a.no, v === "__" ? "" : v)}
    >
      <SelectTrigger className={`h-8 w-14 ${a.answer ? confidenceColor(a.confidence) : "text-muted-foreground"}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__">—</SelectItem>
        {optionLetters(optionCount).map((l) => (
          <SelectItem key={l} value={l}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Optik Okuma</h1>
        <p className="text-muted-foreground mt-1">
          JPEG/PNG/PDF yükleyin. Referans kareleriyle kesin baloncuk tespiti; TC, kitapçık, sınav ID ve cevaplar okunur.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Okuma Ayarları</CardTitle>
            <CardDescription>Form tasarımını seç, görselleri yükle, tümünü oku.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Optik Form Tasarımı</Label>
              <Select value={designId} onValueChange={handleDesignChange} disabled={designs.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={designs.length === 0 ? "Form bulunamadı" : "Form seçin"} />
                </SelectTrigger>
                <SelectContent>
                  {designs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.paperSize})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {design && (
                <p className="text-xs text-muted-foreground">
                  {design.grids.reduce((s, g) => s + g.questionCount, 0)} soru,{" "}
                  {design.grids.map((g) => g.subject).join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="file-upload">Görsel Dosyaları (JPEG/PNG/PDF — birden çok)</Label>
              <Input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,.jpg,.jpeg,image/png,.png,application/pdf,.pdf"
                multiple
                onChange={handleFileChange}
              />
              {isConvertingPdf && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  PDF sayfaları JPEG'e dönüştürülüyor...
                </div>
              )}
              {files.length > 0 && (
                <div className="max-h-24 overflow-y-auto text-xs text-muted-foreground space-y-0.5 border rounded-md p-2">
                  {files.map((f, i) => (
                    <div key={i} className="truncate">
                      {i + 1}. {f.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full" onClick={readAll} disabled={isReading || files.length === 0 || !design}>
              {isReading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progress.total > 0 && progress.done > 0 ? `${progress.done}/${progress.total} yüklendi` : "Okunuyor..."}
                </>
              ) : (
                <>
                  <FileScan className="mr-2 h-4 w-4" />
                  Tümünü Oku
                </>
              )}
            </Button>

            {results.length > 0 && (
              <div className="space-y-2 border rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Okunan sayfa</span>
                  <span className="font-medium">
                    {results.filter((r) => r.success).length}/{results.length}
                  </span>
                </div>
                <Button className="w-full" variant="outline" onClick={handleCsv} disabled={!results.some((r) => r.success)}>
                  <Download className="mr-2 h-4 w-4" />
                  CSV İndir
                </Button>
                <Button className="w-full" onClick={handleSave} disabled={isSaving || !results.some((r) => r.success)}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Sonuçları Kaydet
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sonuçlar</CardTitle>
            <CardDescription>
              {results.length > 0
                ? "Satıra tıklayarak overlay ve elle düzeltme görünümünü açın."
                : "Görseller yükleyip \"Tümünü Oku\" butonuna tıklayın."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <Upload className="h-10 w-10 mb-3 opacity-40" />
                <p>Henüz okuma yapılmadı.</p>
              </div>
            ) : (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[140px]">Dosya</TableHead>
                        <TableHead>QR</TableHead>
                        {results[0].fields.map((f) => (
                          <TableHead key={f.id}>{f.label}</TableHead>
                        ))}
                        {results[0].grids.map((g) => (
                          <TableHead key={g.subject} className="text-right">
                            {g.subject}
                          </TableHead>
                        ))}
                        <TableHead className="text-center">Durum</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r, fi) => {
                        const gridQuality = (g: GridRead) => {
                          const answered = g.answers.filter((a) => a.answer);
                          if (answered.length === 0) return 0;
                          return answered.reduce((s, a) => s + a.confidence, 0) / answered.length;
                        };
                        return (
                          <TableRow
                            key={fi}
                            className={`cursor-pointer ${selected === fi ? "bg-muted/40" : ""}`}
                            onClick={() => setSelected(fi)}
                          >
                            <TableCell className="text-xs max-w-[140px] truncate">{r.file_name}</TableCell>
                            <TableCell className="text-xs font-mono">{r.qr || "-"}</TableCell>
                            {r.fields.map((f) => (
                              <TableCell key={f.id} className={`text-xs font-mono ${f.value ? "" : "text-muted-foreground"}`}>
                                {fieldValue(f)}
                              </TableCell>
                            ))}
                            {r.grids.map((g) => (
                              <TableCell key={g.subject} className="text-right">
                                <span className={confidenceColor(gridQuality(g))}>
                                  {g.answers.filter((a) => a.answer).length}/{g.questionCount}
                                </span>
                              </TableCell>
                            ))}
                            <TableCell className="text-center">
                              {r.success ? (
                                <Badge className="bg-green-600">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  OK
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <XCircle className="mr-1 h-3 w-3" />
                                  Hata
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {selectedResult && (
                  <div className="border rounded-lg p-4 space-y-4">
                    {!selectedResult.success && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Sayfa okunamadı</AlertTitle>
                        <AlertDescription>
                          {selectedResult.error || "Bilinmeyen hata"} (referans karesi: {selectedResult.marks_detected}/5)
                        </AlertDescription>
                      </Alert>
                    )}

                    {selectedResult.success && selectedResult.overlay_base64 && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-md overflow-hidden border bg-black/5">
                          <img
                            src={`data:image/jpeg;base64,${selectedResult.overlay_base64}`}
                            alt={`${selectedResult.file_name} overlay`}
                            className="w-full h-auto object-contain max-h-[420px]"
                          />
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Referans karesi</span>
                            <Badge variant={selectedResult.marks_detected >= 4 ? "secondary" : "outline"}>
                              {selectedResult.marks_detected}/5
                            </Badge>
                          </div>
                          {selectedResult.fields.map((f) => (
                            <div key={f.id} className="flex items-center justify-between">
                              <span className="text-muted-foreground">{f.label}</span>
                              <span className="font-mono font-bold text-base">{fieldValue(f)}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">QR</span>
                            <span className="font-mono">{selectedResult.qr || "-"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedResult.success && (
                      <div>
                        <Label className="mb-2 block">Elle Düzeltme</Label>
                        <div className="max-h-[380px] overflow-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">Soru</TableHead>
                                {selectedResult.grids.map((g, gi) => {
                                  const gr = manifest?.grids.find((mg) => mg.subject === g.subject);
                                  return (
                                    <TableHead key={g.subject} className="text-center">
                                      {g.subject}
                                      <span className="block text-[10px] font-normal text-muted-foreground">
                                        (Q{gi + 1})
                                      </span>
                                    </TableHead>
                                  );
                                })}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Array.from(
                                { length: Math.max(...selectedResult.grids.map((g) => g.questionCount), 1) },
                                (_, qi) => qi + 1,
                              ).map((qno) => (
                                <TableRow key={qno}>
                                  <TableCell className="text-xs text-muted-foreground">{qno}</TableCell>
                                  {selectedResult.grids.map((g, gi) => {
                                    const a = g.answers.find((ans) => ans.no === qno);
                                    const gr = manifest?.grids.find((mg) => mg.subject === g.subject);
                                    if (!a) return <TableCell key={g.subject} />;
                                    return (
                                      <TableCell key={g.subject} className="text-center">
                                        {renderAnswerCell(results.indexOf(selectedResult), gi, a, gr?.optionCount ?? 4)}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
