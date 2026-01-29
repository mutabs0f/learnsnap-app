import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  Database, 
  CreditCard, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Server
} from "lucide-react";
import type { PendingPayment, FailedWebhook, SystemHealth } from "./types";

interface SystemHealthPanelProps {
  sessionToken: string | null;
}

export function SystemHealthPanel({ sessionToken }: SystemHealthPanelProps) {
  const [activeTab, setActiveTab] = useState("health");
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [failedWebhooks, setFailedWebhooks] = useState<FailedWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = async (endpoint: string) => {
    if (!sessionToken) return null;
    const res = await fetch(`/api/admin/support${endpoint}`, {
      headers: { "x-admin-password": sessionToken }
    });
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  };

  const loadHealth = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchData("/health");
      setHealth(data);
    } catch (err) {
      setError("فشل تحميل حالة النظام");
    }
    setLoading(false);
  };

  const loadPendingPayments = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchData("/pending-payments");
      setPendingPayments(data.pendingPayments || []);
    } catch (err) {
      setError("فشل تحميل المدفوعات المعلقة");
    }
    setLoading(false);
  };

  const loadFailedWebhooks = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchData("/failed-webhooks");
      setFailedWebhooks(data.failedWebhooks || []);
    } catch (err) {
      setError("فشل تحميل Webhooks الفاشلة");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === "health") loadHealth();
    else if (activeTab === "pending") loadPendingPayments();
    else if (activeTab === "webhooks") loadFailedWebhooks();
  }, [activeTab, sessionToken]);

  const getStatusColor = (status: string) => {
    if (status === "healthy" || status === "configured") return "bg-green-500";
    if (status === "warning" || status === "pending") return "bg-yellow-500";
    return "bg-red-500";
  };

  const getStatusIcon = (status: string) => {
    if (status === "healthy" || status === "configured") return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === "warning" || status === "pending") return <Clock className="w-4 h-4 text-yellow-500" />;
    return <AlertTriangle className="w-4 h-4 text-red-500" />;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("ar-SA");
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="w-5 h-5 text-purple-500" />
          مراقبة النظام
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="health" className="flex items-center gap-1">
              <Activity className="w-4 h-4" />
              صحة النظام
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-1">
              <CreditCard className="w-4 h-4" />
              مدفوعات معلقة
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Webhooks فاشلة
            </TabsTrigger>
          </TabsList>

          {error && (
            <div className="p-3 mb-4 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          <TabsContent value="health">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">آخر تحديث</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadHealth}
                  disabled={loading}
                  data-testid="button-refresh-health"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
              </div>

              {health && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(health.status)}
                    <span className="font-medium">
                      حالة النظام: {health.status === "healthy" ? "سليم" : "متدهور"}
                    </span>
                  </div>

                  <div className="grid gap-3">
                    {Object.entries(health.checks).map(([name, check]) => (
                      <div key={name} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          {name === "database" && <Database className="w-4 h-4" />}
                          {name === "paylink" && <CreditCard className="w-4 h-4" />}
                          {name === "memory" && <Activity className="w-4 h-4" />}
                          <span className="capitalize">{name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {check.latency && (
                            <span className="text-xs text-muted-foreground">{check.latency}ms</span>
                          )}
                          {check.message && (
                            <span className="text-xs text-muted-foreground">{check.message}</span>
                          )}
                          <Badge className={getStatusColor(check.status)}>
                            {check.status === "healthy" ? "سليم" : 
                             check.status === "configured" ? "مُعد" :
                             check.status === "warning" ? "تحذير" : "خطأ"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    وقت التشغيل: {Math.floor(health.uptime / 3600)} ساعة و {Math.floor((health.uptime % 3600) / 60)} دقيقة
                    {health.version && ` | الإصدار: ${health.version}`}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="pending">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {pendingPayments.length} مدفوعات
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadPendingPayments}
                  disabled={loading}
                  data-testid="button-refresh-pending"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
              </div>

              {pendingPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  لا توجد مدفوعات معلقة
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {pendingPayments.map((payment) => (
                    <div key={payment.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-mono text-sm">{payment.transactionNo}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(payment.createdAt)}
                          </div>
                        </div>
                        <Badge className={
                          payment.status === "pending" ? "bg-yellow-500" :
                          payment.status === "completed" ? "bg-green-500" : "bg-gray-500"
                        }>
                          {payment.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>{payment.pages} صفحات</span>
                        <span>{(payment.amount / 100).toFixed(2)} ريال</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="webhooks">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {failedWebhooks.length} webhooks
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadFailedWebhooks}
                  disabled={loading}
                  data-testid="button-refresh-webhooks"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
              </div>

              {failedWebhooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  لا توجد webhooks فاشلة
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {failedWebhooks.map((webhook) => (
                    <div key={webhook.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-mono text-sm">{webhook.event_id}</div>
                          <div className="text-xs text-muted-foreground">
                            {webhook.event_type}
                          </div>
                        </div>
                        <Badge className={webhook.status === "failed" ? "bg-red-500" : "bg-yellow-500"}>
                          {webhook.status}
                        </Badge>
                      </div>
                      {webhook.error_message && (
                        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                          {webhook.error_message}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {formatDate(webhook.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
