import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Smartphone, 
  FileQuestion, 
  CreditCard, 
} from "lucide-react";
import type { Device, Transaction, AdminStats } from "./types";

interface DevicesListProps {
  devices: Device[] | undefined;
}

export function DevicesList({ devices }: DevicesListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          الأجهزة النشطة
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {devices?.map((device) => (
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
          {(!devices || devices.length === 0) && (
            <p className="text-center text-muted-foreground py-4">لا توجد أجهزة</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface TransactionsListProps {
  transactions: Transaction[] | undefined;
}

export function TransactionsList({ transactions }: TransactionsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          آخر المدفوعات
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {transactions?.map((tx) => (
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
          {(!transactions || transactions.length === 0) && (
            <p className="text-center text-muted-foreground py-4">لا توجد مدفوعات</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface RecentUsersListProps {
  users: AdminStats["recentUsers"] | undefined;
}

export function RecentUsersList({ users }: RecentUsersListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          آخر المسجلين
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {users?.map((user) => (
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
          {(!users || users.length === 0) && (
            <p className="text-center text-muted-foreground py-4">لا يوجد مستخدمين مسجلين</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface RecentQuizzesListProps {
  quizzes: AdminStats["recentQuizzes"] | undefined;
}

export function RecentQuizzesList({ quizzes }: RecentQuizzesListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileQuestion className="w-5 h-5" />
          آخر الاختبارات
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {quizzes?.map((quiz) => (
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
          {(!quizzes || quizzes.length === 0) && (
            <p className="text-center text-muted-foreground py-4">لا توجد اختبارات</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
