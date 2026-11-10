import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/base/toast/toast";
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
import OpticCreate from "./pages/optic-creation";
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
        <Route path="/optic-create" component={OpticCreate} />
        <Route path="/optic-coding" component={OpticCoding} />
        <Route path="/optic-reading" component={OpticReading} />
        <Route path="/evaluation" component={Evaluation} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

import { RegistryProvider } from "@/context/RegistryContext";
import { TemplateCopyProvider } from "@/components/foundations/template-copy/template-copy";
import { TEMPLATE_COPY_TR } from "@/lib/template-copy-tr";

function App() {
  return (
    <RegistryProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <TemplateCopyProvider translate={(text) => TEMPLATE_COPY_TR[text] ?? text}>
            <Toaster duration={3000} closeLabel="Bildirimi kapat" aria-label="Bildirimler" />
            <Router />
          </TemplateCopyProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </RegistryProvider>
  );
}

export default App;
