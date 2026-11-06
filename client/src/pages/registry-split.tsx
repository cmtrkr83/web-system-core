import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, AlertCircle, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRegistry } from "@/context/RegistryContext";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import JSZip from "jszip";

export default function RegistrySplit() {
  const [bulkSaving, setBulkSaving] = useState(false);
  const { toast } = useToast();
  const { districts, schools, students, isLoaded } = useRegistry();

  const specialKeywords = [
    "zihinsel",
    "otistik",
    "özel eğitim",
    "özel eğitim sınıfı",
    "hafif",
    "ağır",
    "özel gereksinimli",
    "özel gereksinim",
    "özel eğitim ihtiyacı",
  ];

  const handlePrintAllDistricts = async () => {
    if (!isLoaded || districtList.length === 0) {
      toast({
        title: "Hata",
        description: "Kaydedilecek ilçe verisi bulunamadı.",
        variant: "destructive"
      });
      return;
    }

    setBulkSaving(true);
    try {
      const zip = new JSZip();
      let successCount = 0;

      for (const district of districtList) {
        const pdfBlob = await generateDistrictPdf(district.id, district.name);
        zip.file(`${toSafeFileName(district.name)}-Kutuk.pdf`, pdfBlob);
        successCount += 1;
      }

      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = "ilce-kutuk-raporlari.zip";
      anchor.click();
      URL.revokeObjectURL(downloadUrl);

      toast({
        title: "ZIP indirildi",
        description: `${successCount} ilçe raporu tek ZIP dosyasında hazırlandı.`,
      });
    } catch (error) {
      console.error("Toplu ilçe raporu oluşturma hatası:", error);
      toast({
        title: "Hata",
        description: "İlçe raporları ZIP dosyası oluşturulurken bir hata oluştu.",
        variant: "destructive",
      });
    } finally {
      setBulkSaving(false);
    }
  };

  const toSafeFileName = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLocaleLowerCase("en-US") || "ilce";

  const handlePrintTable = () => {
    try {
      if (!isLoaded || districtList.length === 0) {
        toast({
          title: "Hata",
          description: "Yazdırılacak veri bulunamadı.",
          variant: "destructive"
        });
        return;
      }

      // Create HTML table for all districts
      const totalSchools = districtList.reduce((sum, d) => sum + d.schools, 0);
      const totalSubes = districtList.reduce((sum, d) => sum + d.subes, 0);
      
      const htmlContent = `
        <div style="box-sizing: border-box; width: 100%; min-height: 1040px; font-family: Arial, sans-serif; font-size: 9px; padding: 48px 36px 40px; background: white; color: #111;">
          <h2 style="text-align: center; margin: 0 0 6px; font-size: 15px; font-weight: 700;">İlçe Bazlı Kütük Listesi</h2>
          <p style="text-align: center; font-size: 9px; margin: 0 0 14px; color: #555;">
            Toplam İlçe: ${districtList.length} | Toplam Okul: ${totalSchools} | Toplam Şube: ${totalSubes}
          </p>
          <table style="width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9px; line-height: 1.25;">
            <thead>
              <tr style="background-color: #e9ecef; border: 1px solid #555;">
                <th style="border: 1px solid #555; padding: 6px 5px; text-align:left; width: 40%;">İlçe Adı</th>
                <th style="border: 1px solid #555; padding: 6px 4px; text-align:center; width: 15%;">Okul Sayısı</th>
                <th style="border: 1px solid #555; padding: 6px 4px; text-align:center; width: 15%;">Şube Sayısı</th>
                <th style="border: 1px solid #555; padding: 6px 4px; text-align:center; width: 15%;">Öğrenci Sayısı</th>
                <th style="border: 1px solid #555; padding: 6px 4px; text-align:center; width: 15%;">Özel Öğrenci Sayısı</th>
              </tr>
            </thead>
            <tbody>
              ${districtList
                .map(
                  (district, idx) => `
                <tr style="border: 1px solid #aaa; ${idx % 2 === 0 ? 'background-color: #fafafa;' : ''}">
                  <td style="border: 1px solid #aaa; padding: 5px; text-align:left; vertical-align: middle; overflow-wrap:anywhere; word-break:break-word;">${district.name}</td>
                  <td style="border: 1px solid #aaa; padding: 5px 4px; text-align:center; vertical-align: middle;">${district.schools}</td>
                  <td style="border: 1px solid #aaa; padding: 5px 4px; text-align:center; vertical-align: middle;">${district.subes}</td>
                  <td style="border: 1px solid #aaa; padding: 5px 4px; text-align:center; vertical-align: middle;">${district.students.toLocaleString()}</td>
                  <td style="border: 1px solid #aaa; padding: 5px 4px; text-align:center; vertical-align: middle;">${district.specialStudents.toLocaleString()}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
          <p style="margin-top: 14px; font-size: 8px; color: #666; text-align: right;">
            ${new Date().toLocaleDateString('tr-TR')}
          </p>
        </div>
      `;

      const printWindow = window.open('', '_blank', 'width=1024,height=768');

      if (!printWindow) {
        toast({
          title: "Hata",
          description: "Yazdırma penceresi açılamadı. Tarayıcı engellemiş olabilir.",
          variant: "destructive"
        });
        return;
      }

      printWindow.document.write(`
        <!doctype html>
        <html lang="tr">
        <head>
          <meta charset="utf-8" />
          <title>İlçe Bazlı Kütük Listesi</title>
          <style>
            @page { size: A4 portrait; margin: 18mm; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, sans-serif; }
            body { max-width: 100%; }
            table { width: 100%; table-layout: fixed; border-collapse: collapse; }
            th, td { overflow-wrap: anywhere; word-break: break-word; }
          </style>
        </head>
        <body style="font-size:9pt;">${htmlContent}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();

      toast({
        title: "Yazdırma Açıldı",
        description: "İlçe listesi başarıyla yazdırıldı.",
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "Yazdırma sırasında bir hata oluştu.",
        variant: "destructive"
      });
    }
  };

  const getDistrictSchoolData = (districtId: string) => {
    const districtSchools = schools
      .filter(s => s.districtId === districtId)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));

    return districtSchools.map((school, index) => {
      const classes = new Set(
        students
          .filter(s => s.schoolId === school.id)
          .map(s => s.class)
          .filter(Boolean)
      );

      const studentCount = students.filter(s => s.schoolId === school.id).length;

      return {
        sira: index + 1,
        name: school.name,
        code: school.code || school.id,
        classes: classes.size,
        students: studentCount
      };
    });
  };

  const buildDistrictHtmlTable = (districtName: string, schoolData: Array<{ sira: number; name: string; code: string; classes: number; students: number }>) => {
    const totalStudents = schoolData.reduce((sum, s) => sum + s.students, 0);
    const totalClasses = schoolData.reduce((sum, s) => sum + s.classes, 0);
    return `
      <div style="box-sizing: border-box; width: 100%; min-height: 1040px; font-family: Arial, sans-serif; font-size: 9px; padding: 48px 36px 40px; background: white; color: #111;">
        <h2 style="text-align: center; margin: 0 0 6px; font-size: 15px; font-weight: 700;">${districtName} İlçesi - Kütük Listesi</h2>
        <p style="text-align: center; font-size: 9px; margin: 0 0 14px; color: #555;">
          Toplam Okul: ${schoolData.length} | Toplam Şube: ${totalClasses} | Toplam Öğrenci: ${totalStudents}
        </p>
        <table style="width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9px; line-height: 1.25;">
          <thead>
            <tr style="background-color: #e9ecef; border: 1px solid #555;">
              <th style="border: 1px solid #555; padding: 6px 4px; text-align:center; width: 6%;">Sıra</th>
              <th style="border: 1px solid #555; padding: 6px 4px; text-align:center; width: 18%;">Kurum Kodu</th>
              <th style="border: 1px solid #555; padding: 6px 5px; text-align:left; width: 46%;">Okul Adı</th>
              <th style="border: 1px solid #555; padding: 6px 4px; text-align:center; width: 15%;">Şube Sayısı</th>
              <th style="border: 1px solid #555; padding: 6px 4px; text-align:center; width: 15%;">Öğrenci Sayısı</th>
            </tr>
          </thead>
          <tbody>
            ${schoolData
              .map(
                (school, idx) => `
              <tr style="border: 1px solid #aaa; ${idx % 2 === 0 ? 'background-color: #fafafa;' : ''}">
                <td style="border: 1px solid #aaa; padding: 5px 4px; text-align:center; vertical-align: middle;">${school.sira}</td>
                <td style="border: 1px solid #aaa; padding: 5px 4px; text-align:center; vertical-align: middle; overflow-wrap:anywhere;">${school.code}</td>
                <td style="border: 1px solid #aaa; padding: 5px; text-align:left; vertical-align: middle; overflow-wrap:anywhere; word-break:break-word;">${school.name}</td>
                <td style="border: 1px solid #aaa; padding: 5px 4px; text-align:center; vertical-align: middle;">${school.classes}</td>
                <td style="border: 1px solid #aaa; padding: 5px 4px; text-align:center; vertical-align: middle;">${school.students}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
        <p style="margin-top: 14px; font-size: 8px; color: #666; text-align: right;">
          ${new Date().toLocaleDateString('tr-TR')}
        </p>
      </div>
    `;
  };

  const handlePrintDistrictHtml = (districtId: string, districtName: string) => {
    const schoolData = getDistrictSchoolData(districtId);
    if (schoolData.length === 0) {
      toast({
        title: "Hata",
        description: "Yazdırılacak okul verisi bulunamadı.",
        variant: "destructive"
      });
      return;
    }

    const htmlContent = buildDistrictHtmlTable(districtName, schoolData);
    const printWindow = window.open('', '_blank', 'width=1024,height=768');

    if (!printWindow) {
      toast({
        title: "Hata",
        description: "Yazdırma penceresi açılamadı. Tarayıcı engellemiş olabilir.",
        variant: "destructive"
      });
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <title>${districtName} - Kütük Listesi</title>
        <style>
          @page { size: A4 portrait; margin: 18mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, sans-serif; }
          body { max-width: 100%; }
          table { width: 100%; table-layout: fixed; border-collapse: collapse; }
          th, td { overflow-wrap: anywhere; word-break: break-word; }
        </style>
      </head>
      <body style="font-size:9pt;">${htmlContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    try {
      printWindow.print();
      toast({ title: "Başarılı", description: `"${districtName}" yazdırılıyor.` });
    } catch {
      toast({ title: "Hata", description: "Yazdırma sırasında hata oluştu.", variant: "destructive" });
    }
  };

  const generateDistrictPdf = async (districtId: string, districtName: string): Promise<Blob> => {
    const schoolData = getDistrictSchoolData(districtId);
    if (schoolData.length === 0) {
      throw new Error("Yazdırılacak okul verisi bulunamadı.");
    }

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = buildDistrictHtmlTable(districtName, schoolData);
    tempDiv.style.position = "absolute";
    tempDiv.style.left = "-10000px";
    tempDiv.style.top = "0";
    tempDiv.style.width = "680px";
    document.body.appendChild(tempDiv);

    try {
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF("p", "mm", "a4");
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      return pdf.output("blob");
    } finally {
      tempDiv.remove();
    }
  };

  const handleDownload = async (districtId: string, districtName: string) => {
    try {
      const pdfBlob = await generateDistrictPdf(districtId, districtName);
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `${toSafeFileName(districtName)}-Kutuk.pdf`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
      toast({
        title: "PDF indirildi",
        description: `${districtName} ilçesi kütüğü başarıyla indirildi.`,
      });
      return true;
    } catch (error) {
      console.error("İlçe PDF oluşturma hatası:", error);
      toast({
        title: "Hata",
        description: error instanceof Error ? error.message : "PDF oluşturulurken bir hata oluştu.",
        variant: "destructive",
      });
      return false;
    }
  };

  const districtList = isLoaded 
    ? districts.map(d => {
        const districtStudents = students.filter(s => {
          const school = schools.find(sch => sch.id === s.schoolId);
          return school?.districtId === d.id;
        });
        const subeCount = new Set(districtStudents.map(s => `${s.schoolId}#${s.class}`)).size;
        
        return {
          id: d.id,
          name: d.name,
          schools: schools.filter(s => s.districtId === d.id).length,
          subes: subeCount,
          students: districtStudents.length,
          specialStudents: districtStudents.filter((st) => {
            const school = schools.find(sch => sch.id === st.schoolId);
            if (!school) return false;

            const schoolNameLower = school.name.toLocaleLowerCase("tr-TR");
            const classLower = String(st.class ?? "").toLocaleLowerCase("tr-TR");

            if (schoolNameLower.includes("kademe")) {
              return true;
            }

            return specialKeywords.some(keyword => classLower.includes(keyword));
          }).length,
        };
      })
    : [];

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">İl Genel Durum Bilgisi</h1>
          <p className="mt-1 text-body-regular text-text-secondary">Ana kütük dosyasını ilçe bazlı alt dosyalara ayırın.</p>
        </div>
        {isLoaded && districtList.length > 0 && (
          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
            {districtList.length} ilçe hazır
          </Badge>
        )}
      </div>

      <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/10 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">İlçe Listesi</CardTitle>
              <CardDescription>{isLoaded ? `${districtList.length} ilçe tespit edildi` : "Henüz Excel dosyası yüklenmemiş"}</CardDescription>
            </div>
            <div className="inline-flex items-center rounded-xl border border-border/70 bg-background p-1 shadow-sm">
              <Button
                onClick={handlePrintTable}
                disabled={!isLoaded || districtList.length === 0}
                variant="ghost"
                className="h-9 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Printer className="mr-2 h-4 w-4" />
                İl Raporu
              </Button>
              <span className="h-5 w-px bg-border" aria-hidden="true" />
              <Button
                onClick={handlePrintAllDistricts}
                disabled={bulkSaving || !isLoaded || districtList.length === 0}
                variant="ghost"
                className="h-9 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {bulkSaving ? (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Kaydediliyor...
                  </>
                ) : (
                  <>
                    <Printer className="mr-2 h-4 w-4" />
                    Tüm İlçeler
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!isLoaded ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Henüz Veri Yüklenmemiş</h3>
              <p className="text-muted-foreground max-w-md">
                Kütük bölme işlemine başlamadan önce Excel dosyasını Başlangıç sayfasından yükleyiniz.
              </p>
            </div>
          ) : districtList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">İlçe Verisi Bulunamadı</h3>
              <p className="text-muted-foreground">
                Yüklenen Excel dosyasında ilçe bilgisi bulunmuyor.
              </p>
            </div>
          ) : (
            <Table className="text-sm">
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-muted/40">
                  <TableHead className="h-12 px-4 text-xs font-semibold uppercase tracking-wide">İlçe Adı</TableHead>
                  <TableHead className="h-12 text-right text-xs font-semibold uppercase tracking-wide">Okul</TableHead>
                  <TableHead className="h-12 text-right text-xs font-semibold uppercase tracking-wide">Şube</TableHead>
                  <TableHead className="h-12 text-right text-xs font-semibold uppercase tracking-wide">Öğrenci</TableHead>
                  <TableHead className="h-12 text-right text-xs font-semibold uppercase tracking-wide">Özel Öğrenci</TableHead>
                  <TableHead className="h-12 px-4 text-right text-xs font-semibold uppercase tracking-wide">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {districtList.map((district) => (
                  <TableRow key={district.id} className="group border-border/60 hover:bg-primary/[0.03]">
                      <TableCell className="px-4 py-4">
                        <span className="font-medium text-foreground">{district.name}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{district.schools.toLocaleString("tr-TR")}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{district.subes.toLocaleString("tr-TR")}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-foreground">{district.students.toLocaleString("tr-TR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{district.specialStudents.toLocaleString("tr-TR")}</TableCell>
                      <TableCell className="px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg opacity-80 transition-opacity group-hover:opacity-100"
                          onClick={() => handlePrintDistrictHtml(district.id, district.name)}
                        >
                          <Printer className="mr-2 h-4 w-4" />
                          HTML Yazdır
                        </Button>
                      </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
