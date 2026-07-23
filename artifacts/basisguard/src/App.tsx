import React, { useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
  useAuth,
} from "@clerk/react";
import { dark } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { AppLayout } from "./components/layout/app-layout";
import DashboardPage from "./pages/dashboard";
import PositionsPage from "./pages/positions";
import PositionDetailPage from "./pages/position-detail";
import ReviewQueuePage from "./pages/review-queue";
import CitationsPage from "./pages/citations";
import ProfilesPage from "./pages/profiles";
import ExportPage from "./pages/export";
import HarvestScannerPage from "./pages/harvest-scanner";
import ChainsPage from "./pages/chains";
import SubmissionsPage from "./pages/submissions";
import LotsPage from "./pages/lots";
import ConnectionsPage from "./pages/connections";
import NotificationPreferencesPage from "./pages/notification-preferences";
import TaxOptimizerPage from "./pages/tax-optimizer";
import TransactionsPage from "./pages/transactions";
import { ShieldCheck } from "lucide-react";
import { Link } from "wouter";

// ── Clerk config ────────────────────────────────────────────────────────────

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

// Empty in dev (intentional). On Render set VITE_CLERK_PROXY_URL to
// https://<api-service>.onrender.com/api/__clerk as a build-time env var.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Clerk pushes full paths; wouter's setLocation prepends the base — strip it.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

// Match the app's deep-dark palette (forced dark mode in app-layout.tsx)
const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#fafafa",
    colorForeground: "#e6e6e6",
    colorMutedForeground: "#999999",
    colorDanger: "#e84848",
    colorBackground: "#0a0a0a",
    colorInput: "#292929",
    colorInputForeground: "#e6e6e6",
    colorNeutral: "#1f1f1f",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "rounded-sm w-[440px] max-w-full overflow-hidden border border-[#1f1f1f] bg-[#111111]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#e6e6e6]",
    headerSubtitle: "text-[#999999]",
    socialButtonsBlockButtonText: "text-[#e6e6e6]",
    formFieldLabel: "text-[#e6e6e6]",
    footerActionLink: "text-[#fafafa]",
    footerActionText: "text-[#999999]",
    dividerText: "text-[#999999]",
    identityPreviewEditButton: "text-[#fafafa]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-[#e6e6e6]",
    logoBox: "flex justify-center",
    socialButtonsBlockButton: "border-[#2a2a2a] bg-[#1f1f1f] text-[#e6e6e6]",
    formButtonPrimary: "bg-[#fafafa] text-[#0a0a0a] hover:bg-[#e6e6e6]",
    formFieldInput: "bg-[#292929] border-[#2a2a2a] text-[#e6e6e6]",
    footerAction: "bg-transparent",
    dividerLine: "bg-[#1f1f1f]",
    alert: "bg-[#1f1f1f] border-[#2a2a2a]",
    otpCodeFieldInput: "bg-[#292929] border-[#2a2a2a] text-[#e6e6e6]",
  },
};

// ── React Query ─────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

// Invalidates the query cache when the signed-in user changes.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const uid = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== uid) {
        qc.clear();
      }
      prevUserIdRef.current = uid;
    });
    return unsub;
  }, [addListener, qc]);

  return null;
}

// ── Pages ────────────────────────────────────────────────────────────────────

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a0a] px-4">
      {/* path must be the full browser path — Clerk reads window.location.pathname directly */}
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a0a] px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

// Public landing for unauthenticated users at the base path.
function LandingPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#0a0a0a] text-[#e6e6e6] px-4 gap-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <ShieldCheck className="h-14 w-14 text-[#e6e6e6]" strokeWidth={1.5} />
        <h1 className="font-serif text-5xl font-semibold tracking-widest uppercase">BasisGuard</h1>
        <p className="text-[#999999] text-base max-w-sm leading-relaxed">
          Crypto tax compliance evidence platform for licensed CPAs and authorized partners.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/sign-in">
          <button className="px-6 py-2.5 bg-[#fafafa] text-[#0a0a0a] text-sm font-medium rounded-sm hover:bg-[#e6e6e6] transition-colors">
            Sign In
          </button>
        </Link>
        <Link href="/sign-up">
          <button className="px-6 py-2.5 border border-[#2a2a2a] text-[#e6e6e6] text-sm font-medium rounded-sm hover:bg-[#1f1f1f] transition-colors">
            Request Access
          </button>
        </Link>
      </div>
    </div>
  );
}

// Base path: redirect to dashboard if signed in, show landing if not.
function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

// Wraps authenticated app pages — redirects to landing if session expires.
function ProtectedPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <AppLayout>{children}</AppLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function AppRoutes() {
  return (
    <ProtectedPage>
      <Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/positions/:id" component={PositionDetailPage} />
        <Route path="/positions" component={PositionsPage} />
        <Route path="/review-queue" component={ReviewQueuePage} />
        <Route path="/citations" component={CitationsPage} />
        <Route path="/profiles" component={ProfilesPage} />
        <Route path="/export" component={ExportPage} />
        <Route path="/harvest" component={HarvestScannerPage} />
        <Route path="/lots" component={LotsPage} />
        <Route path="/chains" component={ChainsPage} />
        <Route path="/submissions" component={SubmissionsPage} />
        <Route path="/connections" component={ConnectionsPage} />
        <Route path="/notifications/preferences" component={NotificationPreferencesPage} />
        <Route path="/tax-optimizer" component={TaxOptimizerPage} />
        <Route path="/transactions" component={TransactionsPage} />
        <Route component={NotFound} />
      </Switch>
    </ProtectedPage>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to BasisGuard" } },
        signUp: { start: { title: "Request access", subtitle: "Create your BasisGuard account" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRoute} />
            {/* REQUIRED — copy "/sign-in/*?" and "/sign-up/*?" verbatim.
                The /*? optional wildcard matches both the bare URL and Clerk's
                OAuth sub-paths (/sign-in/sso-callback, etc). */}
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={AppRoutes} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
