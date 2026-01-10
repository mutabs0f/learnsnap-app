import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Shield
} from "lucide-react";
import type { SupportLookupResult } from "./types";

interface SupportToolsProps {
  sessionToken: string | null;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  GRANT_PAGES: "إضافة صفحات",
  REVERSE_PAGES: "استرجاع صفحات",
  RESEND_VERIFICATION: "إعادة إرسال التأكيد",
  MARK_VERIFIED: "تفعيل يدوي"
};

const REASON_CODE_LABELS: Record<string, string> = {
  COMPENSATION: "تعويض",
  PROMO: "عرض ترويجي",
  BUG: "خطأ تقني",
  FRAUD_REVIEW: "مراجعة احتيال",
  OTHER: "أخرى"
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
        headers: { "x-admin-password": sessionToken }
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
          "x-admin-password": sessionToken 
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
      
      if (!res.ok) {
        throw new Error(data.error || "خطأ في إضافة الصفحات");
      }
      
      setSuccess(`تم إضافة ${grantAmount} صفحة بنجاح`);
      setGrantAmount("");
      setActionReference("");
      setActionNotes("");
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
          "x-admin-password": sessionToken 
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
      
      if (!res.ok) {
        throw new Error(data.error || "خطأ في استرجاع الصفحات");
      }
      
      setSuccess(`تم استرجاع ${reverseAmount} صفحة بنجاح`);
      setReverseAmount("");
      setActionReference("");
      setActionNotes("");
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
          "x-admin-password": sessionToken 
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
      
      if (!res.ok) {
        throw new Error(data.error || "خطأ في إرسال رسالة التأكيد");
      }
      
      setSuccess("تم إرسال رسالة التأكيد بنجاح");
      setActionReference("");
      setActionNotes("");
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
          "x-admin-password": sessionToken 
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
      
      if (!res.ok) {
        throw new Error(data.error || "خطأ في تفعيل البريد");
      }
      
      setSuccess("تم تفعيل البريد الإلكتروني بنجاح");
      setActionReference("");
      setActionNotes("");
      handleLookup();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

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
              <SelectTrigger className="w-40" data-testid="select-support-search-type">
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
                placeholder={searchType === "email" ? "أدخل البريد الإلكتروني" : searchType === "userId" ? "أدخل رقم المستخدم" : searchType === "deviceId" ? "أدخل رقم الجهاز" : "أدخل رقم العملية"}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                data-testid="input-support-search"
              />
              <Button 
                onClick={handleLookup} 
                disabled={loading || !searchValue.trim()}
                data-testid="button-support-search"
              >
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
                      <p><span className="text-muted-foreground">تاريخ التسجيل:</span> {new Date(lookupResult.user.createdAt).toLocaleDateString("ar-SA")}</p>
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
                      <p><span className="text-muted-foreground">رقم المالك:</span> <span className="font-mono text-xs">{lookupResult.credits.ownerId}</span></p>
                      {lookupResult.credits.isEarlyAdopter && (
                        <Badge variant="default" className="bg-amber-500">مستخدم مبكر</Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">لا يوجد رصيد</p>
                  )}
                </div>
              </div>

              {lookupResult.recentPayments.length > 0 && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium flex items-center gap-2 mb-3">
                    <History className="w-4 h-4" />
                    آخر العمليات المالية
                  </h4>
                  <div className="space-y-2">
                    {lookupResult.recentPayments.map((payment, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                        <div>
                          <span className="font-mono">{payment.transactionNo}</span>
                          <span className="text-muted-foreground mx-2">|</span>
                          <span>{payment.pages} صفحة</span>
                        </div>
                        <Badge variant={payment.status === "completed" ? "default" : payment.status === "pending" ? "secondary" : "destructive"}>
                          {payment.status === "completed" ? "مكتمل" : payment.status === "pending" ? "معلق" : payment.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lookupResult.recentActions.length > 0 && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium flex items-center gap-2 mb-3">
                    <Wrench className="w-4 h-4" />
                    إجراءات الدعم السابقة
                  </h4>
                  <div className="space-y-2">
                    {lookupResult.recentActions.map((action) => (
                      <div key={action.id} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                        <div className="flex items-center gap-2">
                          <span>{ACTION_TYPE_LABELS[action.actionType] || action.actionType}</span>
                          {action.amountPages && <Badge variant="outline">{action.amountPages} صفحة</Badge>}
                          <span className="text-muted-foreground text-xs">{action.referenceId}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={action.status === "APPLIED" ? "default" : action.status === "REJECTED" ? "secondary" : "destructive"}>
                            {action.status === "APPLIED" ? "مطبق" : action.status === "REJECTED" ? "مرفوض" : "فشل"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(action.createdAt).toLocaleDateString("ar-SA")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4 space-y-4">
                <h4 className="font-medium">إجراءات الدعم</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">سبب الإجراء</label>
                    <Select value={actionReason} onValueChange={setActionReason}>
                      <SelectTrigger data-testid="select-action-reason">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COMPENSATION">تعويض</SelectItem>
                        <SelectItem value="PROMO">عرض ترويجي</SelectItem>
                        <SelectItem value="BUG">خطأ تقني</SelectItem>
                        <SelectItem value="FRAUD_REVIEW">مراجعة احتيال</SelectItem>
                        <SelectItem value="OTHER">أخرى</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">رقم التذكرة/المرجع *</label>
                    <Input
                      placeholder="مثال: WA-12345 أو TKT-001"
                      value={actionReference}
                      onChange={(e) => setActionReference(e.target.value)}
                      data-testid="input-action-reference"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">ملاحظات (اختياري)</label>
                  <Input
                    placeholder="ملاحظات إضافية..."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    data-testid="input-action-notes"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {lookupResult.credits && (
                    <>
                      <div className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-green-600">
                          <Plus className="w-4 h-4" />
                          <span className="font-medium">إضافة صفحات</span>
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
                          className="w-full"
                          onClick={handleGrantPages}
                          disabled={actionLoading || !grantAmount || !actionReference}
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
                          variant="outline"
                          className="w-full"
                          onClick={handleReversePages}
                          disabled={actionLoading || !reverseAmount || !actionReference}
                          data-testid="button-reverse-pages"
                        >
                          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "استرجاع"}
                        </Button>
                      </div>
                    </>
                  )}

                  {lookupResult.user && !lookupResult.user.emailVerified && (
                    <>
                      <div className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-blue-600">
                          <Mail className="w-4 h-4" />
                          <span className="font-medium">إعادة إرسال التأكيد</span>
                        </div>
                        <p className="text-xs text-muted-foreground">إرسال رسالة تأكيد جديدة للبريد الإلكتروني</p>
                        <Button 
                          variant="outline"
                          className="w-full"
                          onClick={handleResendVerification}
                          disabled={actionLoading || !actionReference}
                          data-testid="button-resend-verification"
                        >
                          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "إرسال"}
                        </Button>
                      </div>

                      <div className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-amber-600">
                          <Shield className="w-4 h-4" />
                          <span className="font-medium">تفعيل يدوي</span>
                        </div>
                        <p className="text-xs text-muted-foreground">تفعيل البريد بدون رسالة تأكيد</p>
                        <Button 
                          variant="outline"
                          className="w-full"
                          onClick={handleMarkVerified}
                          disabled={actionLoading || !actionReference}
                          data-testid="button-mark-verified"
                        >
                          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تفعيل"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
