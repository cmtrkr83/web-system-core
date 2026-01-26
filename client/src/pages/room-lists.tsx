import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText, Printer, Eye } from "lucide-react";

export default function RoomLists() {
  const [generating, setGenerating] = useState(false);

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
              <Select defaultValue="all">
                <SelectTrigger>
                  <SelectValue placeholder="İlçe Seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm İlçeler</SelectItem>
                  <SelectItem value="cankaya">Çankaya</SelectItem>
                  <SelectItem value="keçiören">Keçiören</SelectItem>
                  <SelectItem value="yenimahalle">Yenimahalle</SelectItem>
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
              <div className="flex items-center space-x-2">
                <Checkbox id="page-break" defaultChecked />
                <Label htmlFor="page-break">Her Salon Yeni Sayfa</Label>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" size="lg">
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
                <h3 className="text-lg font-bold">ANKARA / ÇANKAYA</h3>
                <h4 className="text-base font-medium mt-2">ATATÜRK LİSESİ - SINAV SALON YOKLAMA LİSTESİ</h4>
              </div>
              
              <div className="flex justify-between mb-4 font-medium text-xs">
                <div>SALON NO: 101</div>
                <div>TARİH: 26.01.2026</div>
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
                  {[...Array(15)].map((_, i) => (
                    <tr key={i}>
                      <td className="border border-black p-2 text-center">{i + 1}</td>
                      <td className="border border-black p-2 text-center">123456789{i}0</td>
                      <td className="border border-black p-2">ÖĞRENCİ ADI SOYADI {i + 1}</td>
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
