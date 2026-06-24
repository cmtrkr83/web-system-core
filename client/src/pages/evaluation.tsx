import { useCallback, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BookOpen,
  AlertCircle,
  Download,
} from "lucide-react";

type AnswerChar = "A" | "B" | "C" | "D" | "E" | "";

interface StudentRow {
  dosya: string;
  qr: string;
  toplamSoru: number;
  cevaplanan: number;
  cevaplar: AnswerChar[];
  kitapcikTuru: string;
}

interface AnswerKeyEntry {
  kitapcikTuru: string;
  cevaplar: AnswerChar[];
}

type SoruSonuc = "dogru" | "yanlis" | "bos";

interface KarsilastirmaSonuc {
  satir: number;
  dosya: string;
  qr: string;
  kitapcikTuru: string;
  dogru: number;
  yanlis: number;
  bos: number;
  soruSonuclari: SoruSonuc[];
}

type CikarmaYontemi = "tum" | "ilk_n" | "son_n" | "ayirici";

function parseCsvLine(line: string): string[] {
  const row: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  row.push(current.trim());
  return row;
}

function parseCsv(text: string): string[][] {
  return text.split(/\r?\n/).filter((l) => l.length > 0).map(parseCsvLine);
}

const answerOptions: AnswerChar[] = ["A", "B", "C", "D", "E"];

