import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Smartphone, CreditCard, TrendingUp, CheckCircle, Activity } from "lucide-react";
import { EnhancedStats } from "./types";

interface EnhancedStatsPanelProps {
  fetchWithAuth: (url: string) => Promise<unknown>;
  sessionToken: string | null;
}

export function EnhancedStatsPanel({ fetchWithAuth, sessionToken }: EnhancedStatsPanelProps) {
  const { data, isLoading } = useQuery<{ success: boolean; data: EnhancedStats }>({
    queryKey: ["/api/admin/stats/enhanced", sessionToken],
    enabled: !!sessionToken,
    queryFn: () => fetchWithAuth("/api/admin/stats/enhanced") as Promise<{ success: boolean; data: EnhancedStats }>,
    staleTime: 30000,
  });

  const stats = data?.data;

  const statCards = [
    {
      label: "إجمالي المستخدمين",
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: "text-blue-500",
    },
    {
      label: "النشطين (7 أيام)",
      value: stats?.activeUsers7Days ?? 0,
      icon: Activity,
      color: "text-green-500",
    },
    {
      label: "إجمالي الأجهزة",
      value: stats?.totalDevices ?? 0,
      icon: Smartphone,
      color: "text-purple-500",
    },
    {
      label: "إجمالي المعاملات",
      value: stats?.totalTransactions ?? 0,
      icon: CreditCard,
      color: "text-orange-500",
    },
    {
      label: "إجمالي الإيرادات",
      value: `${(stats?.totalRevenue ?? 0).toFixed(2)} ر.س`,
      icon: TrendingUp,
      color: "text-emerald-500",
    },
    {
      label: "الأرصدة الموزعة",
      value: stats?.totalCreditsDistributed ?? 0,
      icon: CreditCard,
      color: "text-cyan-500",
    },
    {
      label: "الأرصدة المتبقية",
      value: stats?.totalCreditsRemaining ?? 0,
      icon: CreditCard,
      color: "text-indigo-500",
    },
    {
      label: "الاختبارات المكتملة",
      value: stats?.completedQuizzes ?? 0,
      icon: CheckCircle,
      color: "text-teal-500",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse">
                <div className="h-4 bg-muted rounded w-20 mb-2"></div>
                <div className="h-8 bg-muted rounded w-16"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
              </div>
              <stat.icon className={`w-8 h-8 ${stat.color} opacity-80`} aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
