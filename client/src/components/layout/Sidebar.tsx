import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Map, 
  FileText, 
  Tags, 
  Package,
  ClipboardCheck,
  QrCode,
  Menu,
  X,
  BookOpen,
  ClipboardList,
  FilePlus2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Başlangıç", icon: BookOpen },
  { href: "/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/registry-split", label: "İlçe Listesi", icon: Map },
  { href: "/room-lists", label: "Salon Listesi", icon: FileText },
  { href: "/labels", label: "Okul Etiketi", icon: Tags },
  { href: "/branch-labels", label: "Şube Etiketi", icon: Package },
  { href: "/reports", label: "Teslim Tutanağı", icon: ClipboardCheck },
  { href: "/optic-create", label: "Optik Oluşturma", icon: FilePlus2 },
  { href: "/optic-coding", label: "Optik Kodlama", icon: QrCode },
  { href: "/optic-reading", label: "Optik Okuma", icon: QrCode },
  { href: "/evaluation", label: "Değerlendirme", icon: ClipboardList },
];

const navGroups = [
  { items: navItems.slice(0, 7) },
  { items: navItems.slice(7) },
];

function NavLink({ item, location, onClick }: { item: typeof navItems[number]; location: string; onClick?: () => void }) {
  return (
    <Link href={item.href} onClick={onClick} className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-medium transition-all duration-150 cursor-pointer",
        location === item.href 
          ? "bg-accent-500 text-text-white shadow-sm"
          : "text-text-secondary hover:bg-background-secondary-hover hover:text-text-primary"
      )}>
        <item.icon className="w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-105" />
        {item.label}
    </Link>
  );
}

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="hidden h-screen w-64 flex-col border-r border-separator-border bg-background-primary-default text-text-primary shadow-sidebar md:flex">
      <div className="border-b border-separator-border px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent-500 shadow-sm">
            <Tags className="h-5 w-5 text-text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-title-3-semibold tracking-tight text-text-primary">ODM Kütük</h1>
            <p className="mt-0.5 text-caption-2-regular text-text-tertiary">Sınav yönetim sistemi</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navGroups.map((group, idx) => (
          <div key={idx} className="space-y-1">
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} location={location} />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-separator-border p-3">
        <div className="flex justify-center">
          <ThemeToggle appearance="sidebar-segmented" />
        </div>
        <div className="rounded-xl bg-background-secondary-default px-3 py-2.5 text-caption-2-regular text-text-tertiary">
          <p className="text-caption-1-semibold text-text-primary">Versiyon 2.2.2</p>
          <p className="mt-1">Kütük Yönetim Sistemi</p>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="text-text-secondary md:hidden">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 border-separator-border bg-background-primary-default p-0 text-text-primary">
        <div className="border-b border-separator-border px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent-500 shadow-sm">
              <Tags className="h-5 w-5 text-text-white" />
            </div>
            <div>
              <h1 className="text-title-3-semibold tracking-tight text-text-primary">ODM Kütük</h1>
              <p className="mt-0.5 text-caption-2-regular text-text-tertiary">Sınav yönetim sistemi</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} location={location} onClick={() => setOpen(false)} />
              ))}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
