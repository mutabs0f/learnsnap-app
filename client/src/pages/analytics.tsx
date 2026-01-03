import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Clock, BookOpen, Trophy, TrendingUp, Users, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useState } from "react";
import { useLanguage } from "@/contexts/language-context";
import type { Child } from "@shared/schema";

interface ChildAnalytics {
  totalLearningTime: number;
  subjectPerformance: { subject: string; avgScore: number; count: number }[];
  weeklyProgress: { date: string; chaptersCompleted: number; learningTime: number }[];
  recentActivity: { date: string; chapterTitle: string; score: number; timeSpent: number }[];
}

interface ParentAnalytics {
  childrenStats: { childId: string; name: string; totalChapters: number; avgScore: number; totalTime: number }[];
  subjectOverview: { subject: string; avgScore: number; totalChapters: number }[];
}

const CHART_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4"];

const formatTime = (seconds: number, isRTL: boolean): string => {
  if (seconds < 60) return isRTL ? `${seconds} ثانية` : `${seconds} sec`;
  if (seconds < 3600) return isRTL ? `${Math.round(seconds / 60)} دقيقة` : `${Math.round(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (isRTL) {
    return `${hours} ساعة ${mins > 0 ? `و ${mins} دقيقة` : ""}`;
  }
  return `${hours}h ${mins > 0 ? `${mins}m` : ""}`;
};

const formatDate = (dateStr: string, locale: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
};

export default function AnalyticsPage() {
  const [, setLocation] = useLocation();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const { t, isRTL } = useLanguage();
  
  const userId = localStorage.getItem("userId");

  const { data: children } = useQuery<Child[]>({
    queryKey: ["/api/children", { parentId: userId }],
    enabled: !!userId,
  });

  const { data: parentAnalytics, isLoading: parentLoading } = useQuery<ParentAnalytics>({
    queryKey: ["/api/analytics/parent", userId],
    enabled: !!userId,
  });

  const { data: childAnalytics, isLoading: childLoading } = useQuery<ChildAnalytics>({
    queryKey: ["/api/analytics/child", selectedChildId],
    enabled: !!selectedChildId,
  });

  if (!userId) {
    setLocation("/auth");
    return null;
  }

  const totalLearningTime = parentAnalytics?.childrenStats.reduce((sum, c) => sum + c.totalTime, 0) || 0;
  const totalChapters = parentAnalytics?.childrenStats.reduce((sum, c) => sum + c.totalChapters, 0) || 0;
  const avgScore = parentAnalytics?.childrenStats.length 
    ? Math.round(parentAnalytics.childrenStats.reduce((sum, c) => sum + c.avgScore, 0) / parentAnalytics.childrenStats.length)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50" dir={isRTL ? "rtl" : "ltr"}>
      <header className="bg-white/80 backdrop-blur border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setLocation("/dashboard")}
              data-testid="button-back"
            >
              <ArrowRight className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{t.analytics.title}</h1>
              <p className="text-sm text-muted-foreground">{t.analytics.subtitle}</p>
            </div>
          </div>
          <BarChart3 className="w-8 h-8 text-blue-500" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t.analytics.learningTime}</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-total-time">
                  {formatTime(totalLearningTime, isRTL)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t.analytics.totalChapters}</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-total-chapters">
                  {totalChapters}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t.analytics.avgScore}</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-avg-score">
                  {avgScore}%
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Children Performance Comparison */}
        {parentAnalytics && parentAnalytics.childrenStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t.analytics.childrenPerformance}
              </CardTitle>
              <CardDescription>{t.analytics.compareChildren}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={parentAnalytics.childrenStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" width={80} />
                    <Tooltip 
                      formatter={(value: number) => [`${value}%`, t.analytics.avgScore]}
                      labelFormatter={(name) => name}
                    />
                    <Bar dataKey="avgScore" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subject Overview */}
        {parentAnalytics && parentAnalytics.subjectOverview.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {t.analytics.subjectPerformance}
              </CardTitle>
              <CardDescription>{t.analytics.avgBySubject}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex">
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={parentAnalytics.subjectOverview.map(s => ({
                          ...s,
                          name: t.subjects[s.subject as keyof typeof t.subjects] || s.subject,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        dataKey="totalChapters"
                        nameKey="name"
                        label={(entry) => entry.name}
                      >
                        {parentAnalytics.subjectOverview.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [value, t.analytics.chapterCount]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/3 space-y-2">
                  {parentAnalytics.subjectOverview.map((subject, index) => (
                    <div key={subject.subject} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} 
                      />
                      <span className="text-sm text-foreground">
                        {t.subjects[subject.subject as keyof typeof t.subjects] || subject.subject}
                      </span>
                      <span className="text-sm text-muted-foreground mr-auto">
                        {subject.avgScore}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Individual Child Analytics */}
        <Card>
          <CardHeader>
            <CardTitle>{t.analytics.childDetails}</CardTitle>
            <CardDescription>{t.analytics.selectChildDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Select value={selectedChildId || ""} onValueChange={setSelectedChildId}>
              <SelectTrigger data-testid="select-child">
                <SelectValue placeholder={t.analytics.selectChild} />
              </SelectTrigger>
              <SelectContent>
                {children?.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {child.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {childLoading && (
              <div className="text-center py-8 text-muted-foreground">
                {t.common.loading}
              </div>
            )}

            {childAnalytics && (
              <div className="space-y-6">
                {/* Weekly Progress Chart */}
                <div>
                  <h3 className="font-semibold mb-4">{t.analytics.recentProgress}</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={childAnalytics.weeklyProgress}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(d) => formatDate(d, isRTL ? "ar-SA" : "en-US")}
                          fontSize={12}
                        />
                        <YAxis />
                        <Tooltip 
                          labelFormatter={(d) => formatDate(d as string, isRTL ? "ar-SA" : "en-US")}
                          formatter={(value: number, name: string) => [
                            name === "chaptersCompleted" ? value : formatTime(value as number, isRTL),
                            name === "chaptersCompleted" ? t.analytics.chapters : t.analytics.learningTime
                          ]}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="chaptersCompleted" 
                          stroke="#3B82F6" 
                          strokeWidth={2}
                          name={t.analytics.chapters}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Subject Performance */}
                {childAnalytics.subjectPerformance.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-4">{t.analytics.subjectPerformance}</h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={childAnalytics.subjectPerformance.map(s => ({
                          ...s,
                          subject: t.subjects[s.subject as keyof typeof t.subjects] || s.subject,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="subject" fontSize={12} />
                          <YAxis domain={[0, 100]} />
                          <Tooltip formatter={(value: number) => [`${value}%`, t.analytics.avgScore]} />
                          <Bar dataKey="avgScore" fill="#10B981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Recent Activity */}
                {childAnalytics.recentActivity.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-4">{t.dashboard.recentActivity}</h3>
                    <div className="space-y-2">
                      {childAnalytics.recentActivity.map((activity, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-foreground">{activity.chapterTitle}</p>
                            <p className="text-sm text-muted-foreground">{formatDate(activity.date, isRTL ? "ar-SA" : "en-US")}</p>
                          </div>
                          <div className={isRTL ? "text-left" : "text-right"}>
                            <p className="font-bold text-foreground">{activity.score}%</p>
                            <p className="text-xs text-muted-foreground">{formatTime(activity.timeSpent, isRTL)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
