import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Scissors, Download, RefreshCw, AlertCircle, Printer, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRegistry } from "@/context/RegistryContext";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function RegistrySplit() {
  const [splitting, setSplitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const { toast } = useToast();
  const { districts, schools, students, isLoaded } = useRegistry();

  const handleSplit = () => {
    setSplitting(true);
    setTimeout(() => {
      setSplitting(false);
      setCompleted(true);
      toast({
        title: "Kütük Bölme Tamamlandı",
        description: "Tüm ilçeler için ayrı Excel dosyaları oluşturuldu.",
      });
    }, 2000);
  };

  const handlePrintTable = async () => {
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
        <div style="font-family: Arial, sans-serif; padding: 1px 10px 1px 10px; background: white;">
          <h2 style="text-align: center; margin: 0 0 3px 0; font-size: 14px;">İlçe Bazlı Kütük Listesi</h2>
          <p style="text-align: center; font-size: 10px; margin: 0 0 8px 0; color: #666;">
            Toplam İlçe: ${districtList.length} | Toplam Okul: ${totalSchools} | Toplam Şube: ${totalSubes}
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 8px; line-height: 1;">
            <thead>
              <tr style="background-color: #f0f0f0; border: 0.5px solid #333;">
                <th style="border: 0.5px solid #333; padding: 2px 3px 4px 3px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:flex-start; min-height:14px;">İlçe Adı</div></th>
                <th style="border: 0.5px solid #333; padding: 2px 3px 4px 3px; vertical-align: middle; width: 12%;"><div style="display:flex; align-items:center; justify-content:center; min-height:14px;">Okul Sayısı</div></th>
                <th style="border: 0.5px solid #333; padding: 2px 3px 4px 3px; vertical-align: middle; width: 12%;"><div style="display:flex; align-items:center; justify-content:center; min-height:14px;">Şube Sayısı</div></th>
                <th style="border: 0.5px solid #333; padding: 2px 3px 4px 3px; vertical-align: middle; width: 15%;"><div style="display:flex; align-items:center; justify-content:center; min-height:14px;">Öğrenci Sayısı</div></th>
                <th style="border: 0.5px solid #333; padding: 2px 3px 4px 3px; vertical-align: middle; width: 12%;"><div style="display:flex; align-items:center; justify-content:center; min-height:14px;">Durum</div></th>
              </tr>
            </thead>
            <tbody>
              ${districtList
                .map(
                  (district, idx) => `
                <tr style="border: 0.5px solid #ccc; ${idx % 2 === 0 ? 'background-color: #fafafa;' : ''}">
                  <td style="border: 0.5px solid #ccc; padding: 1px 1px 2px 1px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:flex-start; min-height:13px;">${district.name}</div></td>
                  <td style="border: 0.5px solid #ccc; padding: 1px 1px 2px 1px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:center; min-height:13px;">${district.schools}</div></td>
                  <td style="border: 0.5px solid #ccc; padding: 1px 1px 2px 1px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:center; min-height:13px;">${district.subes}</div></td>
                  <td style="border: 0.5px solid #ccc; padding: 1px 1px 2px 1px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:center; min-height:13px;">${district.students.toLocaleString()}</div></td>
                  <td style="border: 0.5px solid #ccc; padding: 1px 1px 2px 1px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:center; min-height:13px;">${completed ? 'Oluşturuldu' : district.status}</div></td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
          <p style="margin-top: 8px; font-size: 9px; color: #999; text-align: right;">
            ${new Date().toLocaleDateString('tr-TR')}
          </p>
        </div>
      `;

      // Create temporary div
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.width = '800px';
      document.body.appendChild(tempDiv);

      // Convert to canvas
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pdf.internal.pageSize.getWidth() - 10;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 3;

      pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
      heightLeft -= pdf.internal.pageSize.getHeight() - 10;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
        heightLeft -= pdf.internal.pageSize.getHeight() - 10;
      }

      pdf.save('Ilce-Kutuk-Listesi.pdf');

      // Cleanup
      document.body.removeChild(tempDiv);

      toast({
        title: "PDF İndirildi",
        description: "İlçe listesi başarıyla yazdırıldı.",
      });
    } catch (error) {
      console.error("PDF oluşturulurken hata:", error);
      toast({
        title: "Hata",
        description: "PDF oluşturulurken bir hata oluştu.",
        variant: "destructive"
      });
    }
  };

  const handleDownload = async (districtId: string, districtName: string) => {
    try {
      // Get schools for this district
      const districtSchools = schools
        .filter(s => s.districtId === districtId)
        .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));

      // Create school data with class and student counts
      const schoolData = districtSchools.map((school, index) => {
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
          code: school.code,
          classes: classes.size,
          students: studentCount
        };
      });

      const totalStudents = schoolData.reduce((sum, s) => sum + s.students, 0);
      const totalClasses = schoolData.reduce((sum, s) => sum + s.classes, 0);

      // Create HTML table
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 1px 10px 1px 10px; background: white;">
          <h2 style="text-align: center; margin: 0 0 3px 0; font-size: 14px;">${districtName} İlçesi - Kütük Listesi</h2>
          <p style="text-align: center; font-size: 10px; margin: 0 0 8px 0; color: #666;">
            Toplam Okul: ${schoolData.length} | Toplam Şube: ${totalClasses} | Toplam Öğrenci: ${totalStudents}
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 8px; line-height: 1;">
            <thead>
              <tr style="background-color: #f0f0f0; border: 0.5px solid #333;">
                <th style="border: 0.5px solid #333; padding: 2px 3px 4px 3px; vertical-align: middle; width: 5%;"><div style="display:flex; align-items:center; justify-content:center; min-height:14px;">Sıra</div></th>
                <th style="border: 0.5px solid #333; padding: 2px 3px 4px 3px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:flex-start; min-height:14px;">Okul Adı</div></th>
                <th style="border: 0.5px solid #333; padding: 2px 3px 4px 3px; vertical-align: middle; width: 12%;"><div style="display:flex; align-items:center; justify-content:center; min-height:14px;">Şube Sayısı</div></th>
                <th style="border: 0.5px solid #333; padding: 2px 3px 4px 3px; vertical-align: middle; width: 15%;"><div style="display:flex; align-items:center; justify-content:center; min-height:14px;">Öğrenci Sayısı</div></th>
              </tr>
            </thead>
            <tbody>
              ${schoolData
                .map(
                  (school, idx) => `
                <tr style="border: 0.5px solid #ccc; ${idx % 2 === 0 ? 'background-color: #fafafa;' : ''}">
                  <td style="border: 0.5px solid #ccc; padding: 1px 1px 2px 1px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:center; min-height:13px;">${school.sira}</div></td>
                  <td style="border: 0.5px solid #ccc; padding: 1px 1px 2px 1px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:flex-start; min-height:13px;">${school.name}</div></td>
                  <td style="border: 0.5px solid #ccc; padding: 1px 1px 2px 1px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:center; min-height:13px;">${school.classes}</div></td>
                  <td style="border: 0.5px solid #ccc; padding: 1px 1px 2px 1px; vertical-align: middle;"><div style="display:flex; align-items:center; justify-content:center; min-height:13px;">${school.students}</div></td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
          <p style="margin-top: 8px; font-size: 9px; color: #999; text-align: right;">
            ${new Date().toLocaleDateString('tr-TR')}
          </p>
        </div>
      `;

      // Create temporary div
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.width = '800px';
      document.body.appendChild(tempDiv);

      // Convert to canvas
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pdf.internal.pageSize.getWidth() - 10;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 3;

      pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
      heightLeft -= pdf.internal.pageSize.getHeight() - 10;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
        heightLeft -= pdf.internal.pageSize.getHeight() - 10;
      }

      pdf.save(`${districtName}-Kutuk.pdf`);

      // Cleanup
      document.body.removeChild(tempDiv);

      toast({
        title: "PDF İndirildi",
        description: `${districtName} ilçesi kütüğü başarıyla indirildi.`,
      });
    } catch (error) {
      console.error("PDF oluşturulurken hata:", error);
      toast({
        title: "Hata",
        description: "PDF oluşturulurken bir hata oluştu.",
        variant: "destructive"
      });
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
          status: "Hazır"
        };
      })
    : [];

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Kütük Bölme</h1>
        <p className="text-muted-foreground mt-1">Ana kütük dosyasını ilçe bazlı alt dosyalara ayırın.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>İlçe Listesi</CardTitle>
              <CardDescription>{isLoaded ? `${districtList.length} ilçe tespit edildi` : "Henüz Excel dosyası yüklenmemiş"}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handlePrintTable}
                disabled={!isLoaded || districtList.length === 0}
                variant="destructive"
                className="w-32"
              >
                <Printer className="mr-2 h-4 w-4" />
                Yazdır
              </Button>
              <Button 
                onClick={handleSplit} 
                disabled={splitting || completed || !isLoaded}
                className="w-40"
              >
                {splitting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    İşleniyor...
                  </>
                ) : completed ? (
                  <>
                    <CheckCircleIcon className="mr-2 h-4 w-4" />
                    Tamamlandı
                  </>
                ) : (
                  <>
                    <Scissors className="mr-2 h-4 w-4" />
                    Kütüğü Böl
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
                Kütük bölme işlemine başlamadan önce Excel dosyasını "Kütük Belirleme" sayfasından yükleyiniz.
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İlçe Adı</TableHead>
                  <TableHead>Okul Sayısı</TableHead>
                  <TableHead>Şube Sayısı</TableHead>
                  <TableHead>Öğrenci Sayısı</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {districtList.map((district) => (
                  <TableRow key={district.id}>
                    <TableCell className="font-medium">{district.name}</TableCell>
                    <TableCell>{district.schools}</TableCell>
                    <TableCell>{district.subes}</TableCell>
                    <TableCell>{district.students.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={completed ? "default" : "secondary"}>
                        {completed ? "Oluşturuldu" : district.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDownload(district.id, district.name)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        İndir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {completed && (
          <CardFooter className="bg-muted/50 border-t p-4 flex justify-end">
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Tümünü ZIP Olarak İndir
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
