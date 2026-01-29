import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Loader2, Home, BookOpen, AlertCircle } from "lucide-react";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string>("verifying");

  useEffect(() => {
    const verifyPayment = async () => {
      const deviceId = localStorage.getItem("deviceId");
      
      // Get payment info from URL params or localStorage
      const urlParams = new URLSearchParams(window.location.search);
      const orderId = urlParams.get("orderId");
      const urlTransactionNo = urlParams.get("transactionNo");
      const urlDeviceId = urlParams.get("deviceId");
      const urlPages = urlParams.get("pages");
      
      // Get stored payment info
      const storedPayment = localStorage.getItem("pendingPayment");
      let paymentInfo: any = null;
      
      if (storedPayment) {
        try {
          paymentInfo = JSON.parse(storedPayment);
        } catch {
          // Ignore parse errors
        }
      }

      // Use URL params or stored payment info (URL params take priority)
      const transactionNo = urlTransactionNo || paymentInfo?.transactionNo;
      const orderNumber = orderId || paymentInfo?.orderNumber;
      const pages = urlPages || paymentInfo?.pages;
      const targetDeviceId = urlDeviceId || paymentInfo?.deviceId || deviceId;

      // [FIX v2.9.16] Get Authorization header if user is logged in
      const authToken = localStorage.getItem("authToken");
      const authHeaders: Record<string, string> = {};
      if (authToken) {
        authHeaders["Authorization"] = `Bearer ${authToken}`;
      }
      
      // Need transactionNo OR orderNumber to verify payment
      if (!transactionNo && !orderNumber) {
        // No payment info at all - just fetch credits
        if (deviceId) {
          try {
            // [v2.9.31a FIX #3] Add credentials:"include" for proper cookie handling
            const res = await fetch(`/api/credits/${deviceId}`, { 
              headers: authHeaders,
              credentials: "include"
            });
            const data = await res.json();
            setCredits(data.pagesRemaining || 0);
            localStorage.setItem("pagesRemaining", String(data.pagesRemaining || 0));
            setVerificationStatus("success");
          } catch {
            setError("فشل تحميل الرصيد");
            setVerificationStatus("error");
          }
        }
        setIsLoading(false);
        return;
      }

      // Verify payment with backend
      try {
        // [FIX v2.9.20] Add Authorization header and credentials for proper user identification
        const verifyHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (authToken) {
          verifyHeaders["Authorization"] = `Bearer ${authToken}`;
        }
        
        const response = await fetch("/api/payment/verify", {
          method: "POST",
          headers: verifyHeaders,
          credentials: "include", // [FIX v2.9.20] Send cookies for device_token
          body: JSON.stringify({
            transactionNo,
            orderNumber,
            deviceId: targetDeviceId,
            pages,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "فشل التحقق من الدفع");
        }

        if (data.status === "paid") {
          // Payment successful - clear pending payment
          localStorage.removeItem("pendingPayment");
          setVerificationStatus("success");
          
          // [FIX v3.6.9] Wait for credits to be committed, then fetch with retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          let finalCredits = 0;
          let retries = 3;
          
          while (retries > 0) {
            try {
              // Method 1: Use /api/auth/me for logged-in users (most reliable)
              if (authToken) {
                const meRes = await fetch("/api/auth/me", {
                  headers: { "Authorization": `Bearer ${authToken}` },
                  credentials: "include",
                });
                if (meRes.ok) {
                  const meData = await meRes.json();
                  if (meData.pagesRemaining > 0 || meData.credits > 0) {
                    finalCredits = meData.pagesRemaining || meData.credits || 0;
                    break;
                  }
                }
              }
              
              // Method 2: Fallback to /api/credits for guests
              if (targetDeviceId) {
                const creditsRes = await fetch(`/api/credits/${targetDeviceId}`, { 
                  headers: authHeaders,
                  credentials: "include"
                });
                if (creditsRes.ok) {
                  const creditsData = await creditsRes.json();
                  if (creditsData.pagesRemaining > 0) {
                    finalCredits = creditsData.pagesRemaining;
                    break;
                  }
                }
              }
            } catch {
              // Retry failed silently
            }
            
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          setCredits(finalCredits);
          localStorage.setItem("pagesRemaining", String(finalCredits));
        } else if (data.status === "pending") {
          setVerificationStatus("pending");
        } else {
          setError("الدفع لم يكتمل");
          setVerificationStatus("error");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل التحقق من الدفع");
        setVerificationStatus("error");
      }
      
      setIsLoading(false);
    };

    verifyPayment();
  }, []);

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-primary/10 to-background"
      dir="rtl"
    >
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-6 space-y-6">
          {verificationStatus === "success" && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-foreground">
                  تم الدفع بنجاح!
                </h1>
                <p className="text-muted-foreground">
                  شكراً لك! تم إضافة الصفحات إلى رصيدك.
                </p>
              </div>
            </>
          )}

          {verificationStatus === "pending" && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                  <Loader2 className="w-12 h-12 text-yellow-600 dark:text-yellow-400 animate-spin" />
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-foreground">
                  جاري معالجة الدفع
                </h1>
                <p className="text-muted-foreground">
                  الرجاء الانتظار لحظات...
                </p>
              </div>
            </>
          )}

          {verificationStatus === "error" && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-foreground">
                  حدث خطأ
                </h1>
                <p className="text-muted-foreground">
                  {error || "فشل التحقق من الدفع"}
                </p>
              </div>
            </>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-muted-foreground">جاري التحقق من الدفع...</span>
            </div>
          ) : credits !== null && verificationStatus === "success" ? (
            <div className="bg-primary/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">رصيدك الحالي</p>
              <p className="text-3xl font-bold text-primary">{credits} صفحة</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 pt-2">
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => setLocation("/")}
              data-testid="button-home"
            >
              <Home className="w-5 h-5" />
              الصفحة الرئيسية
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full gap-2"
              onClick={() => setLocation("/upload")}
              data-testid="button-start-quiz"
            >
              <BookOpen className="w-5 h-5" />
              ابدأ اختبار جديد
            </Button>
            
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
