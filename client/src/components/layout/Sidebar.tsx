import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Upload, 
  Scissors, 
  FileText, 
  Tags, 
  ClipboardCheck,
  Menu,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Genel Bakış", icon: LayoutDashboard },
  { href: "/registry-upload", label: "Kütük Belirleme", icon: Upload },
  { href: "/registry-split", label: "Kütük Bölme", icon: Scissors },
  { href: "/room-lists", label: "Salon Listesi", icon: FileText },
  { href: "/labels", label: "Okul Etiketi", icon: Tags },
  { href: "/reports", label: "Teslim Tutanağı", icon: ClipboardCheck },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Tags className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-heading font-bold text-xl tracking-tight">ODM Kütük</h1>
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
              location === item.href 
                ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}>
              <item.icon className="w-4 h-4" />
              {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="bg-sidebar-accent rounded-lg p-3 text-xs text-sidebar-foreground/60">
          <p className="font-medium text-sidebar-foreground">Versiyon 2.0.1</p>
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
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 bg-sidebar text-sidebar-foreground border-sidebar-border w-64">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Tags className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-heading font-bold text-xl tracking-tight">ODM Kütük</h1>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                location === item.href 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}>
                <item.icon className="w-4 h-4" />
                {item.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
