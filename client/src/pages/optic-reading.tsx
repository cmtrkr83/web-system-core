import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/base/buttons/button";
import { InputBase as Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Chip } from "@/components/base/badges/chip";
import { Select, SelectItem } from "@/components/base/select/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, Download, FileScan, Loader2, Save, Upload, XCircle } from "lucide-react";

import { toast } from "@/components/base/toast/toast";
import { useRegistry } from "@/context/RegistryContext";
import { pdfToJpegFiles } from "@/lib/optic/pdf-renderer";
import { downloadCsv } from "@/lib/optic/csv-export";
import { apiRequest } from "@/lib/queryClient";
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

interface SavedScan {
  id: string;
  createdAt: string;
  fileName: string;
  tcNo: string;
  qr: string;
  registryStudentId: string;
  matchStatus: "matched" | "unmatched";
  confidence: number;
  scoreTotal: number | null;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  answerCount: number;
}

interface AnswerKeyRecord {
  answers: Record<string, string[]>;
  correctPoints: number;
  incorrectPoints: number;
  blankPoints: number;
}

function confidenceColor(c: number): string {
  if (c >= 0.6) return "text-status-lime-text";
  if (c >= 0.3) return "text-status-orange-text";
  return "text-status-rose-text";
}

function classifyField(f: FieldRead): "studentNo" | "booklet" | "examCode" | null {
  if (f.type === "booklet") return "booklet";
  const label = f.label.toLocaleUpperCase("tr-TR");
  if (
    f.id === "field-tc" ||
    label.includes("KİMLİK") ||
    label.includes("ÖĞRENCİ") ||
    label.includes("NUMARA") ||
    label.includes("NUMARASI")
  ) return "studentNo";
  if (label.includes("SINAV")) return "examCode";
  return null;
}

function fieldValue(field: FieldRead): string {
  return field.value;
}

function studentIdentifier(result: ReadResult): string {
  const field = result.fields.find((item) => classifyField(item) === "studentNo");
  return field?.value.trim() || result.qr.trim();
}

function optionLetters(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}

const READ_CHUNK_SIZE = 10;

