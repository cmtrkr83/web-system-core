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
    { icon: Users, label: "Toplam Öğrenci", value: stats.students.toLocaleString("tr-TR"), delta: "Hazır", deltaColor: "neutral", tone: "blue" },
    { icon: School, label: "Aktif Okullar", value: stats.schools.toLocaleString("tr-TR"), delta: "Hazır", deltaColor: "neutral", tone: "emerald" },
    { icon: Map, label: "İlçe Sayısı", value: stats.districts.toLocaleString("tr-TR"), delta: "Hazır", deltaColor: "neutral", tone: "purple" },
    { icon: Tags, label: "Toplam Şube", value: stats.subes.toLocaleString("tr-TR"), delta: "Hazır", deltaColor: "neutral", tone: "orange" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-title-1-semibold text-text-primary">Genel Bakış</h1>
          <p className="mt-1 text-body-regular text-text-secondary">Sınav kütük sistemi durum özeti ve istatistikler.</p>
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

        <Card className="relative md:col-span-3 overflow-hidden rounded-2xl border-border/70 bg-background shadow-sm">
          <div className="pointer-events-none absolute -right-20 -top-20 size-48 rounded-full bg-primary/10 blur-3xl" />
          <CardHeader className="relative z-10 flex-row items-start justify-between space-y-0 border-b border-border/60 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-base">Hızlı İşlemler</CardTitle>
              <CardDescription>Sık kullanılan araçlara hızlı erişim.</CardDescription>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              Kısayollar
            </span>
          </CardHeader>
          <CardContent className="relative z-10 flex flex-col gap-4 pt-5">
            <img 
              src={heroIllustration} 
              alt="Illustration" 
              className="mb-1 h-28 w-full rounded-xl object-cover opacity-80 mix-blend-multiply dark:mix-blend-normal"
            />
            <div className="grid grid-cols-2 gap-2.5">
               <button
                 className="group flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.04] hover:shadow-sm"
                 onClick={() => setLocation("/room-lists")}
               >
                 <div className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-950/40 dark:text-blue-300">
                   <FileText className="h-4 w-4" />
                 </div>
                 <span className="text-xs font-medium text-foreground">Salon Listesi</span>
               </button>
               <button
                 className="group flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.04] hover:shadow-sm"
                 onClick={() => setLocation("/branch-labels")}
               >
                 <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-950/40 dark:text-emerald-300">
                   <Package className="h-4 w-4" />
                 </div>
                 <span className="text-xs font-medium text-foreground">Şube Etiketi Bas</span>
               </button>
               <button
                 className="group flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.04] hover:shadow-sm"
                 onClick={() => setLocation("/labels")}
               >
                 <div className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-500 group-hover:text-white dark:bg-amber-950/40 dark:text-amber-300">
                   <Tags className="h-4 w-4" />
                 </div>
                 <span className="text-xs font-medium text-foreground">Okul Etiketi Bas</span>
               </button>
               <button
                 className="group flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.04] hover:shadow-sm"
                 onClick={() => setLocation("/reports")}
               >
                 <div className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition-colors group-hover:bg-violet-600 group-hover:text-white dark:bg-violet-950/40 dark:text-violet-300">
                   <ClipboardCheck className="h-4 w-4" />
                 </div>
                 <span className="text-xs font-medium text-foreground">Teslim Tutanağı Bas</span>
               </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
