import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, FileCheck, FileSignature } from "lucide-react";

export default function Reports() {
  const [generated, setGenerated] = useState(false);

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
              Bu tutanak, ilçe milli eğitim müdürlüklerinin sınav evraklarını ölçme değerlendirme merkezine teslim ederken kullanacakları belgedir.
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
            <Button className="w-full">
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
             <CardDescription>Okullardan ilçeye teslim edilecek evraklar için.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bu tutanak, okul müdürlüklerinin sınav evraklarını ilçe milli eğitim müdürlüklerine teslim ederken kullanacakları belgedir.
            </p>
            <div className="space-y-4">
               <div className="space-y-2">
                <Label>İlçe Filtresi</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Tüm İlçeler" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm İlçeler</SelectItem>
                    <SelectItem value="cankaya">Çankaya</SelectItem>
                  </SelectContent>
                </Select>
               </div>
               <div className="flex items-center space-x-2">
                  <Checkbox id="blank" />
                  <Label htmlFor="blank">Boş Şablon Olarak İndir</Label>
               </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="secondary">
              Okul Tutanaklarını Oluştur
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
