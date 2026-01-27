import { Switch, Route } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LanguageProvider } from "@/contexts/language-context";
import { Loader2 } from "lucide-react";

// [P0.2 FIX] Initialize device token on app load
// Don't rely on document.cookie for HttpOnly cookies
async function initDeviceToken() {
  try {
    // [P0.2 FIX] Always ensure deviceId exists first
    let deviceId = localStorage.getItem("deviceId");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem("deviceId", deviceId);
    }
    
    // [P0.2 FIX] Use sessionStorage flag to prevent duplicate calls in same session
    const alreadyIssued = sessionStorage.getItem("deviceIssueDone");
    if (alreadyIssued) {
      return; // Already issued in this session
    }
    
    // [P0.2 FIX] Don't check document.cookie for HttpOnly cookies
    // Just call the endpoint - server will check if token exists
    const response = await fetch("/api/device/issue", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-device-id": deviceId,
      },
      credentials: "include",
      body: JSON.stringify({ deviceId }),
    });
    
    if (response.ok) {
      const data = await response.json();
      // Update deviceId if server provided a different one
      if (data.deviceId && data.deviceId !== deviceId) {
        localStorage.setItem("deviceId", data.deviceId);
      }
      // Mark as done for this session
      sessionStorage.setItem("deviceIssueDone", "1");
    }
  } catch (error) {
    console.error("Failed to initialize device token:", error);
  }
}

// Core pages - loaded immediately
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import UploadPage from "@/pages/upload";
import PricingPage from "@/pages/pricing";
import QuizPage from "@/pages/quiz";
import ResultPage from "@/pages/result";
import AuthPage from "@/pages/auth";
import VerifyEmailPage from "@/pages/verify-email";
import AuthCallbackPage from "@/pages/auth-callback";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import PaymentSuccessPage from "@/pages/payment-success";
import DemoQuizPage from "@/pages/demo-quiz";
import { ChatWidget } from "@/components/ChatWidget";

// [L6 COMPLIANCE] Code splitting for large admin pages
const AdminPage = lazy(() => import("@/pages/admin"));

// Loading fallback component for lazy-loaded pages
function PageLoader() {
  return (
    <div 
      className="flex flex-col items-center justify-center min-h-screen p-4 bg-background"
      role="status"
      aria-live="polite"
      aria-label="جاري التحميل"
    >
      <Loader2 className="h-12 w-12 animate-spin text-duo-blue mb-4" aria-hidden="true" />
      <p className="text-xl font-bold text-gray-600 dark:text-gray-300">جاري التحميل...</p>
      <span className="sr-only">جاري تحميل الصفحة، يرجى الانتظار</span>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/upload" component={UploadPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/quiz/:sessionId" component={QuizPage} />
      <Route path="/result/:sessionId" component={ResultPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/auth/callback" component={AuthCallbackPage} />
      <Route path="/verify-email/:token" component={VerifyEmailPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password/:token" component={ResetPasswordPage} />
      <Route path="/payment-success" component={PaymentSuccessPage} />
      <Route path="/demo-quiz" component={DemoQuizPage} />
      <Route path="/admin">
        {() => (
          <Suspense fallback={<PageLoader />}>
            <AdminPage />
          </Suspense>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Initialize device token on first load
  useEffect(() => {
    initDeviceToken();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <div className="min-h-screen bg-background font-arabic">
              <Router />
              <ChatWidget />
            </div>
          </TooltipProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
