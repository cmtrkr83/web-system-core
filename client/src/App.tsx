import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Pages
import Dashboard from "@/pages/dashboard";
import RegistryUpload from "@/pages/registry-upload";
import RegistrySplit from "@/pages/registry-split";
import RoomLists from "@/pages/room-lists";
import Labels from "@/pages/labels";
import BranchLabels from "@/pages/branch-labels";
import Reports from "@/pages/reports";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/registry-upload" component={RegistryUpload} />
        <Route path="/registry-split" component={RegistrySplit} />
        <Route path="/room-lists" component={RoomLists} />
        <Route path="/labels" component={Labels} />
        <Route path="/branch-labels" component={BranchLabels} />
        <Route path="/reports" component={Reports} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

import { RegistryProvider } from "@/context/RegistryContext";

function App() {
  return (
    <RegistryProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </RegistryProvider>
  );
}

export default App;
