import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

export default function RegistryUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

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
    
    // Mock simulation
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setAnalyzing(false);
          setAnalyzed(true);
          toast({
            title: "Kütük Analizi Tamamlandı",
            description: "Dosya başarıyla okundu ve özet bilgiler çıkarıldı.",
          });
          return 100;
        }
        return prev + 15;
      });
    }, 400);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Kütük Belirleme</h1>
        <p className="text-muted-foreground mt-1">Sınav kütük dosyasını yükleyin ve analiz edin.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Dosya Yükleme</CardTitle>
            <CardDescription>Excel formatındaki (.xls, .xlsx) kütük dosyasını seçin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border-2 border-dashed border-input hover:border-primary/50 transition-colors rounded-xl p-10 flex flex-col items-center justify-center gap-4 text-center bg-muted/20">
              <div className="p-4 rounded-full bg-primary/10 text-primary">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <p className="font-medium">Dosyayı buraya sürükleyin</p>
                <p className="text-sm text-muted-foreground mt-1">veya bilgisayarınızdan seçin</p>
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
                  {analyzing ? "Analiz Ediliyor..." : analyzed ? "Tekrar Analiz Et" : "Analiz Et"}
                </Button>
              </div>
            )}
            
            {analyzing && <Progress value={progress} className="h-2" />}
          </CardContent>
        </Card>

        {analyzed && (
          <Card className="animate-in fade-in zoom-in-95 duration-300">
            <CardHeader>
              <CardTitle>Kütük Özeti</CardTitle>
              <CardDescription>Yüklenen dosyanın içeriği hakkında bilgiler.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">Toplam Öğrenci</p>
                    <p className="text-2xl font-bold font-mono text-blue-900 dark:text-blue-100">12,450</p>
                  </div>
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900">
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">Toplam Okul</p>
                    <p className="text-2xl font-bold font-mono text-green-900 dark:text-green-100">84</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    Veri Bütünlüğü Kontrolü
                  </h4>
                  <div className="text-sm space-y-2 text-muted-foreground">
                    <div className="flex justify-between py-2 border-b">
                      <span>TC Kimlik No Kontrolü</span>
                      <span className="text-green-600 font-medium">Geçerli</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span>Okul Kodları</span>
                      <span className="text-green-600 font-medium">Tam</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span>Salon Atamaları</span>
                      <span className="text-yellow-600 font-medium">Eksik (3 okul)</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200 rounded-md text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>
                    Kütükte 3 okulda salon ataması yapılmamış görünüyor. Kütük bölme işlemine devam edebilirsiniz ancak salon listeleri eksik çıkabilir.
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
