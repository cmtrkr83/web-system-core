import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRegistry, District, School, Student } from "@/context/RegistryContext";
import { useLocation } from "wouter";
import { Plus, BookOpen, Calendar, Clock, Upload, FileSpreadsheet, ChevronRight, ChevronLeft, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import * as XLSX from "xlsx";

interface ColumnMapping {
  district: string;
  schoolName: string;
  schoolCode: string;
  studentFirstName: string;
  studentLastName: string;
  studentNumber: string;
  schoolNumber: string;
  class: string;
  grade: string;
}

const initialColumnMapping: ColumnMapping = {
  district: "",
  schoolName: "",
  schoolCode: "",
  studentFirstName: "",
  studentLastName: "",
  studentNumber: "",
  schoolNumber: "",
  class: "",
  grade: "",
};

const requiredMappingFields: Array<keyof Pick<ColumnMapping, "district" | "schoolName" | "schoolCode" | "studentFirstName" | "studentLastName" | "studentNumber">> = [
  "district",
  "schoolName",
  "schoolCode",
  "studentFirstName",
  "studentLastName",
  "studentNumber",
];

const normalizeHeader = (value: string) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const detectColumnMapping = (columns: string[]): ColumnMapping => {
  const findColumn = (positive: RegExp[], negative: RegExp[] = []) => {
    let bestColumn = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const column of columns) {
      const normalized = normalizeHeader(column);
      let score = 0;

      for (const pattern of positive) {
        if (pattern.test(normalized)) score += 2;
      }

      for (const pattern of negative) {
        if (pattern.test(normalized)) score -= 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestColumn = column;
      }
    }

    return bestScore > 0 ? bestColumn : "";
  };

  return {
    district: findColumn([/\bilce\b/, /district/, /ilce adi/], [/ogrenci|ad soyad|soyad|name|surname/, /okul|kurum|school/, /sinif|sube|class|grade/, /kod|code|numara|no|tc|opaq/]),
    schoolName: findColumn([/kurum adi/, /okul adi/, /school name|school/], [/kod|code/, /ilce|district/, /ogrenci|ad soyad|soyad/]),
    schoolCode: findColumn([/kurum kodu/, /okul kodu/, /school code|code/, /\bkod\b/], [/ogrenci|ad soyad|soyad|name/, /ilce|district/]),
    studentFirstName: findColumn([/ogrenci adi/, /ogrenci isim/, /ad soyad/, /\bname\b/, /\bad\b/], [/\bil\b|ilce|district/, /okul|kurum|school/, /soyad|surname/, /sinif|sube|class|grade/, /kod|code|numara|no|tc|opaq/]),
    studentLastName: findColumn([/ogrenci soyadi/, /\bsoyad\b/, /surname|last name/], [/\bil\b|ilce|district/, /okul|kurum|school/, /sinif|sube|class|grade/, /kod|code|numara|no|tc|opaq/]),
    studentNumber: findColumn([/opaq/, /\btc\b/, /kimlik/, /ogrenci no|numara|\bno\b/], [/okul no|school no/]),
    schoolNumber: findColumn([/okul no|okul numara|school no/, /\bokul\b/, /numara|\bno\b/], [/ogrenci no|opaq|\btc\b/]),
    class: findColumn([/sube|subesi/, /branch/], [/sinif|grade|class/]),
    grade: findColumn([/sinif/, /class|grade/], [/sube|subesi|branch/]),
  };
};

