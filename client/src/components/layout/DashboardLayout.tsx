import { Sidebar, MobileNav } from "./Sidebar";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-background-full">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="flex h-14 items-center border-b border-separator-border bg-background-primary-default px-4 md:hidden">
          <MobileNav />
          <h1 className="ml-4 text-title-3-semibold text-text-primary">ODM Kütük</h1>
          <ThemeToggle collapsed className="ml-auto" transitionDuration={0} />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1440px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
