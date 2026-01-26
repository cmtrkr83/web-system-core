import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Printer, Eye, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

const colorSchemes = [
  { id: "blue", name: "Mavi", primary: "bg-blue-600", border: "border-blue-600", bg: "bg-blue-50" },
  { id: "orange", name: "Turuncu", primary: "bg-orange-500", border: "border-orange-500", bg: "bg-orange-50" },
  { id: "green", name: "Yeşil", primary: "bg-green-600", border: "border-green-600", bg: "bg-green-50" },
];

export default function Labels() {
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(2);
  const [scheme, setScheme] = useState("blue");

  const currentScheme = colorSchemes.find(s => s.id === scheme) || colorSchemes[0];

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div>
        <h1 className="text-3xl font-heading font-bold">Okul Etiketi Hazırlama</h1>
        <p className="text-muted-foreground mt-1">Sınav evrak poşetleri için okul/şube etiketleri oluşturun.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Etiket Ayarları</CardTitle>
            <CardDescription>Sayfa düzeni ve görünüm ayarları.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Satır Sayısı</Label>
                <Input 
                  type="number" 
                  min="1" 
                  max="10" 
                  value={rows} 
                  onChange={(e) => setRows(Number(e.target.value))} 
                />
              </div>
              <div className="space-y-2">
                <Label>Sütun Sayısı</Label>
                <Input 
                  type="number" 
                  min="1" 
                  max="5" 
                  value={cols} 
                  onChange={(e) => setCols(Number(e.target.value))} 
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Renk Şeması
              </Label>
              <RadioGroup 
                defaultValue="blue" 
                value={scheme}
                onValueChange={setScheme}
                className="grid grid-cols-3 gap-2"
              >
                {colorSchemes.map((s) => (
                  <div key={s.id}>
                    <RadioGroupItem value={s.id} id={s.id} className="peer sr-only" />
                    <Label
                      htmlFor={s.id}
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                    >
                      <div className={cn("w-full h-8 rounded mb-2", s.primary)}></div>
                      <span className="text-xs font-medium">{s.name}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" size="lg">
              <Printer className="mr-2 h-4 w-4" />
              Etiketleri Oluştur (PDF)
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2 bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Sayfa Önizlemesi (A4)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[500px] overflow-auto p-4">
            <div 
              className="bg-white shadow-xl w-[210mm] min-h-[297mm] p-[5mm] grid gap-[2mm] origin-top scale-50 md:scale-75 transition-transform"
              style={{
                gridTemplateRows: `repeat(${rows}, 1fr)`,
                gridTemplateColumns: `repeat(${cols}, 1fr)`
              }}
            >
              {[...Array(rows * cols)].map((_, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "border-2 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden",
                    currentScheme.border,
                    currentScheme.bg
                  )}
                >
                  <div className={cn("absolute top-0 left-0 w-full h-2", currentScheme.primary)}></div>
                  
                  <div className="text-center space-y-2 mt-2">
                    <h3 className="font-bold text-lg uppercase">Çankaya / Ankara</h3>
                    <h2 className={cn("text-xl font-black p-2 rounded text-white", currentScheme.primary)}>
                      CUMHURİYET FEN LİSESİ
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-white p-3 rounded border text-center">
                      <p className="text-xs text-muted-foreground uppercase">Salon No</p>
                      <p className="text-2xl font-bold">1{i}2</p>
                    </div>
                    <div className="bg-white p-3 rounded border text-center">
                      <p className="text-xs text-muted-foreground uppercase">Öğrenci</p>
                      <p className="text-2xl font-bold">20</p>
                    </div>
                  </div>

                  <div className="mt-4 text-center text-xs font-mono text-muted-foreground">
                    KURUM KODU: 123456
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
