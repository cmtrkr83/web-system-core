import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRegistry, District, School, Student } from "@/context/RegistryContext";
import { apiRequest } from "@/lib/queryClient";
import * as XLSX from "xlsx";

interface ColumnMapping {
  district: string;
  schoolName: string;
  schoolCode: string;
  studentFirstName: string;
  studentLastName: string;
  studentNumber: string; // OPAQ / TC
  schoolNumber: string;  // Okul numarası (isteğe bağlı)
  class: string;
  grade: string;
}

export default function RegistryUpload() {
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
  const [mappingOpen, setMappingOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [districtCount, setDistrictCount] = useState(0);
  const [schoolCount, setSchoolCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const [subeLiCount, setSubeliCount] = useState(0);
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState(false);
  const [excludeSpecialStudents, setExcludeSpecialStudents] = useState(true);
  const { toast } = useToast();
  const { refreshRegistryData } = useRegistry();

  const resetUploadScreenState = () => {
    setFile(null);
    setAnalyzed(false);
    setMappingComplete(false);
    setProgress(0);
    setDistrictCount(0);
    setSchoolCount(0);
    setStudentCount(0);
    setSubeliCount(0);
    setExcelColumns([]);
    setRawData([]);
    setExcludeSpecialStudents(true);
    setUploadConfirmOpen(false);
    setMappingOpen(false);
    setColumnMapping({
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

    // Clear last confirmed excel mapping cache used by Optik Kodlama page.
    localStorage.removeItem("optic-coding:last-mapping");
  };

  const handleClearRegistry = async () => {
    try {
      await apiRequest("POST", "/api/registry/clear");
      await refreshRegistryData();
      resetUploadScreenState();
      toast({
        title: "Veriler Temizlendi",
        description: "Veritabanındaki ve ekrandaki tüm yüklü kayıtlar silindi.",
      });
    } catch (error) {
      console.error("Registry temizleme hatası:", error);
      toast({
        title: "Hata",
        description: "Veriler temizlenirken bir hata oluştu.",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setAnalyzed(false);
      setMappingComplete(false);
      setProgress(0);
      setDistrictCount(0);
      setSchoolCount(0);
      setStudentCount(0);
      setSubeliCount(0);
      setExcelColumns([]);
      setRawData([]);
      setExcludeSpecialStudents(true);
      setUploadConfirmOpen(false);
    }
  };

  const handleLoadExcel = () => {
    if (!file) return;
    
    setAnalyzing(true);
    setProgress(10);
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        setProgress(30);
        
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        setProgress(50);
        
        // Parse Excel data
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];
        
        if (jsonData.length === 0) {
          toast({
            title: "Excel Dosyası Boş",
            description: "Excel dosyası veri içermiyor.",
            variant: "destructive"
          });
          setAnalyzing(false);
          return;
        }

        setProgress(70);
        
        // Extract column headers
        const columns = Object.keys(jsonData[0]).filter(c => c && typeof c === 'string');
        
        if (columns.length === 0) {
          toast({
            title: "Sütun Bulunamadı",
            description: "Excel dosyasında geçerli sütun başlıkları bulunamadı.",
            variant: "destructive"
          });
          setAnalyzing(false);
          return;
        }
        
        setExcelColumns(columns);
        setRawData(jsonData);
        
        // Auto-detect common column names with weighted scoring.
        // This reduces false positives such as matching "İl Adı" as student name.
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

        type WeightedPattern = { pattern: RegExp; weight: number };
        type MatchRule = {
          positive: WeightedPattern[];
          negative?: WeightedPattern[];
          boost?: (normalized: string) => number;
        };

        const normalizedColumns = columns.map((col) => ({
          raw: col,
          normalized: normalizeHeader(col),
        }));

        const findBestColumn = (rule: MatchRule) => {
          let bestColumn = "";
          let bestScore = Number.NEGATIVE_INFINITY;

          for (const col of normalizedColumns) {
            let score = 0;

            for (const p of rule.positive) {
              if (p.pattern.test(col.normalized)) score += p.weight;
            }

            for (const n of rule.negative || []) {
              if (n.pattern.test(col.normalized)) score -= n.weight;
            }

            if (rule.boost) score += rule.boost(col.normalized);

            if (score > bestScore) {
              bestScore = score;
              bestColumn = col.raw;
            }
          }

          return bestScore > 0 ? bestColumn : "";
        };

        const districtRule: MatchRule = {
          positive: [
            { pattern: /\bilce\b/, weight: 14 },
            { pattern: /district/, weight: 10 },
            { pattern: /ilce adi/, weight: 8 },
          ],
          negative: [
            { pattern: /ogrenci|ad soyad|soyad|name|surname/, weight: 10 },
            { pattern: /okul|kurum|school/, weight: 8 },
            { pattern: /sinif|sube|class|grade/, weight: 8 },
            { pattern: /kod|code|numara|no|tc|opaq/, weight: 8 },
          ],
        };

        const schoolNameRule: MatchRule = {
          positive: [
            { pattern: /kurum adi/, weight: 14 },
            { pattern: /okul adi/, weight: 14 },
            { pattern: /school name|school/, weight: 10 },
          ],
          negative: [
            { pattern: /kod|code/, weight: 8 },
            { pattern: /ilce|district/, weight: 8 },
            { pattern: /ogrenci|ad soyad|soyad/, weight: 10 },
          ],
        };

        const schoolCodeRule: MatchRule = {
          positive: [
            { pattern: /kurum kodu/, weight: 16 },
            { pattern: /okul kodu/, weight: 14 },
            { pattern: /school code|code/, weight: 10 },
            { pattern: /\bkod\b/, weight: 8 },
          ],
          negative: [
            { pattern: /ogrenci|ad soyad|soyad|name/, weight: 10 },
            { pattern: /ilce|district/, weight: 8 },
          ],
        };

        const studentFirstNameRule: MatchRule = {
          positive: [
            { pattern: /ogrenci adi/, weight: 20 },
            { pattern: /ogrenci isim/, weight: 18 },
            { pattern: /ad soyad/, weight: 8 },
            { pattern: /\bname\b/, weight: 6 },
            { pattern: /\bad\b/, weight: 5 },
          ],
          negative: [
            { pattern: /\bil\b|ilce|district/, weight: 18 },
            { pattern: /okul|kurum|school/, weight: 12 },
            { pattern: /soyad|surname/, weight: 16 },
            { pattern: /sinif|sube|class|grade/, weight: 10 },
            { pattern: /kod|code|numara|no|tc|opaq/, weight: 10 },
          ],
          boost: (normalized) => {
            let bonus = 0;
            if (normalized.includes("ogrenci") && (normalized.includes(" adi") || normalized.endsWith(" ad"))) {
              bonus += 12;
            }
            if (normalized === "ad" || normalized === "adi") {
              bonus += 4;
            }
            return bonus;
          },
        };

        const studentLastNameRule: MatchRule = {
          positive: [
            { pattern: /ogrenci soyadi/, weight: 22 },
            { pattern: /\bsoyad\b/, weight: 14 },
            { pattern: /surname|last name/, weight: 10 },
          ],
          negative: [
            { pattern: /\bil\b|ilce|district/, weight: 12 },
            { pattern: /okul|kurum|school/, weight: 10 },
            { pattern: /sinif|sube|class|grade/, weight: 10 },
            { pattern: /kod|code|numara|no|tc|opaq/, weight: 10 },
          ],
        };

        const studentNumberRule: MatchRule = {
          positive: [
            { pattern: /opaq/, weight: 20 },
            { pattern: /\btc\b/, weight: 18 },
            { pattern: /kimlik/, weight: 14 },
            { pattern: /ogrenci no|numara|\bno\b/, weight: 10 },
          ],
          negative: [
            { pattern: /okul no|school no/, weight: 8 },
          ],
        };

        const schoolNumberRule: MatchRule = {
          positive: [
            { pattern: /okul no|okul numara|school no/, weight: 18 },
            { pattern: /\bokul\b/, weight: 8 },
            { pattern: /numara|\bno\b/, weight: 6 },
          ],
          negative: [
            { pattern: /ogrenci no|opaq|\btc\b/, weight: 12 },
          ],
        };

        const classRule: MatchRule = {
          positive: [
            { pattern: /sube|subesi/, weight: 16 },
            { pattern: /branch/, weight: 10 },
          ],
          negative: [
            { pattern: /sinif|grade|class/, weight: 6 },
          ],
        };

        const gradeRule: MatchRule = {
          positive: [
            { pattern: /sinif/, weight: 16 },
            { pattern: /class|grade/, weight: 10 },
          ],
          negative: [
            { pattern: /sube|subesi|branch/, weight: 8 },
          ],
        };

        const autoMapping: ColumnMapping = {
          district: findBestColumn(districtRule),
          schoolName: findBestColumn(schoolNameRule),
          schoolCode: findBestColumn(schoolCodeRule),
          studentFirstName: findBestColumn(studentFirstNameRule),
          studentLastName: findBestColumn(studentLastNameRule),
          studentNumber: findBestColumn(studentNumberRule),
          schoolNumber: findBestColumn(schoolNumberRule),
          class: findBestColumn(classRule),
          grade: findBestColumn(gradeRule),
        };

        toast({
          title: "Excel Yüklendi",
          description: `${columns.length} sütun tespit edildi. Lütfen sütun eşleştirmesini kontrol edin.`,
        });
        // Apply auto-detected mapping and open modal for user confirmation
        setColumnMapping(autoMapping);
        setMappingOpen(true);
        setAnalyzing(false);
        
      } catch (error) {
        console.error("Excel okuma hatası:", error);
        toast({
          title: "Hata",
          description: "Excel dosyası okunurken bir hata oluştu.",
          variant: "destructive"
        });
        setAnalyzing(false);
      }
    };
    
    reader.onerror = () => {
      toast({
        title: "Dosya Okuma Hatası",
        description: "Dosya okunamadı.",
        variant: "destructive"
      });
      setAnalyzing(false);
    };
    
    reader.readAsArrayBuffer(file);
  };
  const handleAnalyze = async () => {
    if (rawData.length === 0) return;
    
    // Validate mapping
    const requiredFields = ['district', 'schoolName', 'schoolCode', 'studentFirstName', 'studentLastName', 'studentNumber']; // schoolNumber is optional
    const missingFields = requiredFields.filter(field => !columnMapping[field as keyof ColumnMapping]);
    
    if (missingFields.length > 0) {
      toast({
        title: "Eksik Eşleştirme",
        description: "Lütfen tüm zorunlu alanları eşleştirin.",
        variant: "destructive"
      });
      return;
    }
    
    setAnalyzing(true);
    setProgress(10);
    
    try {
      setProgress(30);
      
      // Extract unique districts, schools and students using the column mapping
      const districtSet = new Set<string>();
      const schoolMap = new Map<string, {name: string, district: string}>();
      const subeSet = new Set<string>();
      const students: Student[] = [];
      
      setProgress(50);
      
      rawData.forEach((row, index) => {
        const district = String(row[columnMapping.district] || "").trim();
        const schoolName = String(row[columnMapping.schoolName] || "").trim();
        const schoolCode = String(row[columnMapping.schoolCode] || `${index}`).trim();
        const studentFirstName = row[columnMapping.studentFirstName] || "";
        const studentLastName = row[columnMapping.studentLastName] || "";
        const studentName = `${studentFirstName} ${studentLastName}`.trim() || `Öğrenci ${index + 1}`;
        const studentId = row[columnMapping.studentNumber] || `${10000000000 + index}`;
        const schoolNo = columnMapping.schoolNumber ? (row[columnMapping.schoolNumber] || "") : "";
        const classInfo = String(columnMapping.class ? (row[columnMapping.class] || "") : "").trim();
        const sinif = columnMapping.grade ? (row[columnMapping.grade] || "") : "";

        const schoolNameLower = schoolName.toLocaleLowerCase("tr-TR");
        const classInfoLower = classInfo.toLocaleLowerCase("tr-TR");
        const isKademeSchool = excludeSpecialStudents && schoolNameLower.includes("kademe");
        const specialKeywords = ["zihinsel","Otistik","Özel Eğitim","Özel Eğitim Sınıfı","hafif","ağır","özel gereksinimli","özel gereksinim","özel eğitim ihtiyacı"];
        const isExcludedSpecialClass = excludeSpecialStudents && specialKeywords.some(keyword => classInfoLower.includes(keyword));

        if (isKademeSchool || isExcludedSpecialClass) {
          return;
        }
        
        if (district) {
          districtSet.add(district);
        }
        
        // Okulu ilçesi ile birlikte sakla
        if (schoolName && schoolCode) {
          schoolMap.set(schoolCode, {name: schoolName, district: district});
        }
        
        // Şube sayısı: Kurum Kodu + Şube İsmi kombinasyonuna göre benzersiz sayılır
        if (classInfo && schoolCode) {
          subeSet.add(`${schoolCode}#${classInfo}`);
        }
        
        if (studentName && studentId) {
          students.push({
            id: `st-${studentId}`,
            name: studentName,
            tc: studentId.toString(),
            schoolId: schoolCode,
            salon: sinif.toString(),
            class: classInfo.toString(),
            schoolNo: schoolNo.toString()
          });
        }
      });

      setProgress(70);
      
      // Convert sets and maps to arrays
      const districts: District[] = Array.from(districtSet).map((name, idx) => ({
        id: `d${idx + 1}`,
        name
      }));
      
      // Okulları doğru ilçeleriyle eşleştir
      const schools: School[] = Array.from(schoolMap).map(([code, info]) => {
        const districtObj = districts.find(d => d.name === info.district);
        return {
          id: code,
          name: info.name,
          districtId: districtObj?.id || "d1",
          code
        };
      });

      setProgress(85);
      
      setDistrictCount(districts.length);
      setSchoolCount(schools.length);
      setStudentCount(students.length);
      setSubeliCount(subeSet.size);

      localStorage.setItem(
        "optic-coding:last-mapping",
        JSON.stringify({
          sourceFileName: file?.name || "",
          savedAt: new Date().toISOString(),
          columnMapping,
        })
      );

      await apiRequest("POST", "/api/registry/replace", {
        districts,
        schools,
        students,
        sourceFileName: file?.name || "",
      });
      
      await refreshRegistryData();
      setAnalyzing(false);
      setAnalyzed(true);
      setMappingComplete(true);
      // Close mapping modal after successful analyze
      setMappingOpen(false);
      
      setProgress(100);
      
      toast({
        title: "Veri Ayrıştırma Başarılı",
        description: `${districts.length} ilçe, ${schools.length} okul, ${students.length} öğrenci, ${subeSet.size} şube tespit edildi.${excludeSpecialStudents ? " 'Zihinsel' şubeler ve adı 'kademe' geçen okullar dahil edilmedi." : " Tüm kayıtlar dahil edildi."}`,
      });
    } catch (error) {
      console.error("Veri parse hatası:", error);
      toast({
        title: "Hata",
        description: "Veriler işlenirken bir hata oluştu.",
        variant: "destructive"
      });
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Kütük Belirleme</h1>
        <p className="text-muted-foreground mt-1">Excel dosyasını yükleyip sütun eşleştirmesi yapın.</p>
        <div className="mt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Veritabanı Verilerini Temizle
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tüm Yüklü Veriler Silinsin mi?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bu işlem geri alınamaz. Onaylarsanız veritabanındaki tüm kütük kayıtları ve ekrandaki yüklü veriler tamamen silinecektir.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    void handleClearRegistry();
                  }}
                >
                  Evet, Tümünü Sil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="space-y-6">
        {/* Dosya Yükleme */}
        <Card>
          <CardHeader>
            <CardTitle>Dosya Yükleme</CardTitle>
            <CardDescription>Excel dosyasını seçin ve sütunları eşleştirin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border-2 border-dashed border-input hover:border-primary/50 transition-colors rounded-xl p-10 flex flex-col items-center justify-center gap-4 text-center bg-muted/20">
              <div className="p-4 rounded-full bg-primary/10 text-primary">
                <Upload className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">Excel dosyasını buraya bırakın</p>
                <p className="text-sm text-muted-foreground">İlçe, Okul ve Öğrenci bilgileri içeren dosyayı yükleyin.</p>
              </div>
              <input 
                type="file" 
                accept=".xls,.xlsx" 
                className="hidden" 
                id="file-upload"
                onChange={handleFileChange}
              />
              <Button asChild variant="outline">
                <label htmlFor="file-upload" className="cursor-pointer">Dosya Seç</label>
              </Button>
            </div>

            {file && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => setUploadConfirmOpen(true)} 
                  disabled={analyzing || excelColumns.length > 0}
                >
                  {analyzing ? "Yükleniyor..." : excelColumns.length > 0 ? "Yüklendi" : "Excel'i Yükle"}
                </Button>

                <Dialog open={uploadConfirmOpen} onOpenChange={setUploadConfirmOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Excel Yükleme Uyarısı</DialogTitle>
                      <DialogDescription>
                        Excel yüklenmeden önce filtre seçimi yapabilirsiniz.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                      <div className="flex items-start gap-3 rounded-md border p-3">
                        <Checkbox
                          id="exclude-special"
                          checked={excludeSpecialStudents}
                          onCheckedChange={(checked) => setExcludeSpecialStudents(checked === true)}
                        />
                        <div className="space-y-1">
                          <Label htmlFor="exclude-special" className="cursor-pointer">
                            Özel öğrenciler alınmasın
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            İşaretlenirse şube adında "zihinsel" geçen kayıtlar ve adı "kademe" geçen okullar dahil edilmez.
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Not: Okul adında "kademe" geçen okullar ve öğrencileri her durumda listelere dahil edilmez.
                      </p>
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setUploadConfirmOpen(false)}>
                        Vazgeç
                      </Button>
                      <Button
                        onClick={() => {
                          setUploadConfirmOpen(false);
                          handleLoadExcel();
                        }}
                      >
                        Devam Et
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            
            {analyzing && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">
                  Excel dosyası okunuyor... %{progress}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sütun Eşleştirmesi - Modal */}
        <Dialog open={mappingOpen} onOpenChange={(open) => setMappingOpen(open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sütun Eşleştirmesi</DialogTitle>
              <DialogDescription>Excel dosyasındaki sütunları sistem alanlarıyla eşleştirin.</DialogDescription>
            </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>İlçe Adı <span className="text-red-500">*</span></Label>
                      <Select 
                        value={columnMapping.district || undefined} 
                        onValueChange={(val) => setColumnMapping({...columnMapping, district: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sütun seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {excelColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Okul Adı <span className="text-red-500">*</span></Label>
                      <Select 
                        value={columnMapping.schoolName || undefined} 
                        onValueChange={(val) => setColumnMapping({...columnMapping, schoolName: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sütun seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {excelColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Okul Kodu / Kurum Kodu <span className="text-red-500">*</span></Label>
                      <Select 
                        value={columnMapping.schoolCode || undefined} 
                        onValueChange={(val) => setColumnMapping({...columnMapping, schoolCode: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sütun seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {excelColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Öğrenci Adı <span className="text-red-500">*</span></Label>
                      <Select 
                        value={columnMapping.studentFirstName || undefined} 
                        onValueChange={(val) => setColumnMapping({...columnMapping, studentFirstName: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sütun seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {excelColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Öğrenci Soyadı <span className="text-red-500">*</span></Label>
                      <Select 
                        value={columnMapping.studentLastName || undefined} 
                        onValueChange={(val) => setColumnMapping({...columnMapping, studentLastName: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sütun seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {excelColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Okul Numarası / OPAQ <span className="text-red-500">*</span></Label>
                      <Select 
                        value={columnMapping.studentNumber || undefined} 
                        onValueChange={(val) => setColumnMapping({...columnMapping, studentNumber: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sütun seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {excelColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Okul No (farklıysa)</Label>
                      <Select 
                        value={columnMapping.schoolNumber || undefined} 
                        onValueChange={(val) => setColumnMapping({...columnMapping, schoolNumber: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sütun seçin (opsiyonel)" />
                        </SelectTrigger>
                        <SelectContent>
                          {excelColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Şube / Sınıf Şubesi</Label>
                      <Select 
                        value={columnMapping.class || undefined} 
                        onValueChange={(val) => setColumnMapping({...columnMapping, class: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sütun seçin (opsiyonel)" />
                        </SelectTrigger>
                        <SelectContent>
                          {excelColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Sınıf Seviyesi</Label>
                      <Select 
                        value={columnMapping.grade || undefined} 
                        onValueChange={(val) => setColumnMapping({...columnMapping, grade: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sütun seçin (opsiyonel)" />
                        </SelectTrigger>
                        <SelectContent>
                          {excelColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 rounded-md text-sm border border-blue-100">
                    <Info className="w-5 h-5 shrink-0 mt-0.5" />
                    <p>
                      <span className="text-red-500">*</span> ile işaretli alanlar zorunludur. Diğer alanlar opsiyoneldir.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setMappingOpen(false)}>İptal</Button>
                  <Button onClick={() => { void handleAnalyze(); }}>Verileri Ayrıştır</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Analiz Sonuçları */}
        {analyzed && mappingComplete && (
          <Card className="animate-in fade-in zoom-in-95 duration-300">
            <CardHeader>
              <CardTitle>Veri Analiz Sonuçları</CardTitle>
              <CardDescription>Excel dosyasından çıkarılan benzersiz veriler.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900">
                    <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mb-1">İlçe</p>
                    <p className="text-2xl font-bold font-mono text-indigo-900 dark:text-indigo-100">{districtCount}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-1">Okul</p>
                    <p className="text-2xl font-bold font-mono text-emerald-900 dark:text-emerald-100">{schoolCount}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">Şube</p>
                    <p className="text-2xl font-bold font-mono text-blue-900 dark:text-blue-100">{subeLiCount}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900">
                    <p className="text-sm text-amber-600 dark:text-amber-400 font-medium mb-1">Öğrenci</p>
                    <p className="text-2xl font-bold font-mono text-amber-900 dark:text-amber-100">{studentCount}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200 rounded-md text-sm border border-green-100">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>
                    Veriler başarıyla ayrıştırıldı! Artık salon listesi ve raporlar oluşturabilirsiniz.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