function csvCell(value: string): string {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export default function OpticReading() {
  const { selectedExamId, students } = useRegistry();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [designs, setDesigns] = useState<OpticFormDesign[]>([]);
  const [designId, setDesignId] = useState<string>("");
  const [manifest, setManifest] = useState<OpticManifest | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [progress, setProgress] = useState<{ phase: "upload" | "read"; done: number; total: number }>({
    phase: "upload",
    done: 0,
    total: 0,
  });
  const [results, setResults] = useState<ReadResult[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [answerKeyDraft, setAnswerKeyDraft] = useState<Record<string, string>>({});
  const [scoreRules, setScoreRules] = useState({ correctPoints: "1", incorrectPoints: "0", blankPoints: "0" });
  const [isLoadingAnswerKey, setIsLoadingAnswerKey] = useState(false);
  const [isSavingAnswerKey, setIsSavingAnswerKey] = useState(false);
  const [savedScans, setSavedScans] = useState<SavedScan[]>([]);
  const [savedScansError, setSavedScansError] = useState("");

  const design = useMemo(() => designs.find((d) => d.id === designId) ?? null, [designs, designId]);

  useEffect(() => {
    fetchFormDesigns().then((list) => {
      setDesigns(list);
      if (list.length > 0) setDesignId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (design) setManifest(design.manifest ?? buildOpticFormManifest(design));
  }, [design]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedExamId || !design) {
      setAnswerKeyDraft({});
      setIsLoadingAnswerKey(false);
      return;
    }

    setIsLoadingAnswerKey(true);
    setAnswerKeyDraft(Object.fromEntries(design.grids.map((grid) => [grid.subject, ""])));
    setScoreRules({ correctPoints: "1", incorrectPoints: "0", blankPoints: "0" });
    const query = new URLSearchParams({
      examId: selectedExamId,
      formDesignId: design.id,
      formVersion: String(design.version ?? 1),
    });
    fetch(`/api/optics/answer-keys?${query}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Cevap anahtarı alınamadı");
        return response.json() as Promise<{ answerKey: AnswerKeyRecord | null }>;
      })
      .then(({ answerKey }) => {
        if (cancelled || !answerKey) return;
        setAnswerKeyDraft(Object.fromEntries(
          design.grids.map((grid) => [
            grid.subject,
            (answerKey.answers[grid.subject] ?? []).join(""),
          ]),
        ));
        setScoreRules({
          correctPoints: String(answerKey.correctPoints),
          incorrectPoints: String(answerKey.incorrectPoints),
          blankPoints: String(answerKey.blankPoints),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Cevap anahtarı yüklenemedi:", error);
        toast.error("Cevap anahtarı alınamadı", {
          description: error instanceof Error ? error.message : "Sunucu hatası",
        });
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAnswerKey(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedExamId, design?.id, design?.version]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedExamId) {
      setSavedScans([]);
      setSavedScansError("");
      return;
    }
    fetch(`/api/optics/scans?examId=${encodeURIComponent(selectedExamId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Kayıtlı optik sonuçları alınamadı");
        return response.json() as Promise<SavedScan[]>;
      })
      .then((scans) => {
        if (!cancelled) {
          setSavedScans(scans);
          setSavedScansError("");
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Kayıtlı optik sonuçları yüklenemedi:", error);
        setSavedScansError(error instanceof Error ? error.message : "Sonuçlar alınamadı");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedExamId]);

  const answerKeyData = useMemo(() => {
    if (!design || design.grids.length === 0) return null;
    const answers: Record<string, string[]> = {};
    for (const grid of design.grids) {
      const value = (answerKeyDraft[grid.subject] ?? "").replace(/\s/g, "").toUpperCase();
      const allowed = new Set(optionLetters(grid.optionCount));
      if (value.length !== grid.questionCount || Array.from(value).some((letter) => !allowed.has(letter))) {
        return null;
      }
      answers[grid.subject] = Array.from(value);
    }
    return answers;
  }, [answerKeyDraft, design]);

  const calculateScore = useCallback((result: ReadResult) => {
    if (!answerKeyData) return null;
    const rules = {
      correct: Number(scoreRules.correctPoints),
      incorrect: Number(scoreRules.incorrectPoints),
      blank: Number(scoreRules.blankPoints),
    };
    if (Object.values(rules).some((value) => !Number.isFinite(value))) return null;

    let correct = 0;
    let incorrect = 0;
    let blank = 0;
    let score = 0;
    for (const grid of result.grids) {
      const key = answerKeyData[grid.subject];
      if (!key) return null;
      for (const answer of grid.answers) {
        const expected = key[answer.no - 1];
        if (!expected) return null;
        if (!answer.answer) {
          blank += 1;
          score += rules.blank;
        } else if (answer.answer.toUpperCase() === expected) {
          correct += 1;
          score += rules.correct;
        } else {
          incorrect += 1;
          score += rules.incorrect;
        }
      }
    }
    return { correct, incorrect, blank, score };
  }, [answerKeyData, scoreRules]);

  const saveAnswerKey = async () => {
    if (!selectedExamId || !design) {
      toast.error("Sınav/form seçilmedi", { description: "Cevap anahtarı için sınav ve optik form seçin." });
      return;
    }
    if (!answerKeyData) {
      toast.error("Cevap anahtarı eksik", {
        description: "Her ders için bütün soruların doğru seçeneğini girin. Örnek: ABCDE...",
      });
      return;
    }
    const correctPoints = Number(scoreRules.correctPoints);
    const incorrectPoints = Number(scoreRules.incorrectPoints);
    const blankPoints = Number(scoreRules.blankPoints);
    if (![correctPoints, incorrectPoints, blankPoints].every(Number.isFinite)) {
      toast.error("Puanlama geçersiz", { description: "Doğru, yanlış ve boş puanlarını kontrol edin." });
      return;
    }

    setIsSavingAnswerKey(true);
    try {
      await apiRequest("PUT", "/api/optics/answer-keys", {
        examId: selectedExamId,
        formDesignId: design.id,
        formVersion: design.version ?? 1,
        answers: answerKeyData,
        correctPoints,
        incorrectPoints,
        blankPoints,
      });
      toast.success("Cevap anahtarı kaydedildi");
    } catch (error) {
      toast.error("Cevap anahtarı kaydedilemedi", {
        description: error instanceof Error ? error.message : "Sunucu hatası",
      });
    } finally {
      setIsSavingAnswerKey(false);
    }
  };

  useEffect(() => {
    setSelectedOverlay(null);
  }, [selected]);

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
        toast.error("PDF hatası", { description: "PDF sayfaları dönüştürülemedi." });
        setIsConvertingPdf(false);
        return;
      }
      setIsConvertingPdf(false);
    }

    if (images.length === 0) {
      toast.error("Geçersiz dosya", { description: "JPEG, PNG veya PDF dosyası seçin." });
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
      toast.error("Form seçilmedi", { description: "Önce bir optik form tasarımı seçin." });
      return;
    }
    if (files.length === 0) {
      toast.error("Dosya seçilmedi", { description: "En az bir görsel seçin." });
      return;
    }

    setIsReading(true);
    setProgress({ phase: "upload", done: 0, total: files.length });
    setResults([]);
    setSelected(null);

    const collected: ReadResult[] = [];
    try {
      const manifest = buildOpticFormManifest(design);
      for (let start = 0; start < files.length; start += READ_CHUNK_SIZE) {
        const chunk = files.slice(start, start + READ_CHUNK_SIZE);
        try {
          const paths: string[] = [];
          for (let i = 0; i < chunk.length; i++) {
            paths.push(await uploadFile(chunk[i]));
            setProgress({ phase: "upload", done: start + i + 1, total: files.length });
          }

          setProgress({ phase: "read", done: start, total: files.length });
          const res = await fetch("/api/optics/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ manifest, files: paths, includeOverlay: false }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || "Okuma başarısız");
          }
          collected.push(...((await res.json()) as ReadResult[]));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Okuma hatası";
          collected.push(
            ...chunk.map((file) => ({
              success: false,
              file_name: file.name,
              image_width: 0,
              image_height: 0,
              qr: "",
              marks_detected: 0,
              fields: [],
              grids: [],
              error: msg,
            })),
          );
        }
        setResults([...collected]);
        setProgress({ phase: "read", done: start + chunk.length, total: files.length });
      }

      const firstOk = collected.findIndex((r) => r.success);
      setSelected(firstOk >= 0 ? firstOk : 0);

      const okCount = collected.filter((r) => r.success).length;
      toast.success(`${okCount}/${collected.length} sayfa okundu`, { description: okCount === collected.length ? "Tüm sayfalar başarıyla okundu." : "Bazı sayfalar okunamadı." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Okuma hatası";
      toast.error("Okuma hatası", { description: msg });
    } finally {
      setIsReading(false);
      setProgress({ phase: "upload", done: 0, total: 0 });
    }
  }, [design, files, uploadFile, toast]);

  const loadOverlay = useCallback(
    async (index: number) => {
      const file = files[index];
      if (!file || !design) return;
      setOverlayLoading(true);
      setSelectedOverlay(null);
      try {
        const filePath = await uploadFile(file);
        const res = await fetch("/api/optics/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifest: buildOpticFormManifest(design),
            files: [filePath],
            includeOverlay: true,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Overlay alınamadı");
        }
        const data = (await res.json()) as ReadResult[];
        setSelectedOverlay(data[0]?.overlay_base64 ?? null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Overlay alınamadı";
        toast.error("Overlay hatası", { description: msg });
      } finally {
        setOverlayLoading(false);
      }
    },
    [design, files, uploadFile, toast],
  );

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
      toast.error("Kaydedilecek sonuç yok");
      return;
    }
    if (!selectedExamId) {
      toast.error("Sınav seçilmedi", { description: "Optik sonuçları kaydetmeden önce bir sınav seçin." });
      return;
    }
    setIsSaving(true);
    let savedOnServer = false;
    try {
      const scans = ok.map((r) => {
        const bookletField = r.fields.find((f) => classifyField(f) === "booklet");
        const identifier = studentIdentifier(r);
        const answersTotal = r.grids.reduce((s, g) => s + g.answers.length, 0);
        const confSum = r.grids.reduce((s, g) => s + g.answers.reduce((a, b) => a + b.confidence, 0), 0);

        const payload = {
          fileName: r.file_name,
          pageCount: 1,
          qrData: r.qr,
          formDesignId: design?.id ?? "",
          formVersion: design?.version ?? 1,
          manifestHash: design?.manifestHash ?? "",
          tcNo: identifier,
          booklet: bookletField?.value ?? "",
          examId: selectedExamId,
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
        return payload;
      });
      const res = await fetch("/api/optics/scans/batch", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scans }),
        });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof responseBody.message === "string" ? responseBody.message : "Optik sonuçları kaydedilemedi");
      }
      const saved = Number(responseBody.count) || 0;
      const skipped = Number(responseBody.skipped) || 0;
      savedOnServer = true;
      const savedResponse = await fetch(`/api/optics/scans?examId=${encodeURIComponent(selectedExamId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!savedResponse.ok) throw new Error("Kayıtlı sonuçlar yenilenemedi");
      setSavedScans((await savedResponse.json()) as SavedScan[]);
      toast.success(`${saved}/${ok.length} kayıt eklendi`, {
        description: `${Number(responseBody.matched) || 0} öğrenci eşleşti; ${skipped} tekrar kayıt atlandı.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kaydetme hatası";
      toast.error(savedOnServer ? "Sonuçlar kaydedildi, ancak liste yenilenemedi" : "Kaydetme hatası", {
        description: msg,
      });
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

    const header = ["Dosya", "QR", "Eşleşen Öğrenci", ...fieldLabels, ...subjects.map((s) => `${s} Cevap`), "Cevaplanan", "Doğru", "Yanlış", "Boş", "Puan"];
    const rows = ok.map((r) => {
      const score = calculateScore(r);
      const match = students.find((student) => student.studentNo === studentIdentifier(r));
      const cells = [
        r.file_name,
        r.qr,
        match?.fullName ?? "",
        ...r.fields.map((f) => fieldValue(f)),
        ...subjects.map((s) => {
          const g = r.grids.find((gr) => gr.subject === s);
          return g ? g.answers.map((a) => a.answer).join(",") : "";
        }),
        String(r.grids.reduce((sum, g) => sum + g.answers.filter((a) => a.answer).length, 0)),
        score ? String(score.correct) : "",
        score ? String(score.incorrect) : "",
        score ? String(score.blank) : "",
        score ? String(score.score) : "",
      ];
      return cells.map(csvCell).join(";");
    });
    downloadCsv("\uFEFF" + [header.map(csvCell).join(";"), ...rows].join("\n"), `optic_okuma_${Date.now()}`);
  };

  const selectedResult = selected !== null ? results[selected] : null;
  const headerResult = results.find((r) => r.success) ?? results[0]!;

  const renderAnswerCell = (fi: number, gi: number, a: AnswerRead, optionCount: number) => (
    <Select
      selectedKey={a.answer || "__"}
      onSelectionChange={(key) => { const v = String(key); updateAnswer(fi, gi, a.no, v === "__" ? "" : v); }}
      size="sm"
      triggerClassName={`w-14 ${a.answer ? confidenceColor(a.confidence) : "text-text-tertiary"}`}
    >
      <SelectItem id="__">—</SelectItem>
      {optionLetters(optionCount).map((l) => (
        <SelectItem key={l} id={l}>
          {l}
        </SelectItem>
      ))}
    </Select>
  );

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-title-1-semibold text-text-primary">Optik Okuma</h1>
        <p className="mt-1 text-body-regular text-text-secondary">
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
              <Select
                selectedKey={designId}
                onSelectionChange={(key) => handleDesignChange(String(key))}
                isDisabled={designs.length === 0}
                placeholder={designs.length === 0 ? "Form bulunamadı" : "Form seçin"}
              >
                {designs.map((d) => (
                  <SelectItem key={d.id} id={d.id}>
                    {d.name} ({d.paperSize})
                  </SelectItem>
                ))}
              </Select>
              {design && (
                <p className="text-xs text-text-tertiary">
                  {design.grids.reduce((s, g) => s + g.questionCount, 0)} soru,{" "}
                  {design.grids.map((g) => g.subject).join(", ")}
                </p>
              )}
            </div>

            {design && (
              <div className="space-y-3 rounded-xl border border-separator-border p-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">Cevap anahtarı ve puanlama</p>
                  <p className="text-xs text-text-tertiary">
                    Seçili sınav ve optik form sürümü için saklanır. Her soru için doğru harfi sırayla girin.
                  </p>
                </div>
                {!selectedExamId && (
                  <p role="alert" className="text-xs text-text-error-primary">Önce sınav seçin.</p>
                )}
                {design.grids.map((grid) => {
                  const allowed = optionLetters(grid.optionCount);
                  const value = answerKeyDraft[grid.subject] ?? "";
                  return (
                    <div key={grid.id} className="space-y-1">
                      <Label htmlFor={`answer-key-${grid.id}`}>
                        {grid.subject} · {value.length}/{grid.questionCount} soru · {allowed.join("/")}
                      </Label>
                      <Input
                        id={`answer-key-${grid.id}`}
                        value={value}
                        placeholder={`${grid.questionCount} cevap (örn. ${allowed.join("")}...)`}
                        onChange={(event) => {
                          const valid = new Set(allowed);
                          const next = Array.from(event.target.value.toUpperCase())
                            .filter((letter) => valid.has(letter))
                            .slice(0, grid.questionCount)
                            .join("");
                          setAnswerKeyDraft((previous) => ({ ...previous, [grid.subject]: next }));
                        }}
                        disabled={!selectedExamId || isLoadingAnswerKey || isSavingAnswerKey}
                      />
                    </div>
                  );
                })}
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["correctPoints", "Doğru"],
                    ["incorrectPoints", "Yanlış"],
                    ["blankPoints", "Boş"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`score-${key}`}>{label} puanı</Label>
                      <Input
                        id={`score-${key}`}
                        type="number"
                        step="any"
                        value={scoreRules[key]}
                        onChange={(event) => setScoreRules((previous) => ({ ...previous, [key]: event.target.value }))}
                        disabled={!selectedExamId || isLoadingAnswerKey || isSavingAnswerKey}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  variant="ghost"
                  onClick={saveAnswerKey}
                  disabled={!selectedExamId || isLoadingAnswerKey || isSavingAnswerKey || !answerKeyData}
                >
                  {isSavingAnswerKey ? "Kaydediliyor..." : "Anahtarı Kaydet"}
                </Button>
              </div>
            )}

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
                <div className="flex items-center gap-2 text-sm text-text-tertiary py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  PDF sayfaları JPEG'e dönüştürülüyor...
                </div>
              )}
              {files.length > 0 && (
                <div className="max-h-24 overflow-y-auto text-xs text-text-tertiary space-y-0.5 border rounded-md p-2">
                  {files.map((f, i) => (
                    <div key={i} className="truncate">
                      {i + 1}. {f.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full" onClick={readAll} disabled={isReading || files.length === 0 || !design} variant="ghost">
              {isReading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progress.total > 0
                    ? `${progress.done}/${progress.total} ${progress.phase === "upload" ? "yükleniyor" : "okunuyor"}`
                    : "Okunuyor..."}
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
                  <span className="text-text-tertiary">Okunan sayfa</span>
                  <span className="font-medium">
                    {results.filter((r) => r.success).length}/{results.length}
                  </span>
                </div>
                <Button className="w-full" variant="ghost" onClick={handleCsv} disabled={!results.some((r) => r.success)} leadingIcon={Download}>
                  
                  CSV İndir
                </Button>
                <Button className="w-full" onClick={handleSave} disabled={isSaving || !results.some((r) => r.success)} variant="ghost">
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
              <div className="flex flex-col items-center justify-center py-16 text-center text-text-tertiary">
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
                        {headerResult.fields.map((f) => (
                          <TableHead key={f.id}>{f.label}</TableHead>
                        ))}
                        {headerResult.grids.map((g) => (
                          <TableHead key={g.subject} className="text-right">
                            {g.subject}
                          </TableHead>
                        ))}
                        <TableHead>Öğrenci</TableHead>
                        <TableHead className="text-right">Puan</TableHead>
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
                            className={`cursor-pointer ${selected === fi ? "bg-background-secondary-default/40" : ""}`}
                            onClick={() => setSelected(fi)}
                          >
                            <TableCell className="text-xs max-w-[140px] truncate">{r.file_name}</TableCell>
                            <TableCell className="text-xs font-mono">{r.qr || "-"}</TableCell>
                            {r.fields.map((f) => (
                              <TableCell key={f.id} className={`text-xs font-mono ${f.value ? "" : "text-text-tertiary"}`}>
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
                            <TableCell className="max-w-[160px] truncate text-xs">
                              {students.find((student) => student.studentNo === studentIdentifier(r))?.fullName ?? "Eşleşmedi"}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {calculateScore(r)?.score ?? "—"}
                            </TableCell>
                            <TableCell className="text-center">
                              {r.success ? (
                                <Chip variant="bold" color="lime">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  OK
                                </Chip>
                              ) : (
                                <Chip variant="bold" color="rose">
                                  <XCircle className="mr-1 h-3 w-3" />
                                  Hata
                                </Chip>
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
                      <div
                        role="alert"
                        className="flex gap-3 rounded-2xl border border-border-error-default/30 bg-notification-error-background/50 p-4"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-notification-error-foreground" />
                        <div className="space-y-1">
                          <p className="text-caption-1-semibold text-text-primary">Sayfa okunamadı</p>
                          <p className="text-caption-1-regular text-text-secondary">
                            {selectedResult.error || "Bilinmeyen hata"} (referans karesi: {selectedResult.marks_detected}/5)
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedResult.success && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          {selectedOverlay ? (
                            <div className="rounded-md overflow-hidden border bg-black/5">
                              <img
                                src={`data:image/jpeg;base64,${selectedOverlay}`}
                                alt={`${selectedResult.file_name} overlay`}
                                className="w-full h-auto object-contain max-h-[420px]"
                              />
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              className="w-full"
                              onClick={() => selected !== null && loadOverlay(selected)}
                              disabled={overlayLoading}
                            >
                              {overlayLoading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <FileScan className="mr-2 h-4 w-4" />
                              )}
                              Overlay'i Göster
                            </Button>
                          )}
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-text-tertiary">Referans karesi</span>
                            <Chip variant="subtle" color={selectedResult.marks_detected >= 4 ? "cyan" : "gray"}>
                              {selectedResult.marks_detected}/5
                            </Chip>
                          </div>
                          {selectedResult.fields.map((f) => (
                            <div key={f.id} className="flex items-center justify-between">
                              <span className="text-text-tertiary">{f.label}</span>
                              <span className="font-mono font-bold text-base">{fieldValue(f)}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between">
                            <span className="text-text-tertiary">QR</span>
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
                                      <span className="block text-[10px] font-normal text-text-tertiary">
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
                                  <TableCell className="text-xs text-text-tertiary">{qno}</TableCell>
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

      {selectedExamId && (
        <Card>
          <CardHeader>
            <CardTitle>Seçili sınavın kayıtlı optik sonuçları</CardTitle>
            <CardDescription>
              Öğrenci eşleşmesi öğrenci ID/T.C. alanı veya QR içeriğiyle yapılır. Eşleşmeyen kayıtlar saklanır ve sonradan incelenebilir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {savedScansError ? (
              <p role="alert" className="text-sm text-text-error-primary">{savedScansError}</p>
            ) : savedScans.length === 0 ? (
              <p className="text-sm text-text-tertiary">Bu sınav için kayıtlı tarama yok.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Dosya</TableHead>
                      <TableHead>Öğrenci</TableHead>
                      <TableHead className="text-right">Doğru</TableHead>
                      <TableHead className="text-right">Yanlış</TableHead>
                      <TableHead className="text-right">Boş</TableHead>
                      <TableHead className="text-right">Puan</TableHead>
                      <TableHead className="text-right">Güven</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savedScans.map((scan) => {
                      const matchedStudent = students.find((student) => student.id === scan.registryStudentId);
                      return (
                        <TableRow key={scan.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {new Date(scan.createdAt).toLocaleString("tr-TR")}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-xs">{scan.fileName}</TableCell>
                          <TableCell className="text-xs">
                            {matchedStudent?.fullName ?? (scan.matchStatus === "matched" ? scan.tcNo : "Eşleşmedi")}
                          </TableCell>
                          <TableCell className="text-right">{scan.correctCount}</TableCell>
                          <TableCell className="text-right">{scan.incorrectCount}</TableCell>
                          <TableCell className="text-right">{scan.blankCount}</TableCell>
                          <TableCell className="text-right">{scan.scoreTotal ?? "—"}</TableCell>
                          <TableCell className="text-right">{Math.round(scan.confidence * 100)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
