import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText, Printer, Eye } from "lucide-react";
import { useRegistry } from "@/context/RegistryContext";

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
    return filtered.slice(0, 15);
  }, [students, schools, selectedDistrict, selectedSchool]);

  const previewSchoolName = useMemo(() => {
    if (selectedSchool !== "all") {
      return schools.find(s => s.id === selectedSchool)?.name || "SEÇİLİ OKUL";
    }
    return isLoaded ? "TÜM OKULLAR" : "ATATÜRK LİSESİ";
  }, [selectedSchool, schools, isLoaded]);

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
                  {!isLoaded && <SelectItem value="cankaya">Çankaya (Örnek)</SelectItem>}
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
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sıralama</Label>
              <Select defaultValue="name">
                <SelectTrigger>
                  <SelectValue placeholder="Sıralama" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">İsim Sıralı</SelectItem>
                  <SelectItem value="number">Numara Sıralı</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="photos" />
                <Label htmlFor="photos">Fotoğraflı Liste</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="imza" defaultChecked />
                <Label htmlFor="imza">İmza Sütunu Ekle</Label>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" size="lg" disabled={!isLoaded && students.length === 0}>
              <Printer className="mr-2 h-4 w-4" />
              PDF Oluştur
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2 bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Önizleme
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[500px]">
            <div className="bg-white shadow-xl w-[210mm] min-h-[297mm] p-[20mm] text-[10px] origin-top scale-75 md:scale-90 transition-transform">
              <div className="text-center border-b-2 border-black pb-4 mb-4">
                <h2 className="text-xl font-bold">T.C. MİLLİ EĞİTİM BAKANLIĞI</h2>
                <h3 className="text-lg font-bold">ANKARA / {districts.find(d => d.id === selectedDistrict)?.name.toUpperCase() || "MERKEZ"}</h3>
                <h4 className="text-base font-medium mt-2">{previewSchoolName.toUpperCase()} - SINAV SALON YOKLAMA LİSTESİ</h4>
              </div>
              
              <div className="flex justify-between mb-4 font-medium text-xs">
                <div>SALON NO: {previewStudents[0]?.salon || "101"}</div>
                <div>TARİH: {new Date().toLocaleDateString('tr-TR')}</div>
              </div>

              <table className="w-full border-collapse border border-black">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black p-2 w-10">S.NO</th>
                    <th className="border border-black p-2">TC KİMLİK</th>
                    <th className="border border-black p-2">AD SOYAD</th>
                    <th className="border border-black p-2 w-32">İMZA</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewStudents.length > 0 ? previewStudents : [...Array(15)]).map((st, i) => (
                    <tr key={i}>
                      <td className="border border-black p-2 text-center">{i + 1}</td>
                      <td className="border border-black p-2 text-center">{st?.tc || `123456789${i}0`}</td>
                      <td className="border border-black p-2">{st?.name || `ÖĞRENCİ ADI SOYADI ${i + 1}`}</td>
                      <td className="border border-black p-2"></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-8 flex justify-between text-xs">
                <div className="text-center">
                  <p>Salon Başkanı</p>
                  <div className="mt-8 border-t border-black w-32"></div>
                </div>
                <div className="text-center">
                  <p>Gözetmen</p>
                  <div className="mt-8 border-t border-black w-32"></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
