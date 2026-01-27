import { Card, CardContent } from "@/components/ui/card";
import { 
  Users, 
  Smartphone, 
  FileQuestion, 
  CreditCard, 
  FileText,
  TrendingUp,
} from "lucide-react";

interface StatsPanelProps {
  stats: {
    totalUsers: number;
    totalDevices: number;
    totalQuizzes: number;
    totalTransactions: number;
    totalPagesUsed: number;
    totalRevenue: number;
  } | undefined;
}

export function StatsPanel({ stats }: StatsPanelProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{stats?.totalUsers || 0}</p>
              <p className="text-sm text-muted-foreground">مستخدم مسجل</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Smartphone className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{stats?.totalDevices || 0}</p>
              <p className="text-sm text-muted-foreground">جهاز نشط</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <FileQuestion className="w-8 h-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{stats?.totalQuizzes || 0}</p>
              <p className="text-sm text-muted-foreground">اختبار</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{stats?.totalTransactions || 0}</p>
              <p className="text-sm text-muted-foreground">عملية دفع</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-cyan-500" />
            <div>
              <p className="text-2xl font-bold">{stats?.totalPagesUsed || 0}</p>
              <p className="text-sm text-muted-foreground">صفحة مستخدمة</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold">{stats?.totalRevenue || 0} ر.س</p>
              <p className="text-sm text-muted-foreground">إجمالي الإيرادات</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
