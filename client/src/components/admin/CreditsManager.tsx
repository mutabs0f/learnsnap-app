import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CreditCard, Plus, Minus, Loader2, X, History } from "lucide-react";
import { DeviceCreditsDetail } from "./types";

interface CreditsManagerProps {
  deviceId: string | null;
  sessionToken: string | null;
  fetchWithAuth: (url: string) => Promise<unknown>;
  onClose: () => void;
}

export function CreditsManager({ deviceId, sessionToken, fetchWithAuth, onClose }: CreditsManagerProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<"add" | "subtract">("add");

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: DeviceCreditsDetail }>({
    queryKey: ["/api/admin/credits", deviceId, sessionToken],
    enabled: !!deviceId && !!sessionToken,
    queryFn: () => fetchWithAuth(`/api/admin/credits/${deviceId}`) as Promise<{ success: boolean; data: DeviceCreditsDetail }>,
    staleTime: 30000,
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!sessionToken) throw new Error("Not authenticated");
      const response = await fetch("/api/admin/credits/adjust", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          deviceId,
          amount: parseInt(amount),
          reason,
          action,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Failed to adjust credits");
      }
      return data;
    },
    onSuccess: () => {
      setAmount("");
      setReason("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/devices"] });
    },
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!deviceId) return null;

  const credits = data?.data?.credits;
  const transactions = data?.data?.transactions || [];
  const auditLog = data?.data?.auditLog || [];

  return (
    <Card className="border-primary">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" aria-hidden="true" />
          إدارة الرصيد
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-credits">
          <X className="w-4 h-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            <div className="p-4 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground">Device ID</p>
              <p className="font-mono text-xs break-all">{deviceId}</p>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
                  <p className="text-2xl font-bold">{credits?.pages_remaining ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي المستخدم</p>
                  <p className="text-2xl font-bold">{credits?.total_pages_used ?? 0}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant={action === "add" ? "default" : "outline"}
                  onClick={() => setAction("add")}
                  className="flex-1"
                  data-testid="button-action-add"
                >
                  <Plus className="w-4 h-4 me-1" aria-hidden="true" />
                  إضافة
                </Button>
                <Button
                  variant={action === "subtract" ? "destructive" : "outline"}
                  onClick={() => setAction("subtract")}
                  className="flex-1"
                  data-testid="button-action-subtract"
                >
                  <Minus className="w-4 h-4 me-1" aria-hidden="true" />
                  سحب
                </Button>
              </div>

              <Input
                type="number"
                placeholder="الكمية"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max="1000"
                data-testid="input-credits-amount"
              />

              <Textarea
                placeholder="السبب (إجباري)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                data-testid="input-credits-reason"
              />

              <Button
                className="w-full"
                disabled={!amount || !reason || reason.length < 3 || adjustMutation.isPending}
                onClick={() => adjustMutation.mutate()}
                data-testid="button-submit-credits"
              >
                {adjustMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin me-2" aria-hidden="true" />
                ) : null}
                {action === "add" ? "إضافة الرصيد" : "سحب الرصيد"}
              </Button>

              {adjustMutation.isError && (
                <p className="text-sm text-destructive">فشل في تعديل الرصيد</p>
              )}
              {adjustMutation.isSuccess && (
                <p className="text-sm text-green-600">تم تعديل الرصيد بنجاح</p>
              )}
            </div>

            {(transactions.length > 0 || auditLog.length > 0) && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <History className="w-4 h-4" aria-hidden="true" />
                  آخر العمليات
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {auditLog.slice(0, 5).map((log) => (
                    <div key={log.id} className="text-xs p-2 bg-muted rounded">
                      <div className="flex justify-between">
                        <span className="font-medium">{log.action}</span>
                        <span className="text-muted-foreground">{formatDate(log.created_at)}</span>
                      </div>
                      {log.metadata && (
                        <p className="text-muted-foreground mt-1">
                          {(log.metadata as { reason?: string }).reason || "-"}
                        </p>
                      )}
                    </div>
                  ))}
                  {transactions.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="text-xs p-2 bg-muted rounded">
                      <div className="flex justify-between">
                        <span className="font-medium">شراء {tx.pages_purchased} صفحات</span>
                        <span className="text-muted-foreground">{formatDate(tx.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