export default function ExamSelection() {
  const { exams, selectExam, createExam, refreshRegistryData, loadExams, selectedExamId } = useRegistry();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Exam creation state
  const [examData, setExamData] = useState({
    name: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });

  // Step-based form state
  const [currentStep, setCurrentStep] = useState(1); // 1: Sınav, 2: Dosya, 3: Mapping
  const [file, setFile] = useState<File | null>(null);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    district: "",
    schoolName: "",
    schoolCode: "",
    studentFirstName: "",
    studentLastName: "",
    studentNumber: "",
    schoolNumber: "",
    class: "",
    grade: ""
  });
  const [mappingComplete, setMappingComplete] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [createdExamId, setCreatedExamId] = useState<string | null>(null);
  const [previousSelectedExamId, setPreviousSelectedExamId] = useState<string | null>(null);
  const [registryUploaded, setRegistryUploaded] = useState(false);
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [stats, setStats] = useState({ districts: 0, schools: 0, students: 0 });
  const [preparedRegistryData, setPreparedRegistryData] = useState<{
    districts: District[];
    schools: School[];
    students: Student[];
  } | null>(null);
  const [excludeSpecialNeeds, setExcludeSpecialNeeds] = useState(true);

  const resetWizard = () => {
    setExamData({
      name: "",
      date: new Date().toISOString().split("T")[0],
      description: "",
    });
    setCurrentStep(1);
    setFile(null);
    setExcelColumns([]);
    setColumnMapping(initialColumnMapping);
    setMappingComplete(false);
    setAnalyzing(false);
    setCreatedExamId(null);
    setPreviousSelectedExamId(null);
    setRegistryUploaded(false);
    setRawData([]);
    setStats({ districts: 0, schools: 0, students: 0 });
    setPreparedRegistryData(null);
    setExcludeSpecialNeeds(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setExamData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && createdExamId && !registryUploaded) {
      void rollbackTemporaryExam(createdExamId, previousSelectedExamId);
    }

    setOpen(nextOpen);

    if (!nextOpen) {
      resetWizard();
    }
  };

  const rollbackTemporaryExam = async (examId: string, restoreExamId: string | null) => {
    try {
      await apiRequest("DELETE", `/api/exams/${examId}`);
      await loadExams();

      if (restoreExamId) {
        await selectExam(restoreExamId);
      }

      await refreshRegistryData();
    } catch (error) {
      console.error("Geçici sınav geri alma hatası:", error);
    }
  };

  const handleCreateExam = async () => {
    if (!examData.name.trim() || !examData.date.trim()) {
      toast({
        title: "Uyarı",
        description: "Sınav adı ve tarihi boş bırakılamaz.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (!previousSelectedExamId) {
        setPreviousSelectedExamId(selectedExamId);
      }

      const newExam = await createExam({
        name: examData.name,
        date: examData.date,
        description: examData.description,
      });

      await selectExam(newExam.id);
      setCreatedExamId(newExam.id);

      toast({
        title: "Başarılı",
        description: `"${newExam.name}" sınavı oluşturuldu. Şimdi kütük dosyasını yükleyin.`,
      });

      setCurrentStep(2);
    } catch (error) {
      console.error("Sınav oluşturma hatası:", error);
      toast({
        title: "Hata",
        description: error instanceof Error ? error.message : "Sınav oluşturulamadı.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setFile(selectedFile);
    setAnalyzing(true);

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target?.result, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

        if (rows.length === 0) {
          throw new Error("Excel dosyası veri içermiyor.");
        }

        const columns = Object.keys(rows[0] || {}).filter((column) => column);
        if (columns.length === 0) {
          throw new Error("Excel dosyasında sütun başlığı bulunamadı.");
        }

        setRawData(rows);
        setExcelColumns(columns);
        setColumnMapping(detectColumnMapping(columns));
        setCurrentStep(3);

        toast({
          title: "Excel Okundu",
          description: `${columns.length} sütun tespit edildi. Eşleştirmeyi kontrol edin.`,
        });
      } catch (error) {
        toast({
          title: "Excel Okunamadı",
          description: error instanceof Error ? error.message : "Dosya işlenemedi.",
          variant: "destructive",
        });
        setFile(null);
      } finally {
        setAnalyzing(false);
      }
    };

    reader.onerror = () => {
      toast({
        title: "Dosya Okuma Hatası",
        description: "Excel dosyası okunamadı.",
        variant: "destructive",
      });
      setAnalyzing(false);
      setFile(null);
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handleMappingChange = (key: keyof ColumnMapping, value: string) => {
    setColumnMapping((prev) => ({ ...prev, [key]: value }));
  };

  const EXCLUDED_SCHOOL_KEYWORDS = ["uygulama", "kademe"];
  const EXCLUDED_BRANCH_KEYWORDS = ["hafif", "ağır", "zihinsel", "işitme"];

  const isExcludedSchool = (schoolName: string) => {
    const normalized = schoolName.toLowerCase();
    return EXCLUDED_SCHOOL_KEYWORDS.some((kw) => normalized.includes(kw));
  };

  const isExcludedBranch = (branchName: string) => {
    const normalized = branchName.toLowerCase();
    return EXCLUDED_BRANCH_KEYWORDS.some((kw) => normalized.includes(kw));
  };

  const handlePrepareRegistryUpload = () => {
    const missingFields = requiredMappingFields.filter((field) => !columnMapping[field]);

    if (missingFields.length > 0) {
      toast({
        title: "Eksik Eşleştirme",
        description: "Lütfen zorunlu sütunları eşleştirin.",
        variant: "destructive",
      });
      return;
    }

    setMappingComplete(true);
    setCurrentStep(4);
  };

  const handleApplyFiltersAndProceed = () => {
    const districtSet = new Set<string>();
    const schoolMap = new Map<string, { name: string; district: string }>();
    const students: Student[] = [];

    rawData.forEach((row, index) => {
      const district = String(row[columnMapping.district] || "").trim();
      const schoolName = String(row[columnMapping.schoolName] || "").trim();
      const schoolCode = String(row[columnMapping.schoolCode] || `school-${index}`).trim();
      const studentFirstName = String(row[columnMapping.studentFirstName] || "").trim();
      const studentLastName = String(row[columnMapping.studentLastName] || "").trim();
      const studentName = `${studentFirstName} ${studentLastName}`.trim();
      const studentId = String(row[columnMapping.studentNumber] || `student-${index}`).trim();
      const schoolNo = columnMapping.schoolNumber ? String(row[columnMapping.schoolNumber] || "").trim() : "";
      const classInfo = columnMapping.class ? String(row[columnMapping.class] || "").trim() : "";
      const gradeInfo = columnMapping.grade ? String(row[columnMapping.grade] || "").trim() : "";

      if (excludeSpecialNeeds && isExcludedSchool(schoolName)) return;
      if (excludeSpecialNeeds && isExcludedBranch(classInfo)) return;

      if (district) districtSet.add(district);
      if (schoolName && schoolCode) schoolMap.set(schoolCode, { name: schoolName, district });

      if (studentName && studentId) {
        students.push({
          id: `st-${studentId}`,
          name: studentName,
          tc: studentId,
          schoolId: schoolCode,
          salon: gradeInfo,
          class: classInfo,
          schoolNo,
        });
      }
    });

    const districts: District[] = Array.from(districtSet).map((name, index) => ({
      id: `d${index + 1}`,
      name,
    }));

    const schools: School[] = Array.from(schoolMap.entries()).map(([code, info]) => {
      const district = districts.find((item) => item.name === info.district);
      return { id: code, name: info.name, districtId: district?.id || "d1", code };
    });

    setStats({ districts: districts.length, schools: schools.length, students: students.length });
    setPreparedRegistryData({ districts, schools, students });
    setCurrentStep(5);
  };

  const handleFinalizeRegistryUpload = async () => {
    if (!createdExamId || !preparedRegistryData || !file) {
      toast({
        title: "Eksik Bilgi",
        description: "Lütfen önce sınavı ve kütük dosyasını tamamlayın.",
        variant: "destructive",
      });
      return;
    }

    setAnalyzing(true);
    try {
      await selectExam(createdExamId);
      await apiRequest("POST", "/api/registry/replace", {
        ...preparedRegistryData,
        sourceFileName: file.name,
      });

      await refreshRegistryData();
      setRegistryUploaded(true);

      toast({
        title: "Başarılı",
        description: "Kütük verileri seçili sınav için kaydedildi.",
      });

      setOpen(false);
      resetWizard();
      setLocation("/dashboard");
    } catch (error) {
      console.error("Kütük yükleme hatası:", error);
      if (createdExamId) {
        await rollbackTemporaryExam(createdExamId, previousSelectedExamId);
      }
      toast({
        title: "Hata",
        description: error instanceof Error ? error.message : "Kütük yüklenemedi.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSelectExam = async (examId: string) => {
    setLoading(true);
    try {
      await selectExam(examId);
      setLocation("/dashboard");
    } catch (error) {
      toast({
        title: "Hata",
        description: "Sınav seçilemedi.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = async (examId: string, examName: string) => {
    const confirmed = window.confirm(`"${examName}" sınavını kalıcı olarak silmek istiyor musunuz?`);

    if (!confirmed) {
      return;
    }

    setLoading(true);
    try {
      await apiRequest("DELETE", `/api/exams/${examId}`);
      await loadExams();
      await refreshRegistryData();

      toast({
        title: "Başarılı",
        description: `"${examName}" sınavı silindi.`,
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: error instanceof Error ? error.message : "Sınav silinemedi.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const wizardSteps = [
    { step: 1, label: "Sınav Bilgileri" },
    { step: 2, label: "Excel Dosyası" },
    { step: 3, label: "Sütun Eşleştirme" },
    { step: 4, label: "Filtreleme" },
    { step: 5, label: "Onay ve Yükleme" },
  ];

  const mappingFields: Array<{
    key: keyof ColumnMapping;
    label: string;
    required?: boolean;
  }> = [
    { key: "district", label: "İlçe Adı", required: true },
    { key: "schoolName", label: "Okul Adı", required: true },
    { key: "schoolCode", label: "Okul Kodu", required: true },
    { key: "studentFirstName", label: "Öğrenci Adı", required: true },
    { key: "studentLastName", label: "Öğrenci Soyadı", required: true },
    { key: "studentNumber", label: "Öğrenci Numarası / TC", required: true },
    { key: "schoolNumber", label: "Okul Numarası" },
    { key: "class", label: "Şube" },
    { key: "grade", label: "Sınıf Seviyesi" },
  ];

  const renderWizardContent = () => {
    return (
      <div className="space-y-6 py-2">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {wizardSteps.map((item) => (
            <div
              key={item.step}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                currentStep === item.step
                  ? "border-primary bg-primary/10 text-primary"
                  : currentStep > item.step
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-border bg-muted/30"
              }`}
            >
              <span className="font-semibold">{item.step}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Sınav Adı *</Label>
              <Input
                id="name"
                name="name"
                placeholder="Örn: 2024 LYS Matematik"
                value={examData.name}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Sınav Tarihi *</Label>
              <Input
                id="date"
                name="date"
                type="date"
                value={examData.date}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Açıklama</Label>
              <textarea
                id="description"
                name="description"
                placeholder="Sınav hakkında notlar..."
                value={examData.description}
                onChange={handleInputChange}
                disabled={loading}
                className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={loading}>
                İptal
              </Button>
              <Button onClick={handleCreateExam} disabled={loading}>
                {loading ? "Oluşturuluyor..." : "Devam Et"}
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Excel dosyasını yükleyin</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                İlçe, okul ve öğrenci bilgilerini içeren dosyayı seçin.
              </p>

              <div className="mt-6 flex items-center justify-center gap-3">
                <Button asChild variant="outline" disabled={analyzing}>
                  <label htmlFor="exam-registry-file" className="cursor-pointer">
                    Dosya Seç
                  </label>
                </Button>
                <input
                  id="exam-registry-file"
                  type="file"
                  accept=".xls,.xlsx"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={analyzing}
                />
              </div>

              {file && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm text-foreground">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span className="max-w-[280px] truncate">{file.name}</span>
                </div>
              )}

              {analyzing && <p className="mt-4 text-sm text-muted-foreground">Excel okunuyor...</p>}
            </div>

            <div className="flex justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => setCurrentStep(1)} disabled={loading || analyzing}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Geri
              </Button>
              <Button variant="ghost" onClick={() => handleDialogOpenChange(false)} disabled={loading || analyzing}>
                Vazgeç
              </Button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {mappingFields.map((field) => (
                <div key={String(field.key)} className="space-y-2">
                  <Label>
                    {field.label} {field.required ? <span className="text-destructive">*</span> : null}
                  </Label>
                  <Select
                    value={columnMapping[field.key] || undefined}
                    onValueChange={(value) => handleMappingChange(field.key, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sütun seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {excelColumns.map((column) => (
                        <SelectItem key={column} value={column}>
                          {column}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
              {rawData.length} satır yüklendi. Sütunları eşledikten sonra önizleme aşamasına geçebilirsiniz.
            </div>

            <div className="flex justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => setCurrentStep(2)} disabled={loading || analyzing}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Geri
              </Button>
              <Button onClick={handlePrepareRegistryUpload} disabled={loading || analyzing}>
                Filtrelemeye Geç
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="rounded-xl border bg-muted/20 p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Özel Gereksinimli Öğrencileri Dahil Etme</p>
                  <p className="text-xs text-muted-foreground">
                    Okul adında <span className="font-medium">uygulama</span> veya <span className="font-medium">kademe</span> geçen okullar ile şube adında{" "}
                    <span className="font-medium">hafif, ağır, zihinsel, işitme</span> geçen şubeler kapsam dışı bırakılır.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={excludeSpecialNeeds}
                  onClick={() => setExcludeSpecialNeeds((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                    excludeSpecialNeeds ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      excludeSpecialNeeds ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => setCurrentStep(3)} disabled={loading || analyzing}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Geri
              </Button>
              <Button onClick={handleApplyFiltersAndProceed} disabled={loading || analyzing}>
                Önizlemeye Geç
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border bg-background p-4">
                <p className="text-sm text-muted-foreground">İlçe</p>
                <p className="mt-2 text-2xl font-bold">{stats.districts}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-sm text-muted-foreground">Okul</p>
                <p className="mt-2 text-2xl font-bold">{stats.schools}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-sm text-muted-foreground">Öğrenci</p>
                <p className="mt-2 text-2xl font-bold">{stats.students}</p>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              {currentStep === 5 && createdExamId ? (
                <p>
                  {mappingComplete ? "Sütun eşleştirmesi tamamlandı. " : ""}
                  Bu kütük verileri seçili sınava bağlanacak ve ardından genel bakış ekranına yönlendirileceksiniz.
                </p>
              ) : null}
            </div>

            {rawData.length > 0 && (
              <div className="overflow-hidden rounded-xl border">
                <div className="border-b bg-muted/30 px-4 py-3 text-sm font-medium text-foreground">İlk kayıt önizlemesi</div>
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        {mappingFields.slice(0, 6).map((field) => (
                          <th key={String(field.key)} className="px-4 py-2 font-medium text-muted-foreground">
                            {field.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 3).map((row, index) => (
                        <tr key={index} className="border-b last:border-b-0">
                          {mappingFields.slice(0, 6).map((field) => (
                            <td key={String(field.key)} className="px-4 py-2">
                              {String(row[columnMapping[field.key]] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => setCurrentStep(4)} disabled={loading || analyzing}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Geri
              </Button>
              <Button onClick={handleFinalizeRegistryUpload} disabled={loading || analyzing}>
                {analyzing ? "Yükleniyor..." : "Kütüğü Yükle"}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="flex justify-center mb-4">
            <BookOpen className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-4xl font-heading font-bold text-foreground mb-3">Sınav Kütük Sistemi</h1>
          <p className="text-lg text-muted-foreground">
            Çalışmak istediğiniz sınavı seçin veya yeni bir sınav oluşturun.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3 max-w-6xl mx-auto">
          {/* Create New Exam Card */}
          <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <Card className="lg:col-span-1 hover:shadow-lg transition-all border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent cursor-pointer">
              <DialogTrigger asChild>
                <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                  <div className="bg-primary/10 p-4 rounded-full mb-4">
                    <Plus className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">Yeni Sınav Ekle</h3>
                  <p className="text-sm text-muted-foreground">Başlangıç yapın</p>
                </div>
              </DialogTrigger>
            </Card>

            <DialogContent className="sm:max-w-4xl lg:max-w-5xl">
              <DialogHeader>
                <DialogTitle>Yeni Sınav ve Kütük Oluştur</DialogTitle>
                <DialogDescription>Sınavı oluşturun, ardından aynı pencereden kütük dosyasını yükleyin.</DialogDescription>
              </DialogHeader>
              {renderWizardContent()}
            </DialogContent>
          </Dialog>

          {/* Existing Exams */}
          {exams.map((exam) => (
            <Card
              key={exam.id}
              className="hover:shadow-lg transition-all cursor-pointer group overflow-hidden"
              onClick={() => handleSelectExam(exam.id)}
            >
              <CardHeader className="pb-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {exam.name}
                    </CardTitle>
                    <span className={`mt-2 inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                      exam.isActive === "1"
                        ? "text-white bg-primary"
                        : "text-muted-foreground bg-muted"
                    }`}>
                      {exam.isActive === "1" ? "Aktif" : "İnaktif"}
                    </span>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteExam(exam.id, exam.name);
                    }}
                    disabled={loading}
                    aria-label={`${exam.name} sınavını sil`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Date Info */}
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 text-primary/60" />
                  <span>{formatDate(exam.date)}</span>
                </div>

                {/* Created At Info */}
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary/60" />
                  <span>Oluşturulma: {formatDate(exam.createdAt)}</span>
                </div>

                {/* Select Button */}
                <Button
                  className="w-full mt-4"
                  variant={exam.isActive === "1" ? "default" : "outline"}
                  disabled={loading}
                >
                  {exam.isActive === "1" ? "Devam Et" : "Seç"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {exams.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Henüz Sınav Yok</h3>
            <p className="text-muted-foreground mb-6">Başlamak için yeni bir sınav oluşturun.</p>
            <Dialog open={open} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Plus className="mr-2 h-5 w-5" />
                  İlk Sınavı Oluştur
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl lg:max-w-5xl">
                <DialogHeader>
                  <DialogTitle>Yeni Sınav ve Kütük Oluştur</DialogTitle>
                  <DialogDescription>Sınavı oluşturun, ardından aynı pencereden kütük dosyasını yükleyin.</DialogDescription>
                </DialogHeader>
                {renderWizardContent()}
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
}
