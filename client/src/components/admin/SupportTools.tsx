import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Wrench, 
  Search, 
  Loader2, 
  Users, 
  CreditCard, 
  History, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Plus,
  Minus,
  Mail,
  RefreshCw,
  DollarSign,
  UserX,
  UserCheck
} from "lucide-react";
import type { SupportLookupResult } from "./types";

interface SupportToolsProps {
  sessionToken: string | null;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  GRANT_PAGES: "إضافة صفحات",
  REVERSE_PAGES: "استرجاع صفحات",
  RESEND_VERIFICATION: "إعادة إرسال التأكيد",
  MARK_VERIFIED: "تفعيل يدوي",
  CONFIRM_PAYMENT: "تأكيد دفع",
  PROCESS_REFUND: "استرداد مالي",
  ACCOUNT_STATUS_CHANGE: "تغيير حالة الحساب",
};

const REASON_CODE_LABELS: Record<string, string> = {
  COMPENSATION: "تعويض",
  PROMO: "عرض ترويجي",
  BUG: "خطأ تقني",
  FRAUD_REVIEW: "مراجعة احتيال",
  OTHER: "أخرى"
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "نشط", color: "bg-green-500" },
  on_hold: { label: "موقوف مؤقتاً", color: "bg-yellow-500" },
  suspended: { label: "موقوف", color: "bg-red-500" },
};

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function SupportTools({ sessionToken }: SupportToolsProps) {
  const [searchType, setSearchType] = useState<string>("email");
  const [searchValue, setSearchValue] = useState("");
  const [lookupResult, setLookupResult] = useState<SupportLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  
  const [grantAmount, setGrantAmount] = useState("");
  const [reverseAmount, setReverseAmount] = useState("");
  const [actionReason, setActionReason] = useState<string>("COMPENSATION");
  const [actionReference, setActionReference] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  
  const [confirmTransactionNo, setConfirmTransactionNo] = useState("");
  const [confirmPages, setConfirmPages] = useState("");
  const [confirmAmount, setConfirmAmount] = useState("");
  
  const [refundTransactionNo, setRefundTransactionNo] = useState("");
  const [refundPages, setRefundPages] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundSuspend, setRefundSuspend] = useState(false);
  
  const [newAccountStatus, setNewAccountStatus] = useState<string>("active");

  const handleLookup = async () => {
    if (!searchValue.trim() || !sessionToken) return;
    
    setLoading(true);
    setError("");
    setSuccess("");
    setLookupResult(null);
    
    try {
      const params = new URLSearchParams();
      params.set(searchType, searchValue.trim());
      
      const res = await fetch(`/api/admin/support/lookup?${params}`, {
        headers: { "Authorization": `Bearer ${sessionToken}` }
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "خطأ في البحث");
      }
      
      const data = await res.json();
      setLookupResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleGrantPages = async () => {
    if (!lookupResult?.credits?.ownerId || !grantAmount || !actionReference || !sessionToken) return;
    
    setActionLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const res = await fetch("/api/admin/support/grant-pages", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({
          targetOwnerId: lookupResult.credits.ownerId,
          amount: parseInt(grantAmount),
          reasonCode: actionReason,
          referenceId: actionReference,
          notes: actionNotes || undefined,
          idempotencyKey: generateIdempotencyKey(),
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ في إضافة الصفحات");
      
      setSuccess(`تم إضافة ${grantAmount} صفحة بنجاح`);
      setGrantAmount("");
      handleLookup();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReversePages = async () => {
    if (!lookupResult?.credits?.ownerId || !reverseAmount || !actionReference || !sessionToken) return;
    
    setActionLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const res = await fetch("/api/admin/support/reverse-pages", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({
          targetOwnerId: lookupResult.credits.ownerId,
          amount: parseInt(reverseAmount),
          reasonCode: actionReason,
          referenceId: actionReference,
          notes: actionNotes || undefined,
          idempotencyKey: generateIdempotencyKey(),
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ في استرجاع الصفحات");
      
      setSuccess(`تم استرجاع ${reverseAmount} صفحة بنجاح`);
      setReverseAmount("");
      handleLookup();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!lookupResult?.user?.id || !actionReference || !sessionToken) return;
    
    setActionLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const res = await fetch("/api/admin/support/resend-verification", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({
          userId: lookupResult.user.id,
          reasonCode: actionReason,
          referenceId: actionReference,
          notes: actionNotes || undefined,
          idempotencyKey: generateIdempotencyKey(),
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ في إرسال رسالة التأكيد");
      
      setSuccess("تم إرسال رسالة التأكيد بنجاح");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkVerified = async () => {
    if (!lookupResult?.user?.id || !actionReference || !sessionToken) return;
    if (!window.confirm("هل أنت متأكد من تفعيل البريد الإلكتروني لهذا المستخدم؟")) return;
    
    setActionLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const res = await fetch("/api/admin/support/mark-verified", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({
          userId: lookupResult.user.id,
          reasonCode: actionReason,
          referenceId: actionReference,
          notes: actionNotes || undefined,
          idempotencyKey: generateIdempotencyKey(),
          confirmationText: "CONFIRM",
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ في تفعيل البريد");
      
      setSuccess("تم تفعيل البريد الإلكتروني بنجاح");
      handleLookup();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!lookupResult?.credits?.ownerId || !confirmTransactionNo || !confirmPages || !confirmAmount || !actionReference || !sessionToken) return;
    if (!window.confirm(`هل أنت متأكد من تأكيد الدفع وإضافة ${confirmPages} صفحة؟`)) return;
    
    setActionLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const res = await fetch("/api/admin/support/confirm-payment", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({
          transactionNo: confirmTransactionNo,
          targetOwnerId: lookupResult.credits.ownerId,
          pages: parseInt(confirmPages),
          amount: parseInt(confirmAmount) * 100,
          reasonCode: actionReason,
          referenceId: actionReference,
          notes: actionNotes || undefined,
          idempotencyKey: generateIdempotencyKey(),
          confirmationText: "CONFIRM_PAYMENT",
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ في تأكيد الدفع");
      
      setSuccess(`تم تأكيد الدفع وإضافة ${confirmPages} صفحة بنجاح`);
      setConfirmTransactionNo("");
      setConfirmPages("");
      setConfirmAmount("");
      handleLookup();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcessRefund = async () => {
    if (!lookupResult?.credits?.ownerId || !refundTransactionNo || !refundAmount || !actionReference || !sessionToken) return;
    
    const confirmMsg = refundSuspend 
      ? `هل أنت متأكد من تسجيل الاسترداد وخصم ${refundPages || 0} صفحة وإيقاف الحساب؟`
      : `هل أنت متأكد من تسجيل الاسترداد وخصم ${refundPages || 0} صفحة؟`;
    
    if (!window.confirm(confirmMsg)) return;
    
    setActionLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const res = await fetch("/api/admin/support/process-refund", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({
          transactionNo: refundTransactionNo,
          targetOwnerId: lookupResult.credits.ownerId,
          pagesToDeduct: parseInt(refundPages) || 0,
          refundAmount: parseInt(refundAmount) * 100,
          suspendAccount: refundSuspend,
          reasonCode: actionReason,
          referenceId: actionReference,
          notes: actionNotes || undefined,
          idempotencyKey: generateIdempotencyKey(),
          confirmationText: "CONFIRM_REFUND",
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ في معالجة الاسترداد");
      
      setSuccess(`تم تسجيل الاسترداد بنجاح${refundSuspend ? " وإيقاف الحساب" : ""}`);
      setRefundTransactionNo("");
      setRefundPages("");
      setRefundAmount("");
      setRefundSuspend(false);
      handleLookup();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccountStatus = async () => {
    if (!lookupResult?.credits?.ownerId || !actionReference || !sessionToken) return;
    
    const statusLabel = STATUS_LABELS[newAccountStatus]?.label || newAccountStatus;
    if (!window.confirm(`هل أنت متأكد من تغيير حالة الحساب إلى "${statusLabel}"؟`)) return;
    
    setActionLoading(true);
    setError("");
    setSuccess("");
    
    try {
      const res = await fetch("/api/admin/support/account-status", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}` 
        },
        body: JSON.stringify({
          targetOwnerId: lookupResult.credits.ownerId,
          newStatus: newAccountStatus,
          reasonCode: actionReason,
          referenceId: actionReference,
          notes: actionNotes || undefined,
          idempotencyKey: generateIdempotencyKey(),
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ في تغيير حالة الحساب");
      
      setSuccess(`تم تغيير حالة الحساب إلى "${statusLabel}" بنجاح`);
      handleLookup();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const accountStatus = (lookupResult?.credits as any)?.status || "active";

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-blue-500" />
          أدوات الدعم الفني
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Select value={searchType} onValueChange={setSearchType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">البريد الإلكتروني</SelectItem>
                <SelectItem value="userId">رقم المستخدم</SelectItem>
                <SelectItem value="deviceId">رقم الجهاز</SelectItem>
                <SelectItem value="transactionNo">رقم العملية</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 flex gap-2">
              <Input
                placeholder={
                  searchType === "email" ? "أدخل البريد الإلكتروني" : 
                  searchType === "userId" ? "أدخل رقم المستخدم" : 
                  searchType === "deviceId" ? "أدخل رقم الجهاز" : 
                  "أدخل رقم العملية"
                }
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                data-testid="input-support-search"
              />
              <Button onClick={handleLookup} disabled={loading || !searchValue.trim()} data-testid="button-support-search">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {success}
            </div>
          )}
        </div>

        {lookupResult && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  معلومات المستخدم
                </h4>
                {lookupResult.user ? (
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">الاسم:</span> {lookupResult.user.name || "غير محدد"}</p>
                    <p><span className="text-muted-foreground">البريد:</span> {lookupResult.user.email}</p>
                    <p><span className="text-muted-foreground">رقم المستخدم:</span> <span className="font-mono text-xs">{lookupResult.user.id}</span></p>
                    <p className="flex items-center gap-1">
                      <span className="text-muted-foreground">حالة البريد:</span>
                      {lookupResult.user.emailVerified ? (
                        <Badge variant="default" className="gap-1"><CheckCircle className="w-3 h-3" /> مفعل</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1"><XCircle className="w-3 h-3" /> غير مفعل</Badge>
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">لا يوجد مستخدم مسجل</p>
                )}
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  رصيد الصفحات
                </h4>
                {lookupResult.credits ? (
                  <div className="text-sm space-y-1">
                    <p className="text-2xl font-bold text-primary">{lookupResult.credits.pagesRemaining} صفحة</p>
                    <p><span className="text-muted-foreground">إجمالي المستخدم:</span> {lookupResult.credits.totalPagesUsed}</p>
                    <p className="flex items-center gap-2">
                      <span className="text-muted-foreground">حالة الحساب:</span>
                      <Badge className={STATUS_LABELS[accountStatus]?.color || "bg-gray-500"}>
                        {STATUS_LABELS[accountStatus]?.label || accountStatus}
                      </Badge>
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">لا يوجد رصيد</p>
                )}
              </div>
            </div>

            {lookupResult.recentActions && lookupResult.recentActions.length > 0 && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <History className="w-4 h-4" />
                  آخر إجراءات الدعم
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {lookupResult.recentActions.map((action: any) => (
                    <div key={action.id} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                      <div className="flex items-center gap-2">
                        <span>{ACTION_TYPE_LABELS[action.actionType] || action.actionType}</span>
                        {action.amountPages && <Badge variant="outline">{action.amountPages} صفحة</Badge>}
                      </div>
                      <Badge variant={action.status === "APPLIED" ? "default" : "destructive"}>
                        {action.status === "APPLIED" ? "مطبق" : "فشل"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium">إجراءات الدعم</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">سبب الإجراء</label>
                  <Select value={actionReason} onValueChange={setActionReason}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REASON_CODE_LABELS).map(([code, label]) => (
                        <SelectItem key={code} value={code}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">رقم التذكرة *</label>
                  <Input
                    placeholder="WA-12345"
                    value={actionReference}
                    onChange={(e) => setActionReference(e.target.value)}
                    data-testid="input-action-reference"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">ملاحظات</label>
                  <Input
                    placeholder="ملاحظات إضافية..."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    data-testid="input-action-notes"
                  />
                </div>
              </div>

              <Tabs defaultValue="pages" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="pages">الصفحات</TabsTrigger>
                  <TabsTrigger value="payment">الدفع</TabsTrigger>
                  <TabsTrigger value="refund">الاسترداد</TabsTrigger>
                  <TabsTrigger value="account">الحساب</TabsTrigger>
                </TabsList>

                <TabsContent value="pages" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {lookupResult.credits && (
                      <>
                        <div className="p-4 border rounded-lg space-y-3">
                          <div className="flex items-center gap-2 text-green-600">
                            <Plus className="w-4 h-4" />
                            <span className="font-medium">إضافة صفحات هدية</span>
                          </div>
                          <Input
                            type="number"
                            min="1"
                            max="500"
                            placeholder="عدد الصفحات"
                            value={grantAmount}
                            onChange={(e) => setGrantAmount(e.target.value)}
                            data-testid="input-grant-amount"
                          />
                          <Button 
                            className={`w-full ${
                              !actionLoading && grantAmount && actionReference && sessionToken && lookupResult?.credits?.ownerId
                                ? "bg-green-600 hover:bg-green-700 text-white"
                                : "bg-green-200 text-green-400 cursor-not-allowed"
                            }`}
                            onClick={handleGrantPages}
                            disabled={actionLoading || !grantAmount || !actionReference || !sessionToken || !lookupResult?.credits?.ownerId}
                            data-testid="button-grant-pages"
                          >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "إضافة"}
                          </Button>
                        </div>

                        <div className="p-4 border rounded-lg space-y-3">
                          <div className="flex items-center gap-2 text-red-600">
                            <Minus className="w-4 h-4" />
                            <span className="font-medium">استرجاع صفحات</span>
                          </div>
                          <Input
                            type="number"
                            min="1"
                            max={lookupResult.credits.pagesRemaining}
                            placeholder="عدد الصفحات"
                            value={reverseAmount}
                            onChange={(e) => setReverseAmount(e.target.value)}
                            data-testid="input-reverse-amount"
                          />
                          <Button 
                            className={`w-full ${
                              !actionLoading && reverseAmount && actionReference && sessionToken && lookupResult?.credits?.ownerId
                                ? "bg-red-600 hover:bg-red-700 text-white"
                                : "bg-red-100 text-red-300 cursor-not-allowed"
                            }`}
                            onClick={handleReversePages}
                            disabled={actionLoading || !reverseAmount || !actionReference || !sessionToken || !lookupResult?.credits?.ownerId}
                            data-testid="button-reverse-pages"
                          >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "استرجاع"}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="payment" className="space-y-4">
                  <div className="p-4 border rounded-lg space-y-4">
                    <div className="flex items-center gap-2 text-blue-600">
                      <DollarSign className="w-4 h-4" />
                      <span className="font-medium">تأكيد دفع يدوي</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      استخدم هذا في حالة دفع العميل ولم تُضاف الصفحات تلقائياً
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Input
                        placeholder="رقم العملية من Paylink"
                        value={confirmTransactionNo}
                        onChange={(e) => setConfirmTransactionNo(e.target.value)}
                        data-testid="input-confirm-transaction"
                      />
                      <Input
                        type="number"
                        placeholder="عدد الصفحات"
                        value={confirmPages}
                        onChange={(e) => setConfirmPages(e.target.value)}
                        data-testid="input-confirm-pages"
                      />
                      <Input
                        type="number"
                        placeholder="المبلغ (ريال)"
                        value={confirmAmount}
                        onChange={(e) => setConfirmAmount(e.target.value)}
                        data-testid="input-confirm-amount"
                      />
                    </div>
                    <Button 
                      className={`w-full ${
                        !actionLoading && confirmTransactionNo && confirmPages && confirmAmount && actionReference && sessionToken && lookupResult?.credits?.ownerId
                          ? "bg-blue-600 hover:bg-blue-700 text-white"
                          : "bg-blue-100 text-blue-300 cursor-not-allowed"
                      }`}
                      onClick={handleConfirmPayment}
                      disabled={actionLoading || !confirmTransactionNo || !confirmPages || !confirmAmount || !actionReference || !sessionToken || !lookupResult?.credits?.ownerId}
                      data-testid="button-confirm-payment"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأكيد الدفع وإضافة الصفحات"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="refund" className="space-y-4">
                  <div className="p-4 border border-red-200 rounded-lg space-y-4">
                    <div className="flex items-center gap-2 text-red-600">
                      <RefreshCw className="w-4 h-4" />
                      <span className="font-medium">تسجيل استرداد مالي</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      سجّل الاسترداد بعد إتمامه في Paylink. يمكنك خصم الصفحات وإيقاف الحساب.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Input
                        placeholder="رقم العملية"
                        value={refundTransactionNo}
                        onChange={(e) => setRefundTransactionNo(e.target.value)}
                        data-testid="input-refund-transaction"
                      />
                      <Input
                        type="number"
                        placeholder="صفحات للخصم (0 = بدون)"
                        value={refundPages}
                        onChange={(e) => setRefundPages(e.target.value)}
                        data-testid="input-refund-pages"
                      />
                      <Input
                        type="number"
                        placeholder="المبلغ المسترد (ريال)"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        data-testid="input-refund-amount"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={refundSuspend}
                        onChange={(e) => setRefundSuspend(e.target.checked)}
                        className="rounded"
                        data-testid="checkbox-refund-suspend"
                      />
                      <span className="text-sm">إيقاف الحساب بعد الاسترداد</span>
                    </label>
                    <Button 
                      className={`w-full ${
                        !actionLoading && refundTransactionNo && refundAmount && actionReference && sessionToken && lookupResult?.credits?.ownerId
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : "bg-red-100 text-red-300 cursor-not-allowed"
                      }`}
                      onClick={handleProcessRefund}
                      disabled={actionLoading || !refundTransactionNo || !refundAmount || !actionReference || !sessionToken || !lookupResult?.credits?.ownerId}
                      data-testid="button-process-refund"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تسجيل الاسترداد"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="account" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center gap-2">
                        {accountStatus === "active" ? (
                          <UserCheck className="w-4 h-4 text-green-600" />
                        ) : (
                          <UserX className="w-4 h-4 text-red-600" />
                        )}
                        <span className="font-medium">تغيير حالة الحساب</span>
                      </div>
                      <Select value={newAccountStatus} onValueChange={setNewAccountStatus}>
                        <SelectTrigger data-testid="select-account-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">نشط</SelectItem>
                          <SelectItem value="on_hold">موقوف مؤقتاً</SelectItem>
                          <SelectItem value="suspended">موقوف</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button 
                        className={`w-full ${
                          !actionLoading && actionReference && sessionToken && lookupResult?.credits?.ownerId
                            ? newAccountStatus === "active" 
                              ? "bg-green-600 hover:bg-green-700 text-white"
                              : "bg-red-600 hover:bg-red-700 text-white"
                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                        }`}
                        onClick={handleAccountStatus}
                        disabled={actionLoading || !actionReference || !sessionToken || !lookupResult?.credits?.ownerId}
                        data-testid="button-change-status"
                      >
                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تغيير الحالة"}
                      </Button>
                    </div>

                    {lookupResult.user && !lookupResult.user.emailVerified && (
                      <div className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-blue-600">
                          <Mail className="w-4 h-4" />
                          <span className="font-medium">تفعيل البريد</span>
                        </div>
                        <div className="space-y-2">
                          <Button 
                            className={`w-full ${
                              !actionLoading && actionReference && sessionToken && lookupResult?.user?.id
                                ? "bg-blue-600 hover:bg-blue-700 text-white"
                                : "bg-blue-100 text-blue-300 cursor-not-allowed"
                            }`}
                            onClick={handleResendVerification}
                            disabled={actionLoading || !actionReference || !sessionToken || !lookupResult?.user?.id}
                            data-testid="button-resend-verification"
                          >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "إعادة إرسال التأكيد"}
                          </Button>
                          <Button 
                            className={`w-full ${
                              !actionLoading && actionReference && sessionToken && lookupResult?.user?.id
                                ? "bg-green-600 hover:bg-green-700 text-white"
                                : "bg-green-100 text-green-300 cursor-not-allowed"
                            }`}
                            onClick={handleMarkVerified}
                            disabled={actionLoading || !actionReference || !sessionToken || !lookupResult?.user?.id}
                            data-testid="button-mark-verified"
                          >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تفعيل يدوي"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
