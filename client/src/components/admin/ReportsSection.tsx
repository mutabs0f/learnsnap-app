import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, CheckCircle, XCircle, Eye } from "lucide-react";
import type { QuestionReport, ReportStats } from "./types";

interface ReportsSectionProps {
  fetchWithAuth: (url: string) => Promise<any>;
  patchWithAuth: (url: string, body: any) => Promise<Response>;
  sessionToken: string | null;
}

const REASON_LABELS: Record<string, string> = {
  unclear: "غير واضح",
  wrong_answer: "إجابة خاطئة",
  duplicate: "مكرر",
  inappropriate: "غير مناسب",
  other: "أخرى"
};

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  reviewed: "تمت المراجعة",
  resolved: "تم الحل",
  dismissed: "مرفوض"
};

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pending": return "secondary";
    case "reviewed": return "default";
    case "resolved": return "default";
    case "dismissed": return "outline";
    default: return "secondary";
  }
}

export function ReportsSection({ fetchWithAuth, patchWithAuth, sessionToken }: ReportsSectionProps) {
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const { data: reportsData, refetch } = useQuery<{ reports: QuestionReport[], total: number }>({
    queryKey: ["/api/admin/question-reports", sessionToken, statusFilter],
    enabled: !!sessionToken,
    queryFn: () => fetchWithAuth(`/api/admin/question-reports?status=${statusFilter}&limit=50`),
    staleTime: 30000,
    retry: false,
  });

  const { data: statsData } = useQuery<ReportStats>({
    queryKey: ["/api/admin/question-reports/stats", sessionToken],
    enabled: !!sessionToken,
    queryFn: () => fetchWithAuth("/api/admin/question-reports/stats"),
    staleTime: 30000,
    retry: false,
  });

  const updateReportStatus = async (reportId: number, status: string) => {
    try {
      await patchWithAuth(`/api/admin/question-reports/${reportId}`, { status });
      refetch();
    } catch (error) {
      console.error("Failed to update report status:", error);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-500" />
            بلاغات الأسئلة
            {statsData?.pending && statsData.pending > 0 && (
              <Badge variant="destructive" className="mr-2">{statsData.pending}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">فلترة:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36" data-testid="select-report-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل ({statsData?.total || 0})</SelectItem>
                <SelectItem value="pending">قيد الانتظار ({statsData?.pending || 0})</SelectItem>
                <SelectItem value="reviewed">تمت المراجعة ({statsData?.reviewed || 0})</SelectItem>
                <SelectItem value="resolved">تم الحل ({statsData?.resolved || 0})</SelectItem>
                <SelectItem value="dismissed">مرفوض ({statsData?.dismissed || 0})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {reportsData?.reports?.map((report) => (
            <div 
              key={report.id} 
              className="p-4 bg-muted/50 rounded-lg space-y-3"
              data-testid={`report-item-${report.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Badge variant="outline">{REASON_LABELS[report.reason] || report.reason}</Badge>
                    <Badge variant={getStatusBadgeVariant(report.status)}>
                      {STATUS_LABELS[report.status] || report.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.createdAt).toLocaleDateString("ar-SA")}
                    </span>
                  </div>
                  <p className="text-sm font-medium line-clamp-2">{report.questionText}</p>
                  {report.details && (
                    <p className="text-xs text-muted-foreground mt-1">التفاصيل: {report.details}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    السؤال #{report.questionIndex + 1} | الجلسة: {report.sessionId.substring(0, 8)}...
                  </p>
                </div>
                
                {report.status === "pending" && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => updateReportStatus(report.id, "reviewed")}
                      title="تمت المراجعة"
                      data-testid={`button-review-${report.id}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => updateReportStatus(report.id, "resolved")}
                      title="تم الحل"
                      className="text-green-500"
                      data-testid={`button-resolve-${report.id}`}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => updateReportStatus(report.id, "dismissed")}
                      title="رفض"
                      className="text-red-500"
                      data-testid={`button-dismiss-${report.id}`}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!reportsData?.reports || reportsData.reports.length === 0) && (
            <p className="text-center text-muted-foreground py-8">لا توجد بلاغات</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
