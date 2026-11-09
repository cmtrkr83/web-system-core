import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRegistry, District, School, Student } from "@/context/RegistryContext";
import { useLocation } from "wouter";
import { Plus, BookOpen, Calendar, Clock, FileSpreadsheet, ChevronRight, ChevronLeft, Trash2, Download, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileUpload } from "@/components/base/file-upload/file-upload";
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
  province: string;
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
  province: "",
};

const normalizeHeader = (value: string): string => {
  const charMap: Record<string, string> = {
    "\u015E": "s", "\u015F": "s",
    "\u011E": "g", "\u011F": "g",
    "\u0130": "i",
    "\u0131": "i",
    "I": "i",
    "\u00DC": "u", "\u00FC": "u",
    "\u00D6": "o", "\u00F6": "o",
    "\u00C7": "c", "\u00E7": "c",
  };
  return String(value ?? "")
    .trim()
    .split("")
    .map((c) => charMap[c] ?? c.toLowerCase())
    .join("")
    .replace(/\s+/g, " ");
};

const RAW_LOOKUP: Record<string, keyof ColumnMapping> = {
  "ilce adi": "district",
  "ilce": "district",
  "district": "district",
  "kurum adi": "schoolName",
  "okul adi": "schoolName",
  "school name": "schoolName",
  "schoolname": "schoolName",
  "school": "schoolName",
  "kurum": "schoolName",
  "okul": "schoolName",
  "kurum kodu": "schoolCode",
  "okul kodu": "schoolCode",
  "school code": "schoolCode",
  "schoolcode": "schoolCode",
  "code": "schoolCode",
  "ogrenci adi": "studentFirstName",
  "student name": "studentFirstName",
  "first name": "studentFirstName",
  "firstname": "studentFirstName",
  "adi": "studentFirstName",
  "name": "studentFirstName",
  "ogrenci soyadi": "studentLastName",
  "soyadi": "studentLastName",
  "soyad": "studentLastName",
  "last name": "studentLastName",
  "lastname": "studentLastName",
  "surname": "studentLastName",
  "ogrenci no": "studentNumber",
  "ogrenci numarasi": "studentNumber",
  "student id": "studentNumber",
  "studentid": "studentNumber",
  "student no": "studentNumber",
  "student number": "studentNumber",
  "ogrenci id": "studentNumber",
  "student identifier": "studentNumber",
  "id": "studentNumber",
  "no": "studentNumber",
  "tc kimlik no": "studentNumber",
  "tc no": "studentNumber",
  "tc": "studentNumber",
  "kimlik no": "studentNumber",
  "opaq": "schoolNumber",
  "subesi": "class",
  "sube": "class",
  "sube adi": "class",
  "branch": "class",
  "class": "class",
  "sinif": "grade",
  "sinif seviyesi": "grade",
  "grade": "grade",
  "level": "grade",
  "il adi": "province",
  "il": "province",
  "province": "province",
  "city": "province",
};

const COLUMN_LOOKUP: Record<string, keyof ColumnMapping> = Object.fromEntries(
  Object.entries(RAW_LOOKUP).map(([k, v]) => [normalizeHeader(k), v])
);

const detectColumnMapping = (columns: string[]): ColumnMapping => {
  const result: ColumnMapping = { ...initialColumnMapping };
  for (const column of columns) {
    const normalized = normalizeHeader(column);
    const field = COLUMN_LOOKUP[normalized];
    if (field && !result[field]) {
      result[field] = column;
    }
  }
  return result;
};

