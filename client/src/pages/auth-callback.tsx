import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// Helper to get or create deviceId
function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem("deviceId");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("deviceId", deviceId);
  }
  return deviceId;
}

export default function AuthCallbackPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // [SECURITY FIX v2.9.32] Read token from URL fragment (hash) instead of query string
    // Fragment is not sent to server, protecting token from logs/referrer leakage
    const hash = window.location.hash.substring(1); // Remove leading '#'
    const params = new URLSearchParams(hash);
    const token = params.get("token");
    
    // Clean up URL immediately to remove token from browser history
    if (token) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    // [ENTERPRISE v3.0] Auth is now handled via httpOnly cookie
    // If token exists in URL (legacy mode), we still don't store it
    // Cookie was already set by server before redirect
    
    // Fetch user info using cookie auth (no Authorization header needed)
    fetch("/api/auth/me", {
      credentials: "include",
    })
      .then((res) => res.json())
      .then(async (user) => {
        if (user.id) {
          // Only store non-sensitive user info for UI display
          localStorage.setItem("userId", user.id);
          localStorage.setItem("userName", user.name || "");
          
          // [FIX v4.6] Sync credits from temp deviceId to browser's deviceId
          const deviceId = getOrCreateDeviceId();
          try {
            const syncResponse = await fetch("/api/auth/sync-credits", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({ deviceId }),
            });
            
            if (syncResponse.ok) {
              const syncData = await syncResponse.json();
              // Update localStorage with actual credits from server
              localStorage.setItem("pagesRemaining", String(syncData.pagesRemaining));
              
              // Dispatch event to notify other components
              window.dispatchEvent(new CustomEvent("creditsUpdated", {
                detail: { pagesRemaining: syncData.pagesRemaining }
              }));
            }
          } catch {
            // Credits sync failed silently
          }
          setLocation("/"); // Navigate to home page
        } else {
          // No valid session - redirect to auth
          setLocation("/auth?error=google_failed");
        }
      })
      .catch(() => {
        setLocation("/auth?error=google_failed");
      });
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          </div>
          <CardTitle className="text-xl">جاري تسجيل الدخول...</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">انتظر قليلاً</p>
        </CardContent>
      </Card>
    </div>
  );
}
