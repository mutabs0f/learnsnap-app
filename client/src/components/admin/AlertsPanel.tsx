import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, AlertCircle, Loader2 } from "lucide-react";
import { Alert } from "./types";

interface AlertsPanelProps {
  fetchWithAuth: (url: string) => Promise<unknown>;
  sessionToken: string | null;
}

export function AlertsPanel({ fetchWithAuth, sessionToken }: AlertsPanelProps) {
  const { data, isLoading } = useQuery<{ success: boolean; data: { alerts: Alert[]; count: number } }>({
    queryKey: ["/api/admin/alerts", sessionToken],
    enabled: !!sessionToken,
    queryFn: () => fetchWithAuth("/api/admin/alerts") as Promise<{ success: boolean; data: { alerts: Alert[]; count: number } }>,
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const alerts = data?.data?.alerts || [];

  const getSeverityStyles = (severity: string) => {
    if (severity === "error") {
      return "bg-destructive/10 border-destructive text-destructive";
    }
    return "bg-yellow-500/10 border-yellow-500 text-yellow-700 dark:text-yellow-400";
  };

  const getSeverityIcon = (severity: string) => {
    if (severity === "error") {
      return <AlertCircle className="w-4 h-4" aria-hidden="true" />;
    }
    return <AlertTriangle className="w-4 h-4" aria-hidden="true" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500" aria-hidden="true" />
          تنبيهات العمليات المشبوهة
          {alerts.length > 0 && (
            <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">
              {alerts.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
            <p>لا توجد تنبيهات حالياً</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div
                key={`${alert.type}-${alert.deviceId}-${index}`}
                className={`p-3 rounded-md border ${getSeverityStyles(alert.severity)}`}
                role="alert"
              >
                <div className="flex items-start gap-2">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{alert.message}</p>
                    <p className="text-xs mt-1 opacity-70">
                      {alert.type === "high_credits" && "رصيد عالي في يوم واحد"}
                      {alert.type === "failed_transactions" && "معاملات فاشلة متكررة"}
                      {alert.type === "new_high_usage" && "حساب جديد باستخدام عالي"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
