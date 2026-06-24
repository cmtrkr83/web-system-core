import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Pages
import Dashboard from "@/pages/dashboard";
import RegistrySplit from "@/pages/registry-split";
import RoomLists from "@/pages/room-lists";
import Labels from "@/pages/labels";
import BranchLabels from "@/pages/branch-labels";
import Reports from "@/pages/reports";
import OpticCoding from "./pages/optic-coding-page";
import OpticReading from "./pages/optic-reading";
import Evaluation from "./pages/evaluation";
import ExamSelection from "@/pages/exam-selection";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={ExamSelection} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/registry-split" component={RegistrySplit} />
        <Route path="/room-lists" component={RoomLists} />
        <Route path="/labels" component={Labels} />
        <Route path="/branch-labels" component={BranchLabels} />
        <Route path="/reports" component={Reports} />
        <Route path="/optic-coding" component={OpticCoding} />
        <Route path="/optic-reading" component={OpticReading} />
        <Route path="/evaluation" component={Evaluation} />
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
