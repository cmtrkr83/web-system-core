import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, FileCheck, FileSignature } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useRegistry } from "@/context/RegistryContext";

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
  const { districts, schools, students, isLoaded } = useRegistry();
  const [generated, setGenerated] = useState(false);
  const [selectedDistrictForSchool, setSelectedDistrictForSchool] = useState<string>("all");
  const [isBlankTemplate, setIsBlankTemplate] = useState(false);

  const saveHtmlAsPdf = async (html: string, fileName: string) => {
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
  };

  const saveHtmlPagesAsPdf = async (htmlPages: string[], fileName: string) => {
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
  ) => `
    <div style="font-family: Arial, sans-serif; color:#111; padding: 20px; width: 1083px; box-sizing: border-box;">
      <div style="text-align:center; font-size: 20px; font-weight: 700; margin-bottom: 12px;">SINAV EVRAKLARI TESLİM TUTANAĞI</div>
      <div style="text-align:right; font-size: 12px; margin-bottom: 4px;">${pageNumber}/${totalPages}</div>
      <div style="font-size: 14px; margin-bottom: 8px;">Sınav Adı : .............................................................................................................</div>
      <div style="font-size: 14px; margin-bottom: 14px;">Sınav Tarihi : ..........................................................................................................................</div>
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
      alert("Lütfen önce veri yükleyin.");
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
    const html = buildReportHtml("İlçe / Okul Adı", tableData, false, 1, 1);
    // PDF'i kaydet
    const today = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    await saveHtmlAsPdf(html, `Ilce_Teslim_Tutanagi_${today.replace(/\./g, "-")}.pdf`);
    setGenerated(true);
  };

  // Okul tutanağı oluştur
  const handleCreateSchoolReport = async () => {
    // Boş şablon ise veri kontrolü yapma
    if (!isBlankTemplate && (!isLoaded || schools.length === 0)) {
      alert("Lütfen önce veri yükleyin veya boş şablon seçeneğini işaretleyin.");
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
    const htmlPages = rowChunks.map((rows, index) =>
      buildReportHtml("İlçe / Okul Adı", rows, true, index + 1, totalPages),
    );
    // PDF'i kaydet
    const today = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const districtName = !isBlankTemplate && selectedDistrictForSchool !== "all" 
      ? sanitizeFileName(districts.find(d => d.id === selectedDistrictForSchool)?.name || "Ilce")
      : isBlankTemplate ? "Bos_Sablon" : "Tum_Ilceler";
    
    const filename = `Okul_Teslim_Tutanagi_${districtName.replace(/\s+/g, "_")}_${today.replace(/\./g, "-")}.pdf`;
    await saveHtmlPagesAsPdf(htmlPages, filename);
    setGenerated(true);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Teslim Tutanakları</h1>
        <p className="text-muted-foreground mt-1">Sınav evrakları için ilçe ve okul teslim tutanaklarını oluşturun.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
             <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-2">
                <FileSignature className="w-6 h-6 text-blue-600 dark:text-blue-400" />
             </div>
             <CardTitle>İlçe Teslim Tutanağı</CardTitle>
             <CardDescription>İlçelerden merkeze teslim edilecek evraklar için.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bu tutanak, ODM ile ilçe milli eğitim müdürlüklerinin sınav evraklarını teslim ederken ya da teslim alırken kullanacakları belgedir.
            </p>
            <div className="bg-muted p-4 rounded-md text-sm">
              <ul className="list-disc list-inside space-y-1">
                <li>İlçe adı</li>
                <li>Poşet sayısı</li>
                <li>Teslim eden/alan bilgileri</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleCreateDistrictReport} disabled={!isLoaded || districts.length === 0}>
              İlçe Tutanağı Oluştur
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
             <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mb-2">
                <FileCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
             </div>
             <CardTitle>Okul Teslim Tutanağı</CardTitle>
             <CardDescription>İlçe Müdürlüklerinden okullara teslim edilecek evraklar için.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bu tutanak, İlçe müdürlüklerinin sınav evraklarını okul müdürlüklerine teslim ederken kullanacakları belgedir.
            </p>
            <div className="space-y-4">
               <div className="space-y-2">
                <Label>İlçe Filtresi</Label>
                <Select value={selectedDistrictForSchool} onValueChange={setSelectedDistrictForSchool}>
                  <SelectTrigger>
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
               <div className="flex items-center space-x-2">
                  <Checkbox id="blank" checked={isBlankTemplate} onCheckedChange={(checked) => setIsBlankTemplate(checked === true)} />
                  <Label htmlFor="blank">Boş Şablon Olarak İndir</Label>
               </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="secondary" onClick={handleCreateSchoolReport} disabled={!isBlankTemplate && (!isLoaded || schools.length === 0)}>
              Okul Tutanaklarını Oluştur
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
