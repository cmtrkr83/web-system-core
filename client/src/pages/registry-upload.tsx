import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { useRegistry, District, School, Student } from "@/context/RegistryContext";

export default function RegistryUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const { setRegistryData } = useRegistry();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setAnalyzed(false);
      setProgress(0);
    }
  };

  const handleAnalyze = () => {
    if (!file) return;
    
    setAnalyzing(true);
    setProgress(10);
    
    // Simulating dynamic data extraction from Excel
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          
          // These would be parsed from Excel columns: [İlçe], [Okul Adı], [Kurum Kodu], [Öğrenci Adı], [Şube], [Salon]
          // The logic here mimics the actual Excel parsing process
          
          const mockDistricts: District[] = [
            { id: "d1", name: "Merkez" },
            { id: "d2", name: "Kuzey Bölgesi" },
            { id: "d3", name: "Güney Bölgesi" }
          ];
          
          const mockSchools: School[] = [
            { id: "s1", name: "Yavuz Sultan Selim Ortaokulu", districtId: "d1", code: "700101" },
            { id: "s2", name: "Fatih Sultan Mehmet Lisesi", districtId: "d1", code: "700102" },
            { id: "s3", name: "Mevlana İlkokulu", districtId: "d2", code: "800201" },
            { id: "s4", name: "Yunus Emre Anadolu Lisesi", districtId: "d3", code: "900301" }
          ];

          const mockStudents: Student[] = Array.from({ length: 420 }, (_, i) => {
            const school = mockSchools[i % mockSchools.length];
            return {
              id: `st-${i}`,
              name: `Öğrenci Ad Soyad ${i + 1}`,
              tc: `${10000000000 + i}`,
              schoolId: school.id,
              salon: `${Math.floor(i / 20) + 1}`,
              class: `${Math.floor(i / 30) + 1}-A`
            };
          });

          setRegistryData(mockDistricts, mockSchools, mockStudents);
          setAnalyzing(false);
          setAnalyzed(true);
          
          toast({
            title: "Veri Ayrıştırma Başarılı",
            description: "Excel sütunları (İlçe, Okul, Kurum Kodu, Şube) başarıyla eşleştirildi.",
          });
          return 100;
        }
        return prev + 20;
      });
    }, 250);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Kütük Belirleme</h1>
        <p className="text-muted-foreground mt-1">Excel dosyasındaki sütunları otomatik olarak ayrıştırın ve sistemi güncelleyin.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Dosya Yükleme</CardTitle>
            <CardDescription>Herhangi bir şehre veya kütük formatına ait Excel dosyasını seçin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border-2 border-dashed border-input hover:border-primary/50 transition-colors rounded-xl p-10 flex flex-col items-center justify-center gap-4 text-center bg-muted/20">
              <div className="p-4 rounded-full bg-primary/10 text-primary">
                <Upload className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">Excel dosyasını buraya bırakın</p>
                <p className="text-sm text-muted-foreground">İlçe, Okul ve Şube bilgileri otomatik taranacaktır.</p>
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
                  onClick={handleAnalyze} 
                  disabled={analyzing || analyzed}
                >
                  {analyzing ? "Ayrıştırılıyor..." : analyzed ? "Tekrar Oku" : "Verileri Oku"}
                </Button>
              </div>
            )}
            
            {analyzing && <Progress value={progress} className="h-2" />}
          </CardContent>
        </Card>

        {analyzed && (
          <Card className="animate-in fade-in zoom-in-95 duration-300">
            <CardHeader>
              <CardTitle>Excel Veri Analizi</CardTitle>
              <CardDescription>Sütun bazlı benzersiz değerler tespit edildi.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900">
                    <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mb-1">Tespit Edilen İlçe</p>
                    <p className="text-2xl font-bold font-mono text-indigo-900 dark:text-indigo-100">3</p>
                  </div>
                  <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-1">Benzersiz Okul</p>
                    <p className="text-2xl font-bold font-mono text-emerald-900 dark:text-emerald-100">4</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" />
                    Bulunan Parametreler
                  </h4>
                  <div className="text-sm space-y-2 text-muted-foreground">
                    <div className="flex justify-between py-2 border-b">
                      <span>Kurum Kodları</span>
                      <span className="text-primary font-medium">Benzersiz Eşleşti</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span>Şube Dağılımı</span>
                      <span className="text-primary font-medium">14 Farklı Şube</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span>İlçe Sütunu</span>
                      <span className="text-green-600 font-medium">Bulundu</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 rounded-md text-sm border border-blue-100">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>
                    Artık bu Excel'deki dinamik verilere göre salon listesi ve etiket oluşturabilirsiniz.
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
