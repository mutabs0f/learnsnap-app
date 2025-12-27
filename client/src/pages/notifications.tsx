import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Bell, BookOpen, Trophy, TrendingUp, Flame, Check, CheckCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification, NotificationPreferences } from "@shared/schema";

export default function Notifications() {
  const userId = localStorage.getItem("userId");

  const { data: notificationsList, isLoading } = useQuery<Notification[]>({
    queryKey: [`/api/users/${userId}/notifications`],
    enabled: !!userId,
  });

  const { data: preferences } = useQuery<NotificationPreferences>({
    queryKey: [`/api/users/${userId}/notification-preferences`],
    enabled: !!userId,
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/notifications`] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/notifications/unread-count`] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/users/${userId}/notifications/read-all`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/notifications`] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/notifications/unread-count`] });
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (newPreferences: NotificationPreferences) => {
      return apiRequest("PATCH", `/api/users/${userId}/notification-preferences`, newPreferences);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/notification-preferences`] });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "chapter_complete":
        return <BookOpen className="w-5 h-5 text-blue-600" />;
      case "badge_earned":
        return <Trophy className="w-5 h-5 text-yellow-600" />;
      case "weekly_report":
        return <TrendingUp className="w-5 h-5 text-green-600" />;
      case "streak_reminder":
        return <Flame className="w-5 h-5 text-orange-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} أيام`;
    return d.toLocaleDateString("ar-SA");
  };

  const handlePreferenceChange = (key: keyof NotificationPreferences, value: boolean) => {
    if (!preferences) return;
    updatePreferencesMutation.mutate({ ...preferences, [key]: value });
  };

  const unreadCount = notificationsList?.filter(n => !n.read).length || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <div className="max-w-3xl mx-auto p-6">
          <Skeleton className="h-10 w-48 mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center h-16 gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="font-arabic font-bold text-xl">الإشعارات</h1>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="w-4 h-4 ml-2" />
                قراءة الكل
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-arabic text-lg">إعدادات الإشعارات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-arabic font-medium">إكمال الفصول</p>
                <p className="text-sm text-muted-foreground font-arabic">
                  إشعار عند إكمال طفلك لفصل جديد
                </p>
              </div>
              <Switch
                checked={preferences?.chapterComplete ?? true}
                onCheckedChange={(v) => handlePreferenceChange("chapterComplete", v)}
                data-testid="switch-chapter-complete"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-arabic font-medium">الشارات المكتسبة</p>
                <p className="text-sm text-muted-foreground font-arabic">
                  إشعار عند حصول طفلك على شارة جديدة
                </p>
              </div>
              <Switch
                checked={preferences?.badgeEarned ?? true}
                onCheckedChange={(v) => handlePreferenceChange("badgeEarned", v)}
                data-testid="switch-badge-earned"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-arabic font-medium">التقرير الأسبوعي</p>
                <p className="text-sm text-muted-foreground font-arabic">
                  ملخص أسبوعي لتقدم أطفالك
                </p>
              </div>
              <Switch
                checked={preferences?.weeklyReport ?? true}
                onCheckedChange={(v) => handlePreferenceChange("weeklyReport", v)}
                data-testid="switch-weekly-report"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-arabic font-medium">تذكير السلسلة</p>
                <p className="text-sm text-muted-foreground font-arabic">
                  تذكير للحفاظ على سلسلة التعلم
                </p>
              </div>
              <Switch
                checked={preferences?.streakReminder ?? false}
                onCheckedChange={(v) => handlePreferenceChange("streakReminder", v)}
                data-testid="switch-streak-reminder"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="font-arabic font-bold text-lg">الإشعارات الأخيرة</h2>
          
          {!notificationsList?.length ? (
            <Card className="text-center py-12">
              <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="font-arabic text-muted-foreground">لا توجد إشعارات</p>
            </Card>
          ) : (
            notificationsList.map((notification) => (
              <Card
                key={notification.id}
                className={`transition-colors ${!notification.read ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                data-testid={`notification-${notification.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-full bg-muted">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1">
                      <p className="font-arabic font-medium">{notification.titleAr}</p>
                      <p className="text-sm text-muted-foreground font-arabic mt-1">
                        {notification.messageAr}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDate(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => markReadMutation.mutate(notification.id)}
                        disabled={markReadMutation.isPending}
                        data-testid={`button-mark-read-${notification.id}`}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
