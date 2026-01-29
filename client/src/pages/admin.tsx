import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, Loader2 } from "lucide-react";
import {
  useAdminAuth,
  StatsPanel,
  DevicesList,
  TransactionsList,
  RecentUsersList,
  RecentQuizzesList,
  ReportsSection,
  TicketsSection,
  SupportTools,
  SystemHealthPanel,
  SmartSearch,
  AlertsPanel,
  CreditsManager,
  AuditLogPanel,
  EnhancedStatsPanel,
  type AdminStats,
  type Device,
  type Transaction,
} from "@/components/admin";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const {
    isAuthenticated,
    sessionToken,
    isLoggingIn,
    error,
    login,
    logout,
    fetchWithAuth,
    patchWithAuth,
  } = useAdminAuth();

  const handleLogin = async () => {
    if (password.length === 0) return;
    const success = await login(password);
    if (success) setPassword("");
  };

  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats", sessionToken],
    enabled: isAuthenticated && !!sessionToken,
    queryFn: () => fetchWithAuth("/api/admin/stats"),
    staleTime: 30000,
    retry: false,
  });

  const { data: devicesData } = useQuery<{ devices: Device[] }>({
    queryKey: ["/api/admin/devices", sessionToken],
    enabled: isAuthenticated && !!sessionToken,
    queryFn: () => fetchWithAuth("/api/admin/devices"),
    staleTime: 30000,
    retry: false,
  });

  const { data: transactionsData } = useQuery<{ transactions: Transaction[] }>({
    queryKey: ["/api/admin/transactions", sessionToken],
    enabled: isAuthenticated && !!sessionToken,
    queryFn: () => fetchWithAuth("/api/admin/transactions"),
    staleTime: 30000,
    retry: false,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>لوحة تحكم الأدمن</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              data-testid="input-admin-password"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button 
              className="w-full" 
              onClick={handleLogin}
              disabled={isLoggingIn || password.length === 0}
              data-testid="button-admin-login"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin me-2" aria-hidden="true" />
                  جاري التحقق...
                </>
              ) : (
                "دخول"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (statsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl" role="status" aria-live="polite" aria-label="جاري التحميل">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" aria-hidden="true" />
          <p className="text-muted-foreground">جاري التحميل...</p>
          <span className="sr-only">جاري تحميل لوحة التحكم</span>
        </div>
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive">خطأ في تحميل البيانات</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={logout}
            >
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">لوحة تحكم LearnSnap</h1>
          <Button 
            variant="outline" 
            size="sm"
            onClick={logout}
            data-testid="button-admin-logout"
          >
            خروج
          </Button>
        </div>

        <EnhancedStatsPanel 
          fetchWithAuth={fetchWithAuth}
          sessionToken={sessionToken}
        />

        <div className="grid md:grid-cols-2 gap-6">
          <AlertsPanel 
            fetchWithAuth={fetchWithAuth}
            sessionToken={sessionToken}
          />
          <SmartSearch 
            fetchWithAuth={fetchWithAuth}
            onSelectDevice={setSelectedDeviceId}
          />
        </div>

        {selectedDeviceId && (
          <CreditsManager
            deviceId={selectedDeviceId}
            sessionToken={sessionToken}
            fetchWithAuth={fetchWithAuth}
            onClose={() => setSelectedDeviceId(null)}
          />
        )}

        <StatsPanel stats={statsData?.stats} />

        <div className="grid md:grid-cols-2 gap-6">
          <DevicesList devices={devicesData?.devices} />
          <TransactionsList transactions={transactionsData?.transactions} />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <RecentUsersList users={statsData?.recentUsers} />
          <RecentQuizzesList quizzes={statsData?.recentQuizzes} />
        </div>

        <ReportsSection 
          fetchWithAuth={fetchWithAuth} 
          patchWithAuth={patchWithAuth}
          sessionToken={sessionToken}
        />

        <TicketsSection 
          fetchWithAuth={fetchWithAuth} 
          patchWithAuth={patchWithAuth}
          sessionToken={sessionToken}
        />

        <AuditLogPanel
          fetchWithAuth={fetchWithAuth}
          sessionToken={sessionToken}
        />

        <SupportTools sessionToken={sessionToken} />

        <SystemHealthPanel sessionToken={sessionToken} />

        <div className="text-center text-sm text-muted-foreground pt-4">
          <p>LearnSnap Admin Dashboard v4.0.5</p>
        </div>
      </div>
    </div>
  );
}
