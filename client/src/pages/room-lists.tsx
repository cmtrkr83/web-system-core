import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Printer, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useRegistry, type Student } from "@/context/RegistryContext";

export default function RoomLists() {
  const { districts, schools, students, isLoaded } = useRegistry();
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedSchool, setSelectedSchool] = useState<string>("all");

  const filteredSchools = useMemo(() => {
    if (selectedDistrict === "all") return schools;
    return schools.filter(s => s.districtId === selectedDistrict);
  }, [schools, selectedDistrict]);

  const previewStudents = useMemo(() => {
    let filtered = students;
    if (selectedDistrict !== "all") {
      const dSchools = schools.filter(s => s.districtId === selectedDistrict).map(s => s.id);
      filtered = filtered.filter(st => dSchools.includes(st.schoolId));
    }
    if (selectedSchool !== "all") {
      filtered = filtered.filter(st => st.schoolId === selectedSchool);
    }
    return filtered;
  }, [students, schools, selectedDistrict, selectedSchool]);

  const schoolBranchCounts = useMemo(() => {
    const counts = new Map<string, number>();

    schools.forEach((school) => {
      const branchSet = new Set(
        students
          .filter(st => st.schoolId === school.id)
          .map(st => String(st.class ?? "").trim())
          .filter(Boolean)
      );

      counts.set(school.id, branchSet.size);
    });

    return counts;
  }, [schools, students]);

  // chunk helper to split into pages of max size
  const chunk = (arr: any[], size: number) => {
    const res: any[][] = [];
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
    return res;
  };

  const previewSchoolName = useMemo(() => {
    if (selectedSchool !== "all") {
      return schools.find(s => s.id === selectedSchool)?.name || "SEÇİLİ OKUL";
    }
    return "TÜM OKULLAR";
  }, [selectedSchool, schools]);

  

  const previewPages = useMemo(() => {
    const pages: any[] = [];
    const visibleSchools = selectedSchool === "all" ? filteredSchools : schools.filter(s => s.id === selectedSchool);

    for (const school of visibleSchools) {
      const schoolStudents = previewStudents.filter(st => st.schoolId === school.id);
      if (schoolStudents.length === 0) continue;

      const groups: Record<string, any[]> = {};
      schoolStudents.forEach(st => {
        const key = st.class && String(st.class).trim() ? String(st.class) : "-";
        if (!groups[key]) groups[key] = [];
        groups[key].push(st);
      });

      for (const className of Object.keys(groups)) {
        const clsStudents = groups[className];
        const chunks = chunk(clsStudents, 30);
        for (let i = 0; i < chunks.length; i++) {
          pages.push({
            school,
            className,
            chunk: chunks[i],
            pageIndex: i,
            totalPages: chunks.length,
          });
        }
      }
    }

    return pages;
  }, [selectedSchool, filteredSchools, schools, previewStudents]);

  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    if (previewPages.length === 0) {
      setPreviewIndex(0);
    } else if (previewIndex >= previewPages.length) {
      setPreviewIndex(previewPages.length - 1);
    }
  }, [previewPages.length]);

  const currentPreview = previewPages[previewIndex] || null;

  const handleCreatePdf = async () => {
    try {
      // Determine visible schools (same logic as rendering)
      const visibleSchools = selectedSchool === "all" ? filteredSchools : schools.filter(s => s.id === selectedSchool);

      // Build HTML content for all pages (each chunk will be rendered as part of the big content)
      let htmlSections: string[] = [];

      for (const school of visibleSchools) {
        const schoolStudents = previewStudents.filter(st => st.schoolId === school.id);
        if (schoolStudents.length === 0) continue;

        // group by class
        const groups: Record<string, any[]> = {};
        schoolStudents.forEach(st => {
          const key = st.class && String(st.class).trim() ? String(st.class) : "-";
          if (!groups[key]) groups[key] = [];
          groups[key].push(st);
        });

        for (const className of Object.keys(groups)) {
          const clsStudents = groups[className];
          for (let i = 0; i < clsStudents.length; i += 30) {
            const chunk = clsStudents.slice(i, i + 30);
            const pageIndex = Math.floor(i / 30) + 1;
            const totalPages = Math.ceil(clsStudents.length / 30);

            // build table rows
              const rows = chunk.map((st, idx) => {
              const serial = (pageIndex - 1) * 30 + idx + 1;
              return `
                <tr>
                  <td style="border:1px solid #000; padding:6px; text-align:center;">${serial}</td>
                  <td style="border:1px solid #000; padding:6px; text-align:center;">${st.schoolNo || st.tc}</td>
                  <td style="border:1px solid #000; padding:6px;">${st.name}</td>
                  <td style="border:1px solid #000; padding:6px; text-align:center;">&nbsp;</td>
                  <td style="border:1px solid #000; padding:6px;">&nbsp;</td>
                </tr>`;
            }).join('');

            const section = `
              <div style="page-break-after:always; padding:8px; font-family: Arial, sans-serif; font-size:10px; background:white;">
                <div style="text-align:center; border-bottom:1px solid #000; padding-bottom:4px; margin-bottom:6px;"><strong style="font-size:16px;">SINAV YOKLAMA LİSTESİ</strong></div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; font-size:10px;">
                  <div>
                    <div>Okul Adı: ${school.name}</div>
                    <div>Şube Adı: ${className}</div>
                  </div>
                  <div style="text-align:right;">${pageIndex}/${totalPages}</div>
                </div>
                <table style="width:100%; border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f2f2f2;">
                      <th style="border:1px solid #000; padding:6px; width:6%;">S.NO</th>
                      <th style="border:1px solid #000; padding:6px; width:10%;">OKUL NO</th>
                      <th style="border:1px solid #000; padding:6px;">AD SOYAD</th>
                      <th style="border:1px solid #000; padding:6px; width:12%;">Kitapçık Türü</th>
                      <th style="border:1px solid #000; padding:6px; width:18%;">İMZA</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:10px;">
                  <div style="text-align:center;">
                    <div>Salon Başkanı</div>
                    <div style="margin-top:24px; border-top:1px solid #000; width:160px; margin-left:auto; margin-right:auto; height:1px;"></div>
                  </div>
                  <div style="text-align:center;">
                    <div>Gözetmen</div>
                    <div style="margin-top:24px; border-top:1px solid #000; width:160px; margin-left:auto; margin-right:auto; height:1px;"></div>
                  </div>
                </div>
              </div>`;

            htmlSections.push(section);
          }
        }
      }

      if (htmlSections.length === 0) {
        alert('Yazdırılacak öğrenci bulunamadı.');
        return;
      }

      const htmlContent = `<div>${htmlSections.join('\n')}</div>`;

      const pdf = new jsPDF('p', 'mm', 'a4');

      // Render each section separately to avoid vertical overlap
      for (let si = 0; si < htmlSections.length; si++) {
        const sectionHtml = htmlSections[si];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = sectionHtml;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.width = '800px';
        document.body.appendChild(tempDiv);

        // render this single page
        // await html2canvas for this section
        // reduce scale if memory issues arise
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const canvas = await html2canvas(tempDiv, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pdf.internal.pageSize.getWidth() - 10;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // For first section, just add image; for subsequent, add a new page first
        if (si > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 5, 5, imgWidth, imgHeight);

        // cleanup
        document.body.removeChild(tempDiv);
      }

      // build filename
      let filename = 'Salon-Listesi.pdf';
      if (selectedSchool !== 'all') {
        const sc = schools.find(s => s.id === selectedSchool);
        const di = districts.find(d => d.id === sc?.districtId);
        filename = `${di ? di.name.replace(/\s+/g,'_') : 'ilce'}-${sc?.code || sc?.id || 'okul'}.pdf`;
      } else if (selectedDistrict !== 'all') {
        const di = districts.find(d => d.id === selectedDistrict);
        filename = `${di ? di.name.replace(/\s+/g,'_') : 'ilce'}-tum_okullar.pdf`;
      }

      pdf.save(filename);
    } catch (error) {
      alert('PDF oluşturulurken hata oluştu.');
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Salon Listesi Hazırlama</h1>
        <p className="text-muted-foreground mt-1">Sınav salonları için yoklama listeleri oluşturun.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Ayarlar</CardTitle>
            <CardDescription>Liste formatını belirleyin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>İlçe Seçimi</Label>
              <Select value={selectedDistrict} onValueChange={(val) => { setSelectedDistrict(val); setSelectedSchool("all"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="İlçe Seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm İlçeler</SelectItem>
                  {districts.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Okul Seçimi</Label>
              <Select value={selectedSchool} onValueChange={setSelectedSchool} disabled={selectedDistrict === "all" && isLoaded}>
                <SelectTrigger>
                  <SelectValue placeholder="Okul Seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Okullar</SelectItem>
                  {filteredSchools.map(s => (
                    <SelectItem key={s.id} value={s.id}>{`${s.name} [ ${schoolBranchCounts.get(s.id) ?? 0} Şube ]`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sıralama, fotoğraflı liste ve imza sütunu kaldırıldı */}
          </CardContent>
          <CardFooter>
            <Button className="w-full" size="lg" disabled={!isLoaded || students.length === 0} onClick={handleCreatePdf}>
              <Printer className="mr-2 h-4 w-4" />
              PDF Oluştur
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2 bg-muted/30 border-dashed">
          <CardHeader>
            <div className="w-full flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Önizleme
              </CardTitle>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                  disabled={previewPages.length === 0 || previewIndex === 0}
                  className="inline-flex items-center justify-center p-2 rounded border bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewIndex((p) => Math.min(previewPages.length - 1, p + 1))}
                  disabled={previewPages.length === 0 || previewIndex >= previewPages.length - 1}
                  className="inline-flex items-center justify-center p-2 rounded border bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[500px]">
            <div className="bg-white shadow-xl w-[210mm] min-h-[297mm] pt-[5mm] pb-[10mm] px-[10mm] text-[10px] origin-top scale-75 md:scale-90 transition-transform">
              {/* Per-page headers are rendered inside pages to avoid duplicate titles */}
              
                {previewPages.length > 0 ? (
                <div className="mb-6">
                  <div className="text-center border-b border-black pb-1 mb-2">
                    <h2 style={{ fontSize: '16px' }} className="font-bold">SINAV YOKLAMA LİSTESİ</h2>
                  </div>

                  <div className="mb-2 text-xs flex justify-between items-start">
                    <div>
                      <div>Okul Adı: {currentPreview.school.name}</div>
                      <div>Şube Adı: {currentPreview.className}</div>
                    </div>
                    <div className="text-right">{`${currentPreview.pageIndex + 1}/${currentPreview.totalPages}`}</div>
                  </div>

                  <table className="w-full border-collapse border border-black">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-black p-2 w-10">S.NO</th>
                        <th className="border border-black p-2 w-20">OKUL NO</th>
                        <th className="border border-black p-2">AD SOYAD</th>
                        <th className="border border-black p-2 w-24">Kitapçık Türü</th>
                        <th className="border border-black p-2 w-32">İMZA</th>
                      </tr>
                    </thead>
                    <tbody>
                        {currentPreview.chunk.map((st: Student, i: number) => {
                        const serial = currentPreview.pageIndex * 30 + i + 1;
                        return (
                          <tr key={i}>
                            <td className="border border-black p-2 text-center">{serial}</td>
                            <td className="border border-black p-2 text-center w-20">{st.schoolNo || st.tc}</td>
                            <td className="border border-black p-2">{st.name}</td>
                            <td className="border border-black p-2 text-center w-24"></td>
                            <td className="border border-black p-2"></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="mt-2 flex justify-between items-center text-xs">
                    <div className="text-center">
                      <p>Salon Başkanı</p>
                      <div className="mt-6 border-t border-black w-32"></div>
                    </div>
                    <div className="text-center">
                      <p>Gözetmen</p>
                      <div className="mt-6 border-t border-black w-32"></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Henüz Veri Yüklenmemiş</h3>
                  <p className="text-muted-foreground max-w-md">
                    Salon listesi önizlemesi için önce "Kütük Belirleme" sayfasından Excel dosyasını yükleyiniz.
                  </p>
                </div>
              )}

              {/* Footers are rendered per page; remove global footer to avoid duplication */}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
