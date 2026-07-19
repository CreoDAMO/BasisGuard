import React from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { AppLayout } from "./components/layout/app-layout";
import DashboardPage from "./pages/dashboard";
import PositionsPage from "./pages/positions";
import PositionDetailPage from "./pages/position-detail";
import ReviewQueuePage from "./pages/review-queue";
import CitationsPage from "./pages/citations";
import ProfilesPage from "./pages/profiles";
import ExportPage from "./pages/export";
import ChainsPage from "./pages/chains";
import SubmissionsPage from "./pages/submissions";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/positions" component={PositionsPage} />
        <Route path="/positions/:id" component={PositionDetailPage} />
        <Route path="/review-queue" component={ReviewQueuePage} />
        <Route path="/citations" component={CitationsPage} />
        <Route path="/profiles" component={ProfilesPage} />
        <Route path="/export" component={ExportPage} />
        <Route path="/chains" component={ChainsPage} />
        <Route path="/submissions" component={SubmissionsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
