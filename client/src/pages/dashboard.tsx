import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, School, Map, FileSpreadsheet, Tags } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import heroIllustration from "@/assets/hero-illustration.png";
import { useRegistry } from "@/context/RegistryContext";

export default function Dashboard() {
  const { districts, schools, students, isLoaded } = useRegistry();

  // Calculate unique classes (şube) by combining schoolId (kurum kodu) + class (şube ismi)
  const subeCount = isLoaded 
    ? new Set(students.map(s => `${s.schoolId}#${s.class}`).filter(s => s.includes('#') && s.split('#')[1])).size 
    : 0;

  // If data is loaded, use real counts, otherwise use zeros
  const stats = {
    students: students.length,
    schools: schools.length,
    districts: districts.length,
    subes: subeCount
  };

  const chartData = districts.map(d => ({
    name: d.name,
    students: students.filter(s => {
      const school = schools.find(sch => sch.id === s.schoolId);
      return school?.districtId === d.id;
    }).length
  }));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Genel Bakış</h1>
          <p className="text-muted-foreground mt-1">Sınav kütük sistemi durum özeti ve istatistikler.</p>
        </div>
        <div className="text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-full border">
          {isLoaded ? "Veriler Güncel" : "Henüz Excel Dosyası Yüklenmemiş"}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Öğrenci</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{stats.students.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Sistemdeki kayıtlı öğrenci</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktif Okullar</CardTitle>
            <School className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{stats.schools}</div>
            <p className="text-xs text-muted-foreground mt-1">Tespit edilen okul sayısı</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">İlçe Sayısı</CardTitle>
            <Map className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{stats.districts}</div>
            <p className="text-xs text-muted-foreground mt-1">Bölge dağılımı</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Şube</CardTitle>
            <Tags className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{stats.subes}</div>
            <p className="text-xs text-muted-foreground mt-1">Benzersiz şube sayısı</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>İlçelere Göre Öğrenci Dağılımı</CardTitle>
            <CardDescription>Bölgelerdeki öğrenci yoğunluğu.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <Tooltip 
                    cursor={{fill: 'rgba(59, 130, 246, 0.1)'}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }}
                  />
                  <Bar 
                    dataKey="students" 
                    fill="#6881D8" 
                    radius={[4, 4, 0, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3 bg-primary/5 overflow-hidden border-primary/10 relative">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary via-background to-background"></div>
          <CardHeader className="relative z-10">
            <CardTitle>Hızlı İşlemler</CardTitle>
            <CardDescription>Sık kullanılan araçlara hızlı erişim.</CardDescription>
          </CardHeader>
          <CardContent className="relative z-10 flex flex-col gap-4">
            <img 
              src={heroIllustration} 
              alt="Illustration" 
              className="w-full h-32 object-cover rounded-lg mb-2 opacity-90 mix-blend-multiply dark:mix-blend-normal"
            />
            <div className="grid grid-cols-2 gap-3">
               <button className="flex flex-col items-center justify-center p-4 bg-background hover:bg-accent/50 rounded-lg border transition-all text-center gap-2 group cursor-pointer">
                 <div className="p-2 bg-primary/10 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                   <Users className="w-5 h-5" />
                 </div>
                 <span className="text-xs font-medium">Salon Listesi</span>
               </button>
               <button className="flex flex-col items-center justify-center p-4 bg-background hover:bg-accent/50 rounded-lg border transition-all text-center gap-2 group cursor-pointer">
                 <div className="p-2 bg-primary/10 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                   <Tags className="w-5 h-5" />
                 </div>
                 <span className="text-xs font-medium">Etiket Bas</span>
               </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
