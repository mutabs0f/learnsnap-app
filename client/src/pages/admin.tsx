import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Smartphone, 
  FileQuestion, 
  CreditCard, 
  FileText,
  TrendingUp,
  Lock,
  Loader2
} from "lucide-react";

interface AdminStats {
  stats: {
    totalUsers: number;
    totalDevices: number;
    totalQuizzes: number;
    totalTransactions: number;
    totalPagesUsed: number;
    totalRevenue: number;
  };
  recentQuizzes: Array<{
    id: string;
    device_id: string;
    status: string;
    created_at: string;
  }>;
  recentUsers: Array<{
    id: string;
    email: string;
    name: string;
    created_at: string;
  }>;
}

interface Device {
  device_id: string;
  pages_remaining: number;
  total_pages_used: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Transaction {
  id: string;
  device_id: string;
  amount: number;
  pages_purchased: number;
  created_at: string;
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    if (password.length === 0) return;
    
    setIsLoggingIn(true);
    setError("");
    
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-password": password }
      });
      
      if (res.status === 401) {
        setError("كلمة المرور غير صحيحة");
        setIsAuthenticated(false);
        return;
      }
      
      if (!res.ok) {
        setError("خطأ في الاتصال");
        return;
      }
      
      setSessionToken(password);
      setIsAuthenticated(true);
      setPassword("");
    } catch {
      setError("خطأ في الاتصال بالخادم");
    } finally {
      setIsLoggingIn(false);
    }
  }, [password]);

  const fetchWithAuth = useCallback(async (url: string) => {
    if (!sessionToken) throw new Error("Not authenticated");
    const res = await fetch(url, {
      headers: { "x-admin-password": sessionToken }
    });
    if (res.status === 401) {
      setIsAuthenticated(false);
      setSessionToken(null);
      throw new Error("Session expired");
    }
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  }, [sessionToken]);

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

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
    setSessionToken(null);
    setPassword("");
  }, []);

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
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
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
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">جاري التحميل...</p>
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
              onClick={() => setIsAuthenticated(false)}
            >
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = statsData?.stats;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">لوحة تحكم LearnSnap</h1>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleLogout}
            data-testid="button-admin-logout"
          >
            خروج
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalUsers || 0}</p>
                  <p className="text-sm text-muted-foreground">مستخدم مسجل</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Smartphone className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalDevices || 0}</p>
                  <p className="text-sm text-muted-foreground">جهاز نشط</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileQuestion className="w-8 h-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalQuizzes || 0}</p>
                  <p className="text-sm text-muted-foreground">اختبار</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CreditCard className="w-8 h-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalTransactions || 0}</p>
                  <p className="text-sm text-muted-foreground">عملية دفع</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-cyan-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalPagesUsed || 0}</p>
                  <p className="text-sm text-muted-foreground">صفحة مستخدمة</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-emerald-500" />
                <div>
                  <p className="text-2xl font-bold">{stats?.totalRevenue || 0} ر.س</p>
                  <p className="text-sm text-muted-foreground">إجمالي الإيرادات</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                الأجهزة النشطة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {devicesData?.devices?.map((device) => (
                  <div 
                    key={device.device_id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate">{device.device_id.substring(0, 16)}...</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(device.created_at).toLocaleDateString("ar-SA")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{device.pages_remaining} صفحة</Badge>
                      {device.user_id && (
                        <Badge variant="outline">مربوط</Badge>
                      )}
                    </div>
                  </div>
                ))}
                {(!devicesData?.devices || devicesData.devices.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">لا توجد أجهزة</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                آخر المدفوعات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {transactionsData?.transactions?.map((tx) => (
                  <div 
                    key={tx.id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate">{tx.device_id?.substring(0, 16)}...</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString("ar-SA")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">{tx.amount / 100} ر.س</Badge>
                      <Badge variant="secondary">{tx.pages_purchased} صفحة</Badge>
                    </div>
                  </div>
                ))}
                {(!transactionsData?.transactions || transactionsData.transactions.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">لا توجد مدفوعات</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                آخر المسجلين
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {statsData?.recentUsers?.map((user) => (
                  <div 
                    key={user.id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{user.name || "بدون اسم"}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString("ar-SA")}
                    </p>
                  </div>
                ))}
                {(!statsData?.recentUsers || statsData.recentUsers.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">لا يوجد مستخدمين مسجلين</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileQuestion className="w-5 h-5" />
                آخر الاختبارات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {statsData?.recentQuizzes?.map((quiz) => (
                  <div 
                    key={quiz.id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate">{quiz.id.substring(0, 16)}...</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(quiz.created_at).toLocaleDateString("ar-SA")}
                      </p>
                    </div>
                    <Badge 
                      variant={quiz.status === "completed" ? "default" : quiz.status === "error" ? "destructive" : "secondary"}
                    >
                      {quiz.status === "completed" ? "مكتمل" : quiz.status === "error" ? "خطأ" : quiz.status === "ready" ? "جاهز" : "قيد المعالجة"}
                    </Badge>
                  </div>
                ))}
                {(!statsData?.recentQuizzes || statsData.recentQuizzes.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">لا توجد اختبارات</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center text-sm text-muted-foreground pt-4">
          <p>LearnSnap Admin Dashboard</p>
        </div>
      </div>
    </div>
  );
}
