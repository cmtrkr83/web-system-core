import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Scissors, FileSpreadsheet, Download, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const mockDistricts = [
  { id: 1, name: "Çankaya", schools: 145, students: 45000, status: "Hazır" },
  { id: 2, name: "Keçiören", schools: 110, students: 38000, status: "Hazır" },
  { id: 3, name: "Yenimahalle", schools: 95, students: 32000, status: "Hazır" },
  { id: 4, name: "Mamak", schools: 88, students: 29000, status: "Hazır" },
  { id: 5, name: "Altındağ", schools: 72, students: 24000, status: "Bekliyor" },
];

export default function RegistrySplit() {
  const [splitting, setSplitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const { toast } = useToast();

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
              <CardDescription>Ana kütükten tespit edilen ilçeler.</CardDescription>
            </div>
            <Button 
              onClick={handleSplit} 
              disabled={splitting || completed}
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
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>İlçe Adı</TableHead>
                <TableHead>Okul Sayısı</TableHead>
                <TableHead>Öğrenci Sayısı</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDistricts.map((district) => (
                <TableRow key={district.id}>
                  <TableCell className="font-medium">{district.name}</TableCell>
                  <TableCell>{district.schools}</TableCell>
                  <TableCell>{district.students.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={completed ? "default" : "secondary"}>
                      {completed ? "Oluşturuldu" : district.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" disabled={!completed}>
                      <Download className="h-4 w-4 mr-2" />
                      İndir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
