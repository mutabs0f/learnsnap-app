import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
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
  const searchParams = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const token = params.get("token");

    if (token) {
      localStorage.setItem("authToken", token);
      
      fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then(async (user) => {
          if (user.id) {
            localStorage.setItem("userId", user.id);
            localStorage.setItem("userName", user.name || "");
            
            // [FIX v4.6] Sync credits from temp deviceId to browser's deviceId
            const deviceId = getOrCreateDeviceId();
            try {
              const syncResponse = await fetch("/api/auth/sync-credits", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
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
              console.log("Credits synced successfully");
            } catch (err) {
              console.warn("Could not sync credits:", err);
            }
          }
          setLocation("/upload"); // Navigate to upload page directly
        })
        .catch(() => {
          setLocation("/");
        });
    } else {
      setLocation("/auth?error=google_failed");
    }
  }, [searchParams, setLocation]);

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
