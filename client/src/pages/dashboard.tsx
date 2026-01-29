import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, 
  Upload, 
  Star, 
  Flame, 
  BookOpen, 
  TrendingUp, 
  Users, 
  LogOut,
  ChevronLeft,
  Clock,
  BarChart3,
  Trophy,
  Bell,
  Library,
  Home
} from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/contexts/language-context";
import type { Child, Chapter } from "@shared/schema";

const avatarColors = [
  "bg-child-coral",
  "bg-child-turquoise", 
  "bg-child-yellow",
  "bg-child-green",
  "bg-child-blue",
  "bg-child-purple",
];

function ChildCard({ child, chapters }: { child: Child; chapters: Chapter[] }) {
  const { t } = useLanguage();
  const childChapters = chapters.filter(c => c.childId === child.id);
  const completedChapters = childChapters.filter(c => c.status === "completed").length;
  const colorIndex = child.name.charCodeAt(0) % avatarColors.length;

  return (
    <Card className="group hover:shadow-lg transition-all duration-300" data-testid={`card-child-${child.id}`}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16 border-2 border-white shadow-md">
            <AvatarFallback className={`${avatarColors[colorIndex]} text-white text-xl font-bold`}>
              {child.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg truncate" data-testid={`text-child-name-${child.id}`}>
              {child.name}
            </h3>
            <p className="text-muted-foreground text-sm">
              {child.age} {t.dashboard.years}
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-amber-500">
                <Star className="w-4 h-4 fill-current" />
                <span className="font-semibold text-sm">{child.totalStars || 0}</span>
              </div>
              <div className="flex items-center gap-1.5 text-orange-500">
                <Flame className="w-4 h-4" />
                <span className="font-semibold text-sm">{child.streak || 0}</span>
              </div>
              <div className="flex items-center gap-1.5 text-blue-500">
                <BookOpen className="w-4 h-4" />
                <span className="font-semibold text-sm">{completedChapters}</span>
              </div>
            </div>
          </div>
          <Link href={`/child/${child.id}/lessons`}>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function AddChildDialog({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const { toast } = useToast();
  const { t, isRTL } = useLanguage();
  const parentId = localStorage.getItem("userId");

  const addChildMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/children", {
        parentId,
        name,
        age: parseInt(age),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/children"] });
      toast({ title: t.dashboard.addedSuccess, description: t.dashboard.addedSuccessDesc });
      setName("");
      setAge("");
      setOpen(false);
      onAdd();
    },
    onError: () => {
      toast({ title: t.common.error, description: t.dashboard.addError, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className="border-dashed border-2 cursor-pointer hover:border-primary hover:bg-muted/50 transition-all duration-300" data-testid="button-add-child">
          <CardContent className="p-6 flex flex-col items-center justify-center min-h-[140px] gap-2">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Plus className="w-6 h-6 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">{t.dashboard.addChild}</span>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent dir={isRTL ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{t.dashboard.addChild}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t.dashboard.childName}</Label>
            <Input 
              id="name" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              placeholder={t.dashboard.childNamePlaceholder}
              data-testid="input-child-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">{t.dashboard.childAge}</Label>
            <Input 
              id="age" 
              type="number" 
              min="6" 
              max="12"
              value={age} 
              onChange={(e) => setAge(e.target.value)}
              placeholder={t.dashboard.childAgePlaceholder}
              data-testid="input-child-age"
            />
          </div>
          <Button 
            className="w-full" 
            onClick={() => addChildMutation.mutate()}
            disabled={!name || !age || addChildMutation.isPending}
            data-testid="button-confirm-add-child"
          >
            {addChildMutation.isPending ? t.common.loading : t.common.add}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatsCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground font-arabic">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivity({ chapters }: { chapters: Chapter[] }) {
  const { t, isRTL } = useLanguage();
  const recentChapters = chapters.slice(0, 5);

  const statusLabels: Record<string, { text: string; color: string }> = {
    processing: { text: t.dashboard.statusProcessing, color: "bg-amber-100 text-amber-700" },
    ready: { text: t.dashboard.statusReady, color: "bg-blue-100 text-blue-700" },
    completed: { text: t.dashboard.statusCompleted, color: "bg-green-100 text-green-700" },
  };

  if (recentChapters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.dashboard.recentActivity}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t.dashboard.noActivity}</p>
            <p className="text-sm mt-1">{t.dashboard.addFirstChild}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t.dashboard.recentActivity}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentChapters.map((chapter) => (
          <Link key={chapter.id} href={`/chapter/${chapter.id}`}>
            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer" data-testid={`activity-chapter-${chapter.id}`}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{chapter.title}</p>
                <p className="text-sm text-muted-foreground">{t.subjects[chapter.subject as keyof typeof t.subjects] || chapter.subject}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${statusLabels[chapter.status || "processing"].color}`}>
                {statusLabels[chapter.status || "processing"].text}
              </span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { t, isRTL } = useLanguage();
  const parentId = localStorage.getItem("userId");
  const userName = localStorage.getItem("userName");

  const { data: children, isLoading: loadingChildren } = useQuery<Child[]>({
    queryKey: ["/api/children", parentId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/children?parentId=${parentId}`);
      return res.json();
    },
    enabled: !!parentId,
  });

  const { data: chapters, isLoading: loadingChapters } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters", parentId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/chapters?parentId=${parentId}`);
      return res.json();
    },
    enabled: !!parentId,
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: [`/api/users/${parentId}/notifications/unread-count`],
    enabled: !!parentId,
  });

  const handleLogout = () => {
    // [FIX v2.9.20] Clear ALL user-related data on logout (matching landing.tsx)
    localStorage.removeItem("authToken");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    localStorage.removeItem("pagesRemaining"); // Prevent stale credits showing for next user
    setLocation("/auth");
  };

  if (!parentId) {
    setLocation("/auth");
    return null;
  }

  const totalStars = children?.reduce((sum, child) => sum + (child.totalStars || 0), 0) || 0;
  const totalChapters = chapters?.length || 0;
  const completedChapters = chapters?.filter(c => c.status === "completed").length || 0;

  return (
    <div className="min-h-screen bg-gray-50" dir={isRTL ? "rtl" : "ltr"}>
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setLocation("/")}
                data-testid="button-home"
                title="الصفحة الرئيسية"
              >
                <Home className="w-5 h-5" />
              </Button>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg">LearnSnap</h1>
                <p className="text-xs text-muted-foreground">{t.dashboard.welcome}, {userName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/upload">
                <Button className="gap-2" data-testid="button-upload-chapter">
                  <Upload className="w-4 h-4" />
                  {t.dashboard.uploadChapter}
                </Button>
              </Link>
              <Link href="/leaderboard">
                <Button variant="ghost" size="icon" data-testid="button-leaderboard">
                  <Trophy className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/analytics">
                <Button variant="ghost" size="icon" data-testid="button-analytics">
                  <BarChart3 className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/content-library">
                <Button variant="ghost" size="icon" data-testid="button-content-library">
                  <Library className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/notifications">
                <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                  <Bell className="w-5 h-5" />
                  {(unreadCount?.count || 0) > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                      {unreadCount?.count}
                    </span>
                  )}
                </Button>
              </Link>
              <LanguageToggle />
              <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-logout">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatsCard icon={Star} label={t.dashboard.totalStars} value={totalStars} color="bg-amber-500" />
          <StatsCard icon={BookOpen} label={t.dashboard.completed} value={completedChapters} color="bg-emerald-500" />
          <StatsCard icon={Users} label={t.dashboard.myChildren} value={children?.length || 0} color="bg-blue-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{t.dashboard.myChildren}</h2>
            </div>
            {loadingChildren ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <Skeleton className="w-16 h-16 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-24" />
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {children?.map((child) => (
                  <ChildCard key={child.id} child={child} chapters={chapters || []} />
                ))}
                <AddChildDialog onAdd={() => {}} />
              </div>
            )}
          </div>

          <div>
            {loadingChapters ? (
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-lg" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <RecentActivity chapters={chapters || []} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}