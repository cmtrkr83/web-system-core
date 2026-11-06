import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, FileCheck, FileSignature, MapPin, FileDown } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useRegistry } from "@/context/RegistryContext";
import { useToast } from "@/hooks/use-toast";

const sanitizeFileName = (text: string): string =>
  text
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "S")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .replace(/\s+/g, "_");

export default function Reports() {
  const { toast } = useToast();
  const { districts, schools, students, isLoaded, exams, selectedExamId } = useRegistry();
  const selectedExam = exams.find((e) => e.id === selectedExamId);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const [generated, setGenerated] = useState(false);
  const [selectedDistrictForSchool, setSelectedDistrictForSchool] = useState<string>("all");
  const [isBlankTemplate, setIsBlankTemplate] = useState(false);

  const saveHtmlAsPdf = async (html: string, fileName: string) => {
    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      tempDiv.style.position = "absolute";
      tempDiv.style.left = "-9999px";
      tempDiv.style.top = "0";
      tempDiv.style.width = "1123px";
      tempDiv.style.background = "#fff";
      document.body.appendChild(tempDiv);

      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF("l", "mm", "a4");
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = 277;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
      pdf.save(fileName);

      document.body.removeChild(tempDiv);
    } catch (error) {
      toast({ title: "Hata", description: "PDF oluşturulamadı.", variant: "destructive" });
    }
  };

  const saveHtmlPagesAsPdf = async (htmlPages: string[], fileName: string) => {
    try {
      const pdf = new jsPDF("l", "mm", "a4");

      for (let i = 0; i < htmlPages.length; i++) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlPages[i];
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-9999px";
        tempDiv.style.top = "0";
        tempDiv.style.width = "1123px";
        tempDiv.style.background = "#fff";
        document.body.appendChild(tempDiv);

        const canvas = await html2canvas(tempDiv, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/png");
        const imgWidth = 277;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (i > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);

        document.body.removeChild(tempDiv);
      }

      pdf.save(fileName);
    } catch (error) {
      toast({ title: "Hata", description: "PDF oluşturulamadı.", variant: "destructive" });
    }
  };

  const chunkRows = (rows: string[][], chunkSize: number): string[][][] => {
    const chunks: string[][][] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      chunks.push(rows.slice(i, i + chunkSize));
    }
    return chunks;
  };

  const buildReportHtml = (
    firstColumnTitle: string,
    rows: string[][],
    fixedTwoLineRows = false,
    pageNumber = 1,
    totalPages = 1,
    examName = ".............................................................................................................",
    examDate = "........................................................................................................................",
    districtName = "",
  ) => `
    <div style="font-family: Arial, sans-serif; color:#111; padding: 20px; width: 1083px; box-sizing: border-box;">
      ${districtName ? `<div style="text-align:center; font-size: 15px; font-weight: 600; margin-bottom: 6px;">${districtName} İLÇESİ</div>` : ""}
      <div style="text-align:center; font-size: 20px; font-weight: 700; margin-bottom: 12px;">SINAV EVRAKLARI TESLİM TUTANAĞI</div>
      <div style="text-align:right; font-size: 12px; margin-bottom: 4px;">${pageNumber}/${totalPages}</div>
      <div style="font-size: 14px; margin-bottom: 8px;">Sınav Adı : ${examName}</div>
      <div style="font-size: 14px; margin-bottom: 14px;">Sınav Tarihi : ${examDate}</div>
      <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px;">
        <thead>
          <tr>
            <th style="border:1px solid #000; padding:9px; width:18.42%; text-align:left;">${firstColumnTitle}</th>
            <th style="border:1px solid #000; padding:9px; width:34.21%; text-align:center;">Teslim Eden / Alan</th>
            <th style="border:1px solid #000; padding:9px; width:15.79%; text-align:center;">Kutu / Evrak Sayısı</th>
            <th style="border:1px solid #000; padding:9px; width:21.05%; text-align:center;">Teslim Tarihi Saati</th>
            <th style="border:1px solid #000; padding:9px; width:10.53%; text-align:center;">İmza</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td style="border:1px solid #000; padding:9px; vertical-align: middle; ${fixedTwoLineRows ? "height: 44px; line-height: 1.3;" : ""}">${row[0] || ""}</td>
                  <td style="border:1px solid #000; padding:9px; vertical-align: middle; ${fixedTwoLineRows ? "height: 44px; line-height: 1.3;" : ""}">${row[1] || ""}</td>
                  <td style="border:1px solid #000; padding:9px; text-align:center; vertical-align: middle; ${fixedTwoLineRows ? "height: 44px; line-height: 1.3;" : ""}">${row[2] || ""}</td>
                  <td style="border:1px solid #000; padding:9px; text-align:center; vertical-align: middle; ${fixedTwoLineRows ? "height: 44px; line-height: 1.3;" : ""}">${row[3] || ""}</td>
                  <td style="border:1px solid #000; padding:9px; text-align:center; vertical-align: middle; ${fixedTwoLineRows ? "height: 44px; line-height: 1.3;" : ""}">${row[4] || ""}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  // İlçe tutanağı oluştur
  const handleCreateDistrictReport = async () => {
    if (!isLoaded || districts.length === 0) {
      toast({ title: "Veri yok", description: "Lütfen önce veri yükleyin.", variant: "destructive" });
      return;
    }

    // Tablo verileri
    const tableData = districts.map((district) => {
      return [
        district.name,
        "",
        "",
        "",
        ""
      ];
    });
    const html = buildReportHtml(
      "İlçe / Okul Adı",
      tableData,
      false,
      1,
      1,
      selectedExam?.name,
      selectedExam ? formatDate(selectedExam.date) : undefined,
      "",
    );
    // PDF'i kaydet
    const today = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    await saveHtmlAsPdf(html, `Ilce_Teslim_Tutanagi_${today.replace(/\./g, "-")}.pdf`);
    setGenerated(true);
    toast({ title: "Başarılı", description: "İlçe teslim tutanağı PDF olarak kaydedildi." });
  };

  // Okul tutanağı oluştur
  const handleCreateSchoolReport = async () => {
    // Boş şablon ise veri kontrolü yapma
    if (!isBlankTemplate && (!isLoaded || schools.length === 0)) {
      toast({ title: "Veri yok", description: "Lütfen önce veri yükleyin veya boş şablon seçeneğini işaretleyin.", variant: "destructive" });
      return;
    }

    // Tablo verileri
    const tableData = isBlankTemplate 
      ? Array.from({ length: 20 }, (_, index) => [
          "",
          "",
          "",
          "",
          ""
        ])
      : (() => {
          // Filtreleme
          let filteredSchools = schools;
          if (selectedDistrictForSchool !== "all") {
            filteredSchools = schools.filter(s => s.districtId === selectedDistrictForSchool);
          }
          
          return filteredSchools.map((school) => {
            return [
              school.name,
              "",
              "",
              "",
              ""
            ];
          });
        })();
    const rowChunks = chunkRows(tableData, 10);
    const totalPages = rowChunks.length;
    const htmlPages = rowChunks.map((rows, index) => {
      const districtLabel =
        !isBlankTemplate && selectedDistrictForSchool !== "all"
          ? (districts.find((d) => d.id === selectedDistrictForSchool)?.name ?? "")
          : "";
      return buildReportHtml(
        "İlçe / Okul Adı",
        rows,
        true,
        index + 1,
        totalPages,
        selectedExam?.name,
        selectedExam ? formatDate(selectedExam.date) : undefined,
        districtLabel,
      );
    });
    // PDF'i kaydet
    const today = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const districtName = !isBlankTemplate && selectedDistrictForSchool !== "all" 
      ? sanitizeFileName(districts.find(d => d.id === selectedDistrictForSchool)?.name || "Ilce")
      : isBlankTemplate ? "Bos_Sablon" : "Tum_Ilceler";
    
    const filename = `Okul_Teslim_Tutanagi_${districtName.replace(/\s+/g, "_")}_${today.replace(/\./g, "-")}.pdf`;
    await saveHtmlPagesAsPdf(htmlPages, filename);
    setGenerated(true);
    toast({ title: "Başarılı", description: "Okul teslim tutanağı PDF olarak kaydedildi." });
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-title-1-semibold text-text-primary">Teslim Tutanakları</h1>
          <p className="text-muted-foreground mt-1">Sınav evrakları için ilçe ve okul teslim tutanaklarını oluşturun.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
          <ClipboardCheck className="h-3.5 w-3.5" />
          {generated ? "Son belge hazır" : "Belge üretmeye hazır"}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card className="flex h-full flex-col overflow-hidden rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20 pb-5">
             <div className="flex items-start gap-3">
               <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                  <FileSignature className="w-5 h-5" />
               </div>
               <div>
                 <CardTitle className="text-base">İlçe Teslim Tutanağı</CardTitle>
                 <CardDescription>İlçelerden merkeze teslim edilecek evraklar için.</CardDescription>
               </div>
             </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-4 p-5">
            <p className="text-sm text-muted-foreground">
              Bu tutanak, ODM ile ilçe milli eğitim müdürlüklerinin sınav evraklarını teslim ederken ya da teslim alırken kullanacakları belgedir.
            </p>
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm">
              <ul className="space-y-2 text-muted-foreground">
                <li>İlçe adı</li>
                <li>Poşet sayısı</li>
                <li>Teslim eden/alan bilgileri</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="mt-auto border-t border-border/60 bg-muted/10 p-5">
            <Button className="w-full rounded-xl shadow-sm" onClick={handleCreateDistrictReport} disabled={!isLoaded || districts.length === 0}>
              <FileDown className="mr-2 h-4 w-4" />
              İlçe Tutanağı Oluştur
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex h-full flex-col overflow-hidden rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20 pb-5">
             <div className="flex items-start gap-3">
               <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                    <FileCheck className="w-5 h-5" />
               </div>
               <div>
                 <CardTitle className="text-base">Okul Teslim Tutanağı</CardTitle>
                 <CardDescription>İlçe müdürlüklerinden okullara teslim edilecek evraklar için.</CardDescription>
               </div>
             </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-5 p-5">
            <p className="text-sm text-muted-foreground">
              Bu tutanak, İlçe müdürlüklerinin sınav evraklarını okul müdürlüklerine teslim ederken kullanacakları belgedir.
            </p>
            <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
               <div className="space-y-2.5">
                <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    İlçe Filtresi
                </Label>
                <Select value={selectedDistrictForSchool} onValueChange={setSelectedDistrictForSchool}>
                    <SelectTrigger className="h-11 rounded-xl border-border/70 bg-background shadow-sm transition-colors hover:border-primary/50 focus:ring-2 focus:ring-primary/20">
                    <SelectValue placeholder="Tüm İlçeler" />
                    </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm İlçeler</SelectItem>
                    {districts.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
               </div>
               <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3">
                  <Checkbox id="blank" className="mt-0.5" checked={isBlankTemplate} onCheckedChange={(checked) => setIsBlankTemplate(checked === true)} />
                  <div className="space-y-0.5">
                    <Label htmlFor="blank" className="cursor-pointer font-medium">Boş şablon olarak indir</Label>
                    <p className="text-xs text-muted-foreground">Okul adları olmadan boş tutanak sayfaları oluşturur.</p>
                  </div>
               </div>
            </div>
          </CardContent>
          <CardFooter className="mt-auto border-t border-border/60 bg-muted/10 p-5">
            <Button className="w-full rounded-xl shadow-sm" onClick={handleCreateSchoolReport} disabled={!isBlankTemplate && (!isLoaded || schools.length === 0)}>
              <FileDown className="mr-2 h-4 w-4" />
              Okul Tutanaklarını Oluştur
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
