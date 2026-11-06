import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, School, Map, FileText, Tags, Package, ClipboardCheck, BookOpen } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import heroIllustration from "@/assets/hero-illustration.png";
import { useMemo, useState } from "react";
import { useRegistry } from "@/context/RegistryContext";
import { useLocation } from "wouter";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";

export default function Dashboard() {
  const { districts, schools, students, isLoaded, meta, exams, selectedExamId } = useRegistry();
  const [, setLocation] = useLocation();
  const [chartMetric, setChartMetric] = useState<"students" | "schools">("students");

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  const loadedAtText = meta.loadedAt
    ? new Date(meta.loadedAt).toLocaleDateString("tr-TR")
    : "-";
  const sourceFileText = meta.sourceFileName || "-";

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

  const chartData = useMemo(() => districts.map((district) => {
    const districtSchools = schools.filter((school) => school.districtId === district.id);
    const value = chartMetric === "students"
      ? students.filter((student) => districtSchools.some((school) => school.id === student.schoolId)).length
      : districtSchools.length;

    return {
      name: district.name,
      value,
    };
  }), [chartMetric, districts, schools, students]);

  const chartLabel = chartMetric === "students" ? "Öğrenci" : "Okul";

  const statCards: Stat[] = [
    { icon: Users, label: "Toplam Öğrenci", value: stats.students.toLocaleString("tr-TR"), delta: "Hazır", deltaColor: "neutral" },
    { icon: School, label: "Aktif Okullar", value: stats.schools.toLocaleString("tr-TR"), delta: "Hazır", deltaColor: "neutral" },
    { icon: Map, label: "İlçe Sayısı", value: stats.districts.toLocaleString("tr-TR"), delta: "Hazır", deltaColor: "neutral" },
    { icon: Tags, label: "Toplam Şube", value: stats.subes.toLocaleString("tr-TR"), delta: "Hazır", deltaColor: "neutral" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-heading font-bold text-foreground">Genel Bakış</h1>
          <p className="text-muted-foreground mt-1">Sınav kütük sistemi durum özeti ve istatistikler.</p>
          {selectedExam && (
            <div className="mt-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                Aktif Sınav: <span className="text-primary">{selectedExam.name}</span>
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <Button variant="outline" size="sm" onClick={() => setLocation("/")}>
            <BookOpen className="mr-2 h-4 w-4" />
            Başlangıça Dön
          </Button>
          <div className="text-sm text-muted-foreground bg-red-50 px-4 py-2 rounded-xl border border-red-200">
            {isLoaded ? (
              <div className="space-y-0.5">
                <div className="font-medium text-foreground">Veriler Güncel</div>
                <div>Son Dosya: {sourceFileText}</div>
                <div>DB Yüklenme: {loadedAtText}</div>
              </div>
            ) : "Henüz Excel Dosyası Yüklenmemiş"}
          </div>
        </div>
      </div>

      <StatCards stats={statCards} columns={4} />

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 overflow-hidden rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="flex-row items-start justify-between space-y-0 border-b border-border/60 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-base">İlçelere Göre {chartLabel} Dağılımı</CardTitle>
              <CardDescription>İlçelerdeki {chartLabel.toLocaleLowerCase("tr-TR")} dağılımı.</CardDescription>
            </div>
            <div className="flex items-center rounded-xl border border-border/70 bg-muted/40 p-0.5">
              {(["students", "schools"] as const).map((metric) => {
                const isActive = chartMetric === metric;
                const label = metric === "students" ? "Öğrenci" : "Okul";
                return (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => setChartMetric(metric)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={isActive}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-5 pt-5 sm:px-6">
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <defs>
                    <linearGradient id="districtBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5B8DEF" />
                      <stop offset="100%" stopColor="#356AE6" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
                    height={85}
                    tickMargin={8}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false} 
                    tickMargin={8}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(91, 141, 239, 0.08)" }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-xl border border-border/70 bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-blue-500" />
                            <span className="text-sm font-semibold text-foreground">
                              {Number(payload[0].value ?? 0).toLocaleString("tr-TR")}
                            </span>
                            <span className="text-xs text-muted-foreground">{chartLabel.toLocaleLowerCase("tr-TR")}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar 
                    dataKey="value"
                    fill="url(#districtBarGradient)"
                    radius={[7, 7, 2, 2]}
                    maxBarSize={42}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`district-bar-${entry.name}-${index}`} />
                    ))}
                  </Bar>
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
               <button
                 className="flex flex-col items-center justify-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100 transition-all text-center gap-2 group cursor-pointer"
                 onClick={() => setLocation("/room-lists")}
               >
                 <div className="p-2 bg-primary/10 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                   <FileText className="w-5 h-5" />
                 </div>
                 <span className="text-xs font-medium">Salon Listesi</span>
               </button>
               <button
                 className="flex flex-col items-center justify-center p-4 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-100 transition-all text-center gap-2 group cursor-pointer"
                 onClick={() => setLocation("/branch-labels")}
               >
                 <div className="p-2 bg-primary/10 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                   <Package className="w-5 h-5" />
                 </div>
                 <span className="text-xs font-medium">Şube Etiketi Bas</span>
               </button>
               <button
                 className="flex flex-col items-center justify-center p-4 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-100 transition-all text-center gap-2 group cursor-pointer"
                 onClick={() => setLocation("/labels")}
               >
                 <div className="p-2 bg-primary/10 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                   <Tags className="w-5 h-5" />
                 </div>
                 <span className="text-xs font-medium">Okul Etiketi Bas</span>
               </button>
               <button
                 className="flex flex-col items-center justify-center p-4 bg-violet-50 hover:bg-violet-100 rounded-lg border border-violet-100 transition-all text-center gap-2 group cursor-pointer"
                 onClick={() => setLocation("/reports")}
               >
                 <div className="p-2 bg-primary/10 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                   <ClipboardCheck className="w-5 h-5" />
                 </div>
                 <span className="text-xs font-medium">Teslim Tutanağı Bas</span>
               </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
