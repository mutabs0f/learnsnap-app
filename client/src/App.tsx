import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LanguageProvider } from "@/contexts/language-context";

// Initialize device token on app load
async function initDeviceToken() {
  try {
    let deviceId = localStorage.getItem("deviceId");
    const hasToken = document.cookie.includes("device_token=");
    
    // If no token cookie, request one
    if (!hasToken) {
      const response = await fetch("/api/device/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ deviceId }),
      });
      
      if (response.ok) {
        const data = await response.json();
        // Store device ID if newly generated
        if (data.deviceId && !deviceId) {
          localStorage.setItem("deviceId", data.deviceId);
        }
      }
    }
  } catch (error) {
    console.error("Failed to initialize device token:", error);
  }
}

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
import AdminPage from "@/pages/admin";

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
      <Route path="/admin" component={AdminPage} />
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
            </div>
          </TooltipProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
