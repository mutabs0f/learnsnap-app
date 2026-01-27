import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { AuditLogEntry } from "./types";

interface AuditLogPanelProps {
  fetchWithAuth: (url: string) => Promise<unknown>;
  sessionToken: string | null;
}

export function AuditLogPanel({ fetchWithAuth, sessionToken }: AuditLogPanelProps) {
  const [actionFilter, setActionFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading } = useQuery<{ success: boolean; data: { logs: AuditLogEntry[]; actions: string[] } }>({
    queryKey: ["/api/admin/audit-log", actionFilter, offset, sessionToken],
    enabled: !!sessionToken,
    queryFn: () => fetchWithAuth(`/api/admin/audit-log?action=${actionFilter}&limit=${limit}&offset=${offset}`) as Promise<{ success: boolean; data: { logs: AuditLogEntry[]; actions: string[] } }>,
    staleTime: 30000,
  });

  const logs = data?.data?.logs || [];
  const actions = data?.data?.actions || [];

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      CREDIT_GRANTED: "bg-green-500/10 text-green-700 dark:text-green-400",
      CREDIT_REVOKED: "bg-red-500/10 text-red-700 dark:text-red-400",
      AUTH_LOGIN_SUCCESS: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      USER_CREATED: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    };
    return colors[action] || "bg-muted text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" aria-hidden="true" />
          سجل العمليات
        </CardTitle>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setOffset(0); }}>
          <SelectTrigger className="w-48" data-testid="select-audit-filter">
            <SelectValue placeholder="فلترة حسب العملية" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع العمليات</SelectItem>
            {actions.map((action) => (
              <SelectItem key={action} value={action}>{action}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
            <p>لا توجد عمليات مسجلة</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-start p-2">التاريخ</th>
                    <th className="text-start p-2">العملية</th>
                    <th className="text-start p-2">المنفذ</th>
                    <th className="text-start p-2">الهدف</th>
                    <th className="text-start p-2">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b">
                      <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${getActionBadge(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {log.actor_type}: {log.actor_id?.substring(0, 8) || "-"}
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {log.target_type ? `${log.target_type}: ${log.target_id?.substring(0, 8) || ""}` : "-"}
                      </td>
                      <td className="p-2 text-xs max-w-xs truncate">
                        {log.metadata ? (
                          <span title={JSON.stringify(log.metadata)}>
                            {(log.metadata as { reason?: string }).reason || JSON.stringify(log.metadata).substring(0, 50)}
                          </span>
                        ) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                data-testid="button-audit-prev"
              >
                <ChevronLeft className="w-4 h-4 me-1" aria-hidden="true" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                {offset + 1} - {offset + logs.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={logs.length < limit}
                onClick={() => setOffset(offset + limit)}
                data-testid="button-audit-next"
              >
                التالي
                <ChevronRight className="w-4 h-4 ms-1" aria-hidden="true" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