export default function Evaluation() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [numQuestions, setNumQuestions] = useState(0);

  const [cikarmaYontemi, setCikarmaYontemi] = useState<CikarmaYontemi>("tum");
  const [cikarmaParam, setCikarmaParam] = useState("1");
  const [cikarmaAyirici, setCikarmaAyirici] = useState("-");

  const [kitapcikTurleri, setKitapcikTurleri] = useState<string[]>([]);
  const [answerKeys, setAnswerKeys] = useState<AnswerKeyEntry[]>([]);

  const [sonuclar, setSonuclar] = useState<KarsilastirmaSonuc[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState({ current: 0, total: 0, phase: "" as "" | "okunuyor" | "ayristiriliyor" });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Geçersiz dosya", description: "Lütfen CSV dosyası seçin.", variant: "destructive" });
      return;
    }
    setCsvFile(file);
    setStudents([]);
    setNumQuestions(0);
    setKitapcikTurleri([]);
    setAnswerKeys([]);
    setSonuclar(null);
    setParsingProgress({ current: 0, total: 0, phase: "" });
  };

  const handleParseCsv = useCallback(async () => {
    if (!csvFile) return;
    setParsing(true);
    setParsingProgress({ current: 0, total: 0, phase: "okunuyor" });

    try {
      const text = await csvFile.text();
      // BOM temizle
      const cleanText = text.replace(/^\uFEFF/, "");
      const rawRows = parseCsv(cleanText);

      if (rawRows.length < 2) {
        toast({ title: "CSV hatası", description: "En az bir başlık ve bir veri satırı gerekli.", variant: "destructive" });
        setParsing(false);
        return;
      }

      const header = rawRows[0];
      const idxDosya = header.findIndex((h) => h === "Dosya");
      const idxQr = header.findIndex((h) => h === "QR");
      const idxToplam = header.findIndex((h) => h === "Toplam Soru");
      const idxCevaplanan = header.findIndex((h) => h === "Cevaplanan");

      const idxQuestions: number[] = [];
      for (let i = 0; i < header.length; i++) {
        if (/^Soru\s+\d+$/i.test(header[i])) {
          idxQuestions.push(i);
        }
      }

      if (idxDosya === -1 || idxQuestions.length === 0) {
        toast({ title: "CSV formatı hatalı", description: "'Dosya' ve 'Soru N' sütunları bulunamadı.", variant: "destructive" });
        setParsing(false);
        return;
      }

      const dataRows = rawRows.slice(1);
      const total = dataRows.length;
      const chunkSize = 1000;
      const parsed: StudentRow[] = [];

      setParsingProgress({ current: 0, total, phase: "ayristiriliyor" });

      for (let start = 0; start < total; start += chunkSize) {
        const end = Math.min(start + chunkSize, total);
        const chunk = dataRows.slice(start, end);
        for (const row of chunk) {
          const cevaplar: AnswerChar[] = idxQuestions.map((qi) => {
            const val = (row[qi] || "").trim().toUpperCase();
            return answerOptions.includes(val as AnswerChar) ? (val as AnswerChar) : "";
          });
          parsed.push({
            dosya: row[idxDosya] || "",
            qr: idxQr !== -1 ? (row[idxQr] || "") : "",
            toplamSoru: idxToplam !== -1 ? parseInt(row[idxToplam]) || 0 : idxQuestions.length,
            cevaplanan: idxCevaplanan !== -1 ? parseInt(row[idxCevaplanan]) || 0 : cevaplar.filter((c) => c !== "").length,
            cevaplar,
            kitapcikTuru: "",
          });
        }
        setParsingProgress({ current: end, total, phase: "ayristiriliyor" });
        // Her chunk sonrası UI'ya nefes aldır
        await new Promise((r) => setTimeout(r, 0));
      }

      if (parsed.length === 0) {
        toast({ title: "Veri bulunamadı", description: "CSV'de öğrenci satırı yok.", variant: "destructive" });
        setParsing(false);
        return;
      }

      const qCounts = parsed.map((s) => s.toplamSoru).filter((n) => n > 0);
      const detectedQ = qCounts.length > 0
        ? qCounts.sort((a, b) => a - b)[Math.floor(qCounts.length / 2)]
        : idxQuestions.length;

      setStudents(parsed);
      setNumQuestions(detectedQ);
      setSonuclar(null);

      extractKitapcikTurleri(parsed, "tum", "", "");

      toast({ title: `${parsed.length} öğrenci yüklendi`, description: `${detectedQ} soru tespit edildi.` });
    } catch (err) {
      toast({ title: "CSV ayrıştırma hatası", description: String(err), variant: "destructive" });
    }
    setParsing(false);
  }, [csvFile, toast]);

  const extractKitapcikTurleri = useCallback(
    (rows: StudentRow[], yontem: CikarmaYontemi, param: string, ayirici: string): string[] => {
      const turler = rows.map((s) => {
        const qr = s.qr;
        if (!qr) return "(QR yok)";
        switch (yontem) {
          case "tum":
            return qr;
          case "ilk_n": {
            const n = parseInt(param) || 1;
            return qr.slice(0, n);
          }
          case "son_n": {
            const n = parseInt(param) || 1;
            return qr.slice(-n);
          }
          case "ayirici": {
            const sep = ayirici || "-";
            const idx = (parseInt(param) || 0);
            const parts = qr.split(sep);
            return parts[idx] || qr;
          }
          default:
            return qr;
        }
      });

      const updated = rows.map((s, i) => ({ ...s, kitapcikTuru: turler[i] }));
      setStudents(updated);

      const unique = Array.from(new Set(turler)).sort();
      setKitapcikTurleri(unique);

      // Create answer key entries
      setAnswerKeys(
        unique.map((t) => ({
          kitapcikTuru: t,
          cevaplar: Array(updated[0]?.cevaplar.length ?? 0).fill(""),
        }))
      );

      return unique;
    },
    []
  );

  const handleApplyExtraction = useCallback(() => {
    if (students.length === 0) return;
    extractKitapcikTurleri(students, cikarmaYontemi, cikarmaParam, cikarmaAyirici);
    setSonuclar(null);
  }, [students, cikarmaYontemi, cikarmaParam, cikarmaAyirici, extractKitapcikTurleri]);

  const updateAnswerKey = (kitapcikIdx: number, soruIdx: number, value: AnswerChar) => {
    setAnswerKeys((prev) => {
      const next = prev.map((k) => ({ ...k, cevaplar: [...k.cevaplar] }));
      next[kitapcikIdx].cevaplar[soruIdx] = value;
      return next;
    });
  };

  const handleCompare = useCallback(() => {
    if (students.length === 0 || answerKeys.length === 0) {
      toast({ title: "Veri eksik", description: "Öğrenci cevapları ve cevap anahtarı gerekli.", variant: "destructive" });
      return;
    }

    const keyMap = new Map(answerKeys.map((k) => [k.kitapcikTuru, k.cevaplar]));
    const results: KarsilastirmaSonuc[] = students.map((s, si) => {
      const key = keyMap.get(s.kitapcikTuru);
      const soruSonuclari: SoruSonuc[] = s.cevaplar.map((c, qi) => {
        if (c === "") return "bos";
        if (key && key[qi] === c) return "dogru";
        return "yanlis";
      });
      const dogru = soruSonuclari.filter((r) => r === "dogru").length;
      const yanlis = soruSonuclari.filter((r) => r === "yanlis").length;
      const bos = soruSonuclari.filter((r) => r === "bos").length;
      return { satir: si + 1, dosya: s.dosya, qr: s.qr, kitapcikTuru: s.kitapcikTuru, dogru, yanlis, bos, soruSonuclari };
    });

    setSonuclar(results);
    toast({ title: "Karşılaştırma tamam", description: `${results.length} öğrenci değerlendirildi.` });
  }, [students, answerKeys, toast]);

  const sonucToCsv = useCallback(() => {
    if (!sonuclar || sonuclar.length === 0) return;
    const header = ["#", "Dosya", "QR", "Kitapçık Türü", "Doğru", "Yanlış", "Boş",
      ...Array.from({ length: numQuestions }, (_, i) => `Soru ${i + 1}`)];
    const rows = sonuclar.map((s) => [
      String(s.satir), s.dosya, s.qr, s.kitapcikTuru,
      String(s.dogru), String(s.yanlis), String(s.bos),
      ...s.soruSonuclari.map((r) => r === "dogru" ? "✓" : r === "yanlis" ? "✗" : "—"),
    ]);
    const csv = "\uFEFF" + [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "degerlendirme-sonuc.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [sonuclar, numQuestions]);

  return (
    <div className="p-6 space-y-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Değerlendirme</h1>
          <p className="text-muted-foreground mt-1">
            Optik okuma CSV dosyasını yükleyin, cevap anahtarlarını girin, sonuçları karşılaştırın.
          </p>
        </div>
      </div>

      <Separator />

      {/* 1. CSV Yükleme */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            1. CSV Dosyası Yükle
          </CardTitle>
          <CardDescription>
            Optik Okuma sayfasından indirdiğiniz CSV dosyasını seçin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="max-w-sm"
            />
            <Button onClick={handleParseCsv} disabled={!csvFile || parsing}>
              {parsing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
              {parsing ? "Ayrıştırılıyor..." : "Yükle & Ayrıştır"}
            </Button>
          </div>
          {parsing && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {parsingProgress.phase === "okunuyor" ? "Dosya okunuyor..." : "Satırlar ayrıştırılıyor..."}
                </span>
                {parsingProgress.total > 0 ? (
                  <span className="font-medium">{parsingProgress.current} / {parsingProgress.total} satır</span>
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
              </div>
              <Progress
                value={parsingProgress.total > 0 ? (parsingProgress.current / parsingProgress.total) * 100 : 0}
              />
            </div>
          )}
          {csvFile && !parsing && (
            <p className="text-sm text-muted-foreground">
              Seçilen dosya: <strong>{csvFile.name}</strong> ({(csvFile.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. Öğrenci Cevapları */}
      {students.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              2. Öğrenci Cevapları ({students.length} öğrenci, {numQuestions} soru)
            </CardTitle>
            <CardDescription>
              Kitapçık türü çıkarma yöntemini belirleyip <strong>Uygula</strong>'ya tıklayın.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Çıkarma Yöntemi</Label>
                <Select value={cikarmaYontemi} onValueChange={(v) => setCikarmaYontemi(v as CikarmaYontemi)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tum">QR'ın Tamamı</SelectItem>
                    <SelectItem value="ilk_n">İlk N Karakter</SelectItem>
                    <SelectItem value="son_n">Son N Karakter</SelectItem>
                    <SelectItem value="ayirici">Ayırıcı ile Böl</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(cikarmaYontemi === "ilk_n" || cikarmaYontemi === "son_n") && (
                <div className="space-y-1.5">
                  <Label>N (karakter sayısı)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={cikarmaParam}
                    onChange={(e) => setCikarmaParam(e.target.value)}
                    className="w-20"
                  />
                </div>
              )}

              {cikarmaYontemi === "ayirici" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Ayırıcı</Label>
                    <Input
                      value={cikarmaAyirici}
                      onChange={(e) => setCikarmaAyirici(e.target.value)}
                      className="w-20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>İndeks (0'dan başlar)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      value={cikarmaParam}
                      onChange={(e) => setCikarmaParam(e.target.value)}
                      className="w-20"
                    />
                  </div>
                </>
              )}

              <Button onClick={handleApplyExtraction}>Uygula</Button>
            </div>

            {/* Öğrenci tablosu (ilk 10 satır) */}
            <div className="border rounded-md overflow-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Dosya</TableHead>
                    <TableHead>QR</TableHead>
                    <TableHead>Kitapçık Türü</TableHead>
                    {Array.from({ length: Math.min(numQuestions, 5) }, (_, i) => (
                      <TableHead key={i} className="text-center w-12">S.{i + 1}</TableHead>
                    ))}
                    {numQuestions > 5 && <TableHead className="text-center">...</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.slice(0, 10).map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="max-w-40 truncate" title={s.dosya}>{s.dosya}</TableCell>
                      <TableCell className="max-w-40 truncate" title={s.qr}>{s.qr}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.kitapcikTuru || "—"}</Badge>
                      </TableCell>
                      {s.cevaplar.slice(0, 5).map((c, qi) => (
                        <TableCell key={qi} className="text-center font-mono">{c || "—"}</TableCell>
                      ))}
                      {numQuestions > 5 && <TableCell className="text-center text-muted-foreground">...</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {students.length > 10 && (
              <p className="text-xs text-muted-foreground">İlk 10 satır gösteriliyor ({students.length} öğrenci).</p>
            )}

            {kitapcikTurleri.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium">Tespit edilen kitapçık türleri:</span>
                {kitapcikTurleri.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3. Cevap Anahtarları */}
      {kitapcikTurleri.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              3. Cevap Anahtarları
            </CardTitle>
            <CardDescription>
              Her kitapçık türü için doğru cevapları girin ({numQuestions} soru).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {kitapcikTurleri.map((tur, ki) => (
              <div key={tur}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  Kitapçık Türü: <Badge>{tur}</Badge>
                </h3>
                <div className="border rounded-md overflow-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16 text-center">Soru</TableHead>
                        {answerKeys[ki]?.cevaplar.map((_, si) => (
                          <TableHead key={si} className="text-center w-14">Soru {si + 1}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-center font-medium text-muted-foreground">Cevap</TableCell>
                        {answerKeys[ki]?.cevaplar.map((_, si) => (
                          <TableCell key={si} className="text-center p-1">
                            <Select
                              value={answerKeys[ki]?.cevaplar[si] || "__"}
                              onValueChange={(v) => updateAnswerKey(ki, si, v === "__" ? "" : v as AnswerChar)}
                            >
                              <SelectTrigger className="h-9 w-14 mx-auto">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__">—</SelectItem>
                                {answerOptions.map((opt) => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}

            <Button onClick={handleCompare} size="lg" className="w-full">
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Karşılaştır
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 4. Sonuçlar */}
      {sonuclar && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              4. Karşılaştırma Sonuçları
            </CardTitle>
            <CardDescription>
              {sonuclar.length} öğrenci değerlendirildi. Ortalama doğru: {(sonuclar.reduce((s, r) => s + r.dogru, 0) / sonuclar.length).toFixed(1)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Dosya</TableHead>
                    <TableHead>Kitapçık</TableHead>
                    <TableHead className="text-center text-green-600">Doğru</TableHead>
                    <TableHead className="text-center text-red-600">Yanlış</TableHead>
                    <TableHead className="text-center text-muted-foreground">Boş</TableHead>
                    {Array.from({ length: Math.min(numQuestions, 8) }, (_, i) => (
                      <TableHead key={i} className="text-center w-10">S.{i + 1}</TableHead>
                    ))}
                    {numQuestions > 8 && <TableHead className="text-center">...</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sonuclar.map((s) => (
                    <TableRow key={s.satir}>
                      <TableCell className="text-muted-foreground">{s.satir}</TableCell>
                      <TableCell className="max-w-32 truncate" title={s.dosya}>{s.dosya}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{s.kitapcikTuru}</Badge></TableCell>
                      <TableCell className="text-center font-medium text-green-600">{s.dogru}</TableCell>
                      <TableCell className="text-center font-medium text-red-600">{s.yanlis}</TableCell>
                      <TableCell className="text-center font-medium text-muted-foreground">{s.bos}</TableCell>
                      {s.soruSonuclari.slice(0, 8).map((r, qi) => (
                        <TableCell key={qi} className="text-center">
                          {r === "dogru" ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 inline" />
                          ) : r === "yanlis" ? (
                            <XCircle className="w-4 h-4 text-red-500 inline" />
                          ) : (
                            <HelpCircle className="w-4 h-4 text-muted-foreground/50 inline" />
                          )}
                        </TableCell>
                      ))}
                      {numQuestions > 8 && <TableCell className="text-center text-muted-foreground">...</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* İstatistik */}
            <div className="flex flex-wrap gap-4">
              <div className="bg-muted rounded-lg p-3 flex-1 min-w-[120px]">
                <p className="text-xs text-muted-foreground">Toplam Öğrenci</p>
                <p className="text-2xl font-bold">{sonuclar.length}</p>
              </div>
              <div className="bg-muted rounded-lg p-3 flex-1 min-w-[120px]">
                <p className="text-xs text-muted-foreground">Ortalama Doğru</p>
                <p className="text-2xl font-bold text-green-600">
                  {(sonuclar.reduce((s, r) => s + r.dogru, 0) / sonuclar.length).toFixed(1)}
                </p>
              </div>
              <div className="bg-muted rounded-lg p-3 flex-1 min-w-[120px]">
                <p className="text-xs text-muted-foreground">Ortalama Yanlış</p>
                <p className="text-2xl font-bold text-red-600">
                  {(sonuclar.reduce((s, r) => s + r.yanlis, 0) / sonuclar.length).toFixed(1)}
                </p>
              </div>
              <div className="bg-muted rounded-lg p-3 flex-1 min-w-[120px]">
                <p className="text-xs text-muted-foreground">Ortalama Boş</p>
                <p className="text-2xl font-bold text-muted-foreground">
                  {(sonuclar.reduce((s, r) => s + r.bos, 0) / sonuclar.length).toFixed(1)}
                </p>
              </div>
              <div className="bg-muted rounded-lg p-3 flex-1 min-w-[120px]">
                <p className="text-xs text-muted-foreground">Toplam Doğru</p>
                <p className="text-2xl font-bold">{sonuclar.reduce((s, r) => s + r.dogru, 0)}</p>
              </div>
              <div className="bg-muted rounded-lg p-3 flex-1 min-w-[120px]">
                <p className="text-xs text-muted-foreground">Toplam Yanlış</p>
                <p className="text-2xl font-bold">{sonuclar.reduce((s, r) => s + r.yanlis, 0)}</p>
              </div>
            </div>

            <Button variant="outline" onClick={sonucToCsv}>
              <Download className="w-4 h-4 mr-2" />
              CSV Olarak İndir
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