const createSafeKey = (value: string, fallback: string): string => {
  const key = normalizeHeader(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || fallback;
};

const downloadRegistryTemplate = () => {
  const headers = [
    "İlçe",
    "Kurum Kodu",
    "Okul Adı",
    "Öğrenci ID",
    "Öğrenci Adı",
    "Öğrenci Soyadı",
    "Sınıf",
    "Şube",
    "Okul Numarası",
    "İl",
  ];
  const example = [
    "Örnek İlçe",
    "123456",
    "Örnek Anadolu Lisesi",
    "OGR-0001",
    "Ayşe",
    "Yılmaz",
    "12",
    "A",
    "101",
    "Örnek İl",
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([headers, example]);
  worksheet["!cols"] = headers.map(() => ({ wch: 20 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Kütük");
  XLSX.writeFile(workbook, "web-system-kutuk-sablonu.xlsx");
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
    grade: "",
    province: "",
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
  const [extraColumns, setExtraColumns] = useState<Set<string>>(new Set());

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
    setExcludeSpecialNeeds(true);
    setExtraColumns(new Set());
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
      toast({
        title: "Hata",
        description: "Geçici sınav temizlenemedi.",
        variant: "destructive",
      });
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
        uploadMode: "free",
      });

      await selectExam(newExam.id);
      setCreatedExamId(newExam.id);

      toast({
        title: "Başarılı",
        description: `"${newExam.name}" sınavı oluşturuldu. Şimdi kütük dosyasını yükleyin.`,
        status: "success",
      });

      setCurrentStep(2);
    } catch (error) {
      console.error("Sınav oluşturma hatası:", error);
      
      if (createdExamId) {
        try {
          await apiRequest("DELETE", `/api/exams/${createdExamId}`);
          await loadExams();
        } catch (deleteError) {
          console.error("Oluşturulan sınav temizlenemedi:", deleteError);
        }
      }
      
      toast({
        title: "Hata",
        description: error instanceof Error ? error.message : "Sınav oluşturulamadı.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (source: File | React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = source instanceof File ? source : source.target.files?.[0];

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
        setExtraColumns(new Set(columns));
        setCurrentStep(3);

        toast({
          title: "Excel Okundu",
          description: `${columns.length} sütun tespit edildi. Sütunları eşleştirin.`,
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

  const EXCLUDED_SCHOOL_KEYWORDS = ["özel eğitim uygulama", "kademe", "engelli", "engelliler"];
  const EXCLUDED_BRANCH_KEYWORDS = ["hafif", "Zihinsel", "zihinsel", "engelli", "engelliler", "işitme"];

  const isExcludedSchool = (schoolName: string) => {
    const normalized = schoolName.toLowerCase();
    return EXCLUDED_SCHOOL_KEYWORDS.some((kw) => normalized.includes(kw));
  };

  const isExcludedBranch = (branchName: string) => {
    const normalized = branchName.toLowerCase();
    return EXCLUDED_BRANCH_KEYWORDS.some((kw) => normalized.includes(kw));
  };

  const handlePrepareRegistryUpload = () => {
    const requiredMappings: Array<[keyof ColumnMapping, string]> = [
      ["district", "İlçe"],
      ["schoolCode", "Kurum/Okul Kodu"],
      ["studentNumber", "Öğrenci ID"],
      ["studentFirstName", "Öğrenci Adı"],
    ];
    const missingMapping = requiredMappings.find(([key]) => !columnMapping[key]);

    if (missingMapping) {
      toast({
        title: "Eksik Eşleştirme",
        description: `${missingMapping[1]} sütununu seçmelisiniz. Eksik alanlar için standart şablonu kullanın.`,
        variant: "destructive",
      });
      return;
    }

    const studentIdColumn = columnMapping.studentNumber;
    const districtColumn = columnMapping.district;
    const schoolCodeColumn = columnMapping.schoolCode;
    const nameColumn = columnMapping.studentFirstName;
    const invalidRows: number[] = [];
    const duplicateIds = new Set<string>();
    const seenIds = new Set<string>();

    rawData.forEach((row, index) => {
      const studentId = String(row[studentIdColumn] ?? "").trim();
      const district = String(row[districtColumn] ?? "").trim();
      const schoolCode = String(row[schoolCodeColumn] ?? "").trim();
      const firstName = String(row[nameColumn] ?? "").trim();
      if (!studentId || !district || !schoolCode || !firstName) {
        invalidRows.push(index + 2);
      }
      if (studentId && seenIds.has(studentId)) {
        duplicateIds.add(studentId);
      }
      if (studentId) seenIds.add(studentId);
    });

    if (invalidRows.length > 0 || duplicateIds.size > 0) {
      const details = [
        invalidRows.length > 0 ? `${invalidRows.length} satırda ilçe, kurum kodu, öğrenci ID veya ad eksik` : "",
        duplicateIds.size > 0 ? `${duplicateIds.size} tekrarlı öğrenci ID` : "",
      ].filter(Boolean).join("; ");
      toast({
        title: "Excel doğrulaması başarısız",
        description: `${details}. Standart şablonu indirip eksik verileri tamamlayın.`,
        variant: "destructive",
      });
      return;
    }

    setMappingComplete(true);
    setCurrentStep(4);
  };

  const handleApplyFiltersAndProceed = () => {
    const studentIdCol = columnMapping.studentNumber!;
    const districtSet = new Set<string>();
    const schoolMap = new Map<string, { id: string; code: string; name: string; district: string }>();
    const students: Student[] = [];

    rawData.forEach((row, index) => {
      const studentId = String(row[studentIdCol] ?? "").trim();
      if (!studentId) return;

      const district = String(row[columnMapping.district!] ?? "").trim();
      const schoolName = columnMapping.schoolName ? String(row[columnMapping.schoolName] ?? "").trim() : "";
      const schoolCode = String(row[columnMapping.schoolCode!] ?? "").trim();
      const studentFirstName = String(row[columnMapping.studentFirstName!] ?? "").trim();
      const studentLastName = columnMapping.studentLastName ? String(row[columnMapping.studentLastName] ?? "").trim() : "";
      const hasLastName = !!columnMapping.studentLastName;
      const studentName = hasLastName ? `${studentFirstName} ${studentLastName}`.trim() : (studentFirstName || studentId);
      const schoolNo = columnMapping.schoolNumber ? String(row[columnMapping.schoolNumber] || "").trim() : "";
      const classInfo = columnMapping.class ? String(row[columnMapping.class] || "").trim() : "";
      const gradeInfo = columnMapping.grade ? String(row[columnMapping.grade] || "").trim() : "";
      const provinceInfo = columnMapping.province ? String(row[columnMapping.province] || "").trim() : "";

      // Build extraData from extra columns + mapped fields (orijinal Excel sutun adlariyla)
      const extraData: Record<string, string> = {};
      for (const col of Array.from(extraColumns)) {
        extraData[col] = String(row[col] ?? "").trim();
      }
      if (district && columnMapping.district) extraData[columnMapping.district] = district;
      if (schoolName && columnMapping.schoolName) extraData[columnMapping.schoolName] = schoolName;
      if (schoolCode && columnMapping.schoolCode) extraData[columnMapping.schoolCode] = schoolCode;
      if (studentFirstName && columnMapping.studentFirstName) extraData[columnMapping.studentFirstName] = studentFirstName;
      if (studentLastName && columnMapping.studentLastName) extraData[columnMapping.studentLastName] = studentLastName;
      if (schoolNo && columnMapping.schoolNumber) extraData[columnMapping.schoolNumber] = schoolNo;
      if (classInfo && columnMapping.class) extraData[columnMapping.class] = classInfo;
      if (gradeInfo && columnMapping.grade) extraData[columnMapping.grade] = gradeInfo;
      if (provinceInfo && columnMapping.province) extraData[columnMapping.province] = provinceInfo;
      if (studentId && columnMapping.studentNumber) extraData[columnMapping.studentNumber] = studentId;

      if (excludeSpecialNeeds && isExcludedSchool(schoolName)) return;
      if (excludeSpecialNeeds && isExcludedBranch(classInfo)) return;

      districtSet.add(district);
      const schoolKey = `${createSafeKey(district, "district")}-${createSafeKey(schoolCode, `row-${index + 1}`)}`;
      if (!schoolMap.has(schoolKey)) {
        schoolMap.set(schoolKey, {
          id: `school-${schoolKey}`,
          code: schoolCode,
          name: schoolName || `Kurum ${schoolCode}`,
          district,
        });
      }

      students.push({
        id: `student-${createSafeKey(studentId, `row-${index + 1}`)}-${index + 1}`,
        fullName: studentName,
        studentNo: studentId,
        schoolId: `school-${schoolKey}`,
        grade: gradeInfo,
        class: classInfo,
        schoolNo,
        extraData: Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : undefined,
      });
    });

    let districts: District[];
    let schools: School[];

    if (schoolMap.size > 0) {
      districts = Array.from(districtSet).map((name) => ({
        id: `district-${createSafeKey(name, "unknown")}`,
        name,
      }));
      schools = Array.from(schoolMap.values()).map((info) => {
        const district = districts.find((item) => item.name === info.district);
        return { id: info.id, name: info.name, districtId: district?.id || "", code: info.code };
      });
    } else {
      districts = [{ id: "d1", name: "Genel" }];
      schools = [{ id: "free", name: "Serbest Yükleme", districtId: "d1", code: "free" }];
    }

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
      await loadExams();
      setRegistryUploaded(true);

      toast({
        title: "Başarılı",
        description: "Kütük verileri seçili sınav için kaydedildi.",
        status: "success",
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
        status: "success",
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

  const mappingFields = [
    { key: "studentNumber" as const, label: "Öğrenci ID", required: true },
    { key: "studentFirstName" as const, label: "Öğrenci Adı", required: true },
    { key: "studentLastName" as const, label: "Öğrenci Soyadı" },
    { key: "schoolCode" as const, label: "Kurum/Okul Kodu", required: true },
    { key: "schoolName" as const, label: "Okul Adı" },
    { key: "district" as const, label: "İlçe Adı", required: true },
    { key: "province" as const, label: "İl Adı" },
    { key: "grade" as const, label: "Sınıf Seviyesi" },
    { key: "class" as const, label: "Şube" },
    { key: "schoolNumber" as const, label: "Okul Numarası" },
  ];

  const renderWizardContent = () => {
    return (
      <div className="space-y-6 py-2">
        <div className="flex items-center justify-between gap-2 text-xs text-text-tertiary">
          {wizardSteps.map((item) => (
            <div
              key={item.step}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                currentStep === item.step
                  ? "border-accent-600 bg-accent-600/10 text-accent-600"
                  : currentStep > item.step
                    ? "border-state-success-base bg-state-success-base text-state-success-text"
                    : "border-separator-border bg-background-secondary-default/30"
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
                className="min-h-[96px] w-full rounded-md border border-border-button-default bg-background-full px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus-ring/50 disabled:opacity-50"
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" leadingIcon={ChevronLeft} onClick={() => handleDialogOpenChange(false)} disabled={loading}>
                İptal
              </Button>
              <Button leadingIcon={ChevronRight} onClick={handleCreateExam} disabled={loading} variant="primary">
                {loading ? "Oluşturuluyor..." : "Devam Et"}
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-title-3-semibold text-text-primary">Excel dosyasını yükleyin</h3>
                <p className="mt-1 text-body-regular text-text-secondary">
                  Standart şablonu kullanabilir veya farklı bir Excel dosyası yükleyip sütunları sonraki adımda eşleştirebilirsiniz.
                </p>
              </div>
              <FileUpload
                allowedExtensions={["xls", "xlsx"]}
                maxBytes={20 * 1024 * 1024}
                onUploadComplete={handleFileChange}
                className={analyzing ? "pointer-events-none opacity-60" : undefined}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-caption-2-regular text-text-tertiary">
                  XLS, XLSX · En fazla 20 MB
                </p>
                <Button type="button" variant="secondary" leadingIcon={Download} onClick={downloadRegistryTemplate} disabled={analyzing}>
                  Standart Şablonu İndir
                </Button>
              </div>
              {file && (
                <div className="inline-flex items-center gap-2 rounded-xl border border-border-button-default bg-background-secondary-default px-4 py-2 text-body-regular text-text-primary">
                  <FileSpreadsheet className="h-4 w-4 text-text-success-primary" />
                  <span className="max-w-[280px] truncate">{file.name}</span>
                </div>
              )}
              {analyzing && <p className="text-body-regular text-text-secondary">Excel okunuyor...</p>}
            </div>

            <div className="flex justify-between gap-3 pt-2">
              <Button variant="secondary" onClick={() => setCurrentStep(1)} disabled={loading || analyzing} leadingIcon={ChevronLeft}>
                
                Geri
              </Button>
              <Button variant="ghost" leadingIcon={X} onClick={() => handleDialogOpenChange(false)} disabled={loading || analyzing}>
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
                    {field.label} {field.required ? <span className="text-text-error-primary">*</span> : null}
                  </Label>
                  <Select
                    value={columnMapping[field.key] || undefined}
                    onValueChange={(value) => {
                      handleMappingChange(field.key, value);
                      setExtraColumns(prev => {
                        const next = new Set(prev);
                        next.delete(value);
                        return next;
                      });
                    }}
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

            <div className="rounded-xl border bg-background-secondary-default/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text-primary">Ek Sütunlar</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const used = Object.values(columnMapping).filter(Boolean);
                      setExtraColumns(new Set(excelColumns.filter(c => !used.includes(c))));
                    }}
                    className="text-xs text-accent-600 hover:underline"
                  >
                    Tümünü Seç
                  </button>
                  <span className="text-xs text-text-tertiary">|</span>
                  <button
                    type="button"
                    onClick={() => setExtraColumns(new Set())}
                    className="text-xs text-text-tertiary hover:underline"
                  >
                    Temizle
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                {excelColumns.filter(c => !Object.values(columnMapping).includes(c)).map((column) => {
                  const isSelected = extraColumns.has(column);
                  return (
                    <label
                      key={column}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                        isSelected
                          ? "border-accent-600 bg-accent-600/5 text-text-primary"
                          : "border-separator-border text-text-tertiary hover:border-border-button-hover/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(extraColumns);
                          if (next.has(column)) next.delete(column);
                          else next.add(column);
                          setExtraColumns(next);
                        }}
                        className="rounded border-border-button-default"
                      />
                      <span className="truncate">{column}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-text-tertiary">
                {extraColumns.size} ek sütun seçili
              </p>
            </div>

            <div className="rounded-lg border bg-background-secondary-default/20 p-4 text-sm text-text-tertiary">
              {rawData.length} satır yüklendi. Zorunlu alanlar: İlçe, Kurum/Okul Kodu, Öğrenci ID ve Öğrenci Adı. Okul adı boşsa kurum koduyla gösterilir.
            </div>

            <div className="flex justify-between gap-3 pt-2">
              <Button variant="secondary" onClick={() => setCurrentStep(2)} disabled={loading || analyzing} leadingIcon={ChevronLeft}>
                
                Geri
              </Button>
              <Button onClick={handlePrepareRegistryUpload} disabled={loading || analyzing} variant="primary" trailingIcon={ChevronRight}>
                Filtrelemeye Geç
                
              </Button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="rounded-xl border bg-background-secondary-default/20 p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-text-primary">Özel Gereksinimli Öğrencileri Dahil Etme</p>
                  <p className="text-xs text-text-tertiary">
                    Okul adında <span className="font-medium">uygulama</span> veya <span className="font-medium">kademe</span> geçen okullar ile şube adında{" "}
                    <span className="font-medium">hafif, ağır, zihinsel, işitme</span> geçen şubeler kapsam dışı bırakılır.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={excludeSpecialNeeds}
                  onClick={() => setExcludeSpecialNeeds((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus-ring/50 ${
                    excludeSpecialNeeds ? "bg-accent-600" : "bg-background-secondary-default"
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
              <Button variant="secondary" onClick={() => setCurrentStep(3)} disabled={loading || analyzing} leadingIcon={ChevronLeft}>
                
                Geri
              </Button>
              <Button onClick={handleApplyFiltersAndProceed} disabled={loading || analyzing} variant="primary" trailingIcon={ChevronRight}>
                Önizlemeye Geç
                
              </Button>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-4 overflow-x-hidden">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-background-full px-3 py-3">
                <p className="text-xs text-text-tertiary">İlçe</p>
                <p className="mt-1 text-xl font-bold">{stats.districts}</p>
              </div>
              <div className="rounded-xl border bg-background-full px-3 py-3">
                <p className="text-xs text-text-tertiary">Okul</p>
                <p className="mt-1 text-xl font-bold">{stats.schools}</p>
              </div>
              <div className="rounded-xl border bg-background-full px-3 py-3">
                <p className="text-xs text-text-tertiary">Öğrenci</p>
                <p className="mt-1 text-xl font-bold">{stats.students}</p>
              </div>
            </div>

            <div className="rounded-xl border bg-background-secondary-default/20 px-4 py-3 text-sm text-text-tertiary">
              {currentStep === 5 && createdExamId ? (
                <p>{stats.students} öğrenci kaydı seçili sınava bağlanacak.</p>
              ) : null}
            </div>

            {rawData.length > 0 && (
              <div className="rounded-xl border">
                <div className="border-b bg-background-secondary-default/30 px-4 py-3 text-sm font-medium text-text-primary">İlk kayıt önizlemesi</div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-sm table-fixed">
                    <thead className="sticky top-0 bg-background-full">
                      <tr className="border-b">
                        {[columnMapping.studentNumber, ...Array.from(extraColumns)].filter(Boolean).map((label, i) => (
                          <th key={i} className="px-2 py-2 font-medium text-text-tertiary truncate">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 3).map((row, index) => (
                        <tr key={index} className="border-b last:border-b-0">
                          {[columnMapping.studentNumber, ...Array.from(extraColumns)].filter(Boolean).map((col, i) => (
                            <td key={i} className="px-2 py-2 truncate">{String(row[col] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-3 pt-2">
              <Button variant="secondary" onClick={() => setCurrentStep(4)} disabled={loading || analyzing} leadingIcon={ChevronLeft}>
                
                Geri
              </Button>
              <Button onClick={handleFinalizeRegistryUpload} disabled={loading || analyzing} variant="primary" trailingIcon={ChevronRight}>
                {analyzing ? "Yükleniyor..." : "Kütüğü Yükle"}
                
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-10 md:py-12">
        {/* Header */}
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-accent-600/10 text-accent-600 shadow-sm">
            <BookOpen className="h-7 w-7" />
          </div>
          <h1 className="mb-3 text-title-1-semibold tracking-tight text-text-primary md:text-display-2">Sınav Kütük Sistemi</h1>
          <p className="text-body-large text-text-secondary">
            Çalışmak istediğiniz sınavı seçin veya yeni bir sınav oluşturun.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
          {/* Create New Exam Card */}
          <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <Card className="group min-h-[280px] cursor-pointer border border-dashed border-accent-600/30 bg-accent-600/[0.03] transition-all hover:-translate-y-0.5 hover:border-accent-600/60 hover:shadow-lg">
              <DialogTrigger asChild>
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-accent-600/10 text-accent-600 transition-transform group-hover:scale-105">
                    <Plus className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 font-semibold text-text-primary">Yeni Sınav Ekle</h3>
                  <p className="max-w-[200px] text-sm text-text-tertiary">Sınav bilgilerini ve kütük dosyasını birlikte oluşturun.</p>
                  <span className="mt-5 text-xs font-medium text-accent-600">Başlamak için tıklayın</span>
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
              className="group cursor-pointer overflow-hidden border-separator-border/80 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => handleSelectExam(exam.id)}
            >
              <CardHeader className="pb-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg text-text-primary group-hover:text-accent-600 transition-colors line-clamp-2">
                      {exam.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={exam.isActive === "1" ? "default" : "secondary"} className="rounded-full">
                        {exam.isActive === "1" ? "Aktif" : "İnaktif"}
                      </Badge>
                      {exam.sinavid && (
                        <Badge variant="outline" className="rounded-full font-mono">
                          #{exam.sinavid}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="rounded-full text-status-lime-text">
                        Serbest
                      </Badge>
                    </div>
                  </div>

                  <Button
                    variant="ghost"

                    className="shrink-0 text-text-tertiary hover:bg-border-error-default/10 hover:text-text-error-primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteExam(exam.id, exam.name);
                    }}
                    disabled={loading}
                    aria-label={`${exam.name} sınavını sil`} iconOnly leadingIcon={Trash2}
                  ></Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pb-5">
                {/* Date Info */}
                <div className="flex items-center gap-3 text-sm text-text-tertiary">
                  <Calendar className="h-4 w-4 text-accent-600/60" />
                  <span className="font-medium text-text-primary">{formatDate(exam.date)}</span>
                </div>

                {/* Created At Info */}
                <div className="flex items-center gap-3 text-sm text-text-tertiary">
                  <Clock className="h-4 w-4 text-accent-600/60" />
                  <span>Oluşturulma: {formatDate(exam.createdAt)}</span>
                </div>

                {/* Select Button */}
                <Button
                  className="w-full mt-4"
                  variant={exam.isActive === "1" ? "primary" : "secondary"}
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
            <BookOpen className="h-16 w-16 text-text-tertiary/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">Henüz Sınav Yok</h3>
            <p className="text-text-tertiary mb-6">Başlamak için yeni bir sınav oluşturun.</p>
            <Dialog open={open} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button size="medium" variant="primary" leadingIcon={Plus}>
                  
                  İlk Sınavı Oluştur
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-4xl lg:max-w-5xl max-h-[85vh] overflow-y-auto">
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
