import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ticket, Mail, Phone, MessageSquare, Clock, ChevronDown, ChevronUp } from "lucide-react";

interface SupportTicket {
  id: number;
  session_id: string | null;
  device_id: string | null;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  issue_summary: string;
  conversation_history: any[];
  category: string;
  status: string;
  priority: string;
  admin_notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface TicketStats {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
}

interface TicketsSectionProps {
  fetchWithAuth: (url: string) => Promise<any>;
  patchWithAuth: (url: string, body: any) => Promise<Response>;
  sessionToken: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  resolved: "تم الحل",
  closed: "مغلقة"
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة"
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "عام",
  payment: "دفع",
  account: "حساب",
  technical: "تقني",
  error: "خطأ"
};

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "open": return "destructive";
    case "in_progress": return "secondary";
    case "resolved": return "default";
    case "closed": return "outline";
    default: return "secondary";
  }
}

function getPriorityBadgeVariant(priority: string): "default" | "secondary" | "destructive" | "outline" {
  switch (priority) {
    case "urgent": return "destructive";
    case "high": return "destructive";
    case "normal": return "secondary";
    case "low": return "outline";
    default: return "secondary";
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function TicketsSection({ fetchWithAuth, patchWithAuth, sessionToken }: TicketsSectionProps) {
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null);

  const { data, refetch } = useQuery<{ tickets: SupportTicket[], stats: TicketStats }>({
    queryKey: ["/api/admin/support-tickets", sessionToken, statusFilter],
    enabled: !!sessionToken,
    queryFn: () => fetchWithAuth(`/api/admin/support-tickets?status=${statusFilter}&limit=50`),
    staleTime: 30000,
    retry: false,
  });

  const updateTicketStatus = async (ticketId: number, status: string) => {
    try {
      await patchWithAuth(`/api/admin/support-tickets/${ticketId}`, { status });
      refetch();
    } catch (error) {
      console.error("Failed to update ticket status:", error);
    }
  };

  const tickets = data?.tickets || [];
  const stats = data?.stats || { total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-purple-500" />
            تذاكر الدعم
            {stats.open > 0 && (
              <Badge variant="destructive" className="mr-2">{stats.open}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">فلترة:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-ticket-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل ({stats.total})</SelectItem>
                <SelectItem value="open">مفتوحة ({stats.open})</SelectItem>
                <SelectItem value="in_progress">قيد المعالجة ({stats.in_progress})</SelectItem>
                <SelectItem value="resolved">تم الحل ({stats.resolved})</SelectItem>
                <SelectItem value="closed">مغلقة ({stats.closed})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {tickets.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد تذاكر</p>
          ) : (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                data-testid={`ticket-row-${ticket.id}`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-mono text-sm text-muted-foreground">#{ticket.id}</span>
                      <Badge variant={getStatusBadgeVariant(ticket.status)}>
                        {STATUS_LABELS[ticket.status] || ticket.status}
                      </Badge>
                      <Badge variant={getPriorityBadgeVariant(ticket.priority)}>
                        {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                      </Badge>
                      <Badge variant="outline">
                        {CATEGORY_LABELS[ticket.category] || ticket.category}
                      </Badge>
                    </div>
                    
                    <p className="font-medium mb-1">{ticket.customer_name}</p>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {ticket.customer_email}
                      </span>
                      {ticket.customer_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          {ticket.customer_phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDate(ticket.created_at)}
                      </span>
                    </div>
                    
                    <p className="mt-2 text-sm line-clamp-2">{ticket.issue_summary}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
                      data-testid={`button-expand-ticket-${ticket.id}`}
                    >
                      {expandedTicket === ticket.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
                
                {expandedTicket === ticket.id && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        تفاصيل المشكلة
                      </h4>
                      <p className="text-sm bg-muted p-3 rounded-lg">{ticket.issue_summary}</p>
                    </div>
                    
                    {ticket.conversation_history && ticket.conversation_history.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">المحادثة السابقة</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {ticket.conversation_history.map((msg: any, i: number) => (
                            <div
                              key={i}
                              className={`text-sm p-2 rounded ${
                                msg.role === "user" ? "bg-purple-100 dark:bg-purple-900/30" : "bg-muted"
                              }`}
                            >
                              <span className="font-medium">
                                {msg.role === "user" ? "العميل: " : "المساعد: "}
                              </span>
                              {msg.content}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {ticket.device_id && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Device ID:</span> {ticket.device_id}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 pt-2">
                      <span className="text-sm font-medium">تغيير الحالة:</span>
                      {ticket.status !== "in_progress" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateTicketStatus(ticket.id, "in_progress")}
                          data-testid={`button-ticket-progress-${ticket.id}`}
                        >
                          قيد المعالجة
                        </Button>
                      )}
                      {ticket.status !== "resolved" && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => updateTicketStatus(ticket.id, "resolved")}
                          data-testid={`button-ticket-resolve-${ticket.id}`}
                        >
                          تم الحل
                        </Button>
                      )}
                      {ticket.status !== "closed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateTicketStatus(ticket.id, "closed")}
                          data-testid={`button-ticket-close-${ticket.id}`}
                        >
                          إغلاق
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
