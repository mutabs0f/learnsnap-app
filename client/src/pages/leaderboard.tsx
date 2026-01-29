import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Trophy, Star, Award, Medal, Crown } from "lucide-react";

type LeaderboardEntry = {
  childId: string;
  name: string;
  totalStars: number;
  badgeCount: number;
  rank: number;
};

export default function LeaderboardPage() {
  const [, setLocation] = useLocation();
  const userId = localStorage.getItem("userId");

  const { data: leaderboard, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/parents", userId, "leaderboard"],
    enabled: !!userId,
  });

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-6 h-6 text-amber-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Medal className="w-6 h-6 text-amber-700" />;
      default:
        return <span className="w-6 h-6 flex items-center justify-center font-bold text-muted-foreground">{rank}</span>;
    }
  };

  const getRankGradient = (rank: number) => {
    switch (rank) {
      case 1:
        return "from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800";
      case 2:
        return "from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-gray-200 dark:border-gray-700";
      case 3:
        return "from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800";
      default:
        return "";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="max-w-4xl mx-auto p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold font-arabic text-lg">لوحة المتصدرين</h1>
              <p className="text-xs text-muted-foreground font-arabic">تنافس الأبناء</p>
            </div>
          </div>
          <Link href="/">
            <Button variant="ghost" className="font-arabic gap-2" data-testid="button-back-dashboard">
              <ArrowRight className="w-4 h-4" />
              الرئيسية
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 pb-20">
        {!leaderboard || leaderboard.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Trophy className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="font-arabic text-lg font-bold mb-2">لا يوجد أبناء بعد</h2>
              <p className="text-muted-foreground font-arabic mb-4">
                أضف أبناءك من الصفحة الرئيسية لبدء المنافسة
              </p>
              <Link href="/">
                <Button className="font-arabic" data-testid="button-add-children">إضافة أبناء</Button>
              </Link>
            </CardContent>
          </Card>
        ) : leaderboard.length === 1 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Trophy className="w-16 h-16 mx-auto mb-4 text-amber-500" />
              <h2 className="font-arabic text-lg font-bold mb-2">{leaderboard[0].name} هو البطل</h2>
              <p className="text-muted-foreground font-arabic mb-4">
                أضف طفلاً آخر لبدء المنافسة بين الأبناء
              </p>
              <div className="flex items-center justify-center gap-6 mt-6">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-amber-500">
                    <Star className="w-5 h-5" />
                    <span className="text-2xl font-bold">{leaderboard[0].totalStars}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-arabic">نجوم</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-purple-500">
                    <Award className="w-5 h-5" />
                    <span className="text-2xl font-bold">{leaderboard[0].badgeCount}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-arabic">شارات</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-arabic text-base flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  ترتيب الأبناء
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.childId}
                    className={`flex items-center gap-4 p-4 rounded-md border bg-gradient-to-l ${getRankGradient(entry.rank)}`}
                    data-testid={`leaderboard-entry-${entry.childId}`}
                  >
                    <div className="flex-shrink-0">{getRankIcon(entry.rank)}</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-arabic font-bold truncate">{entry.name}</h3>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-1 text-amber-500">
                          <Star className="w-4 h-4" />
                          <span className="text-sm font-bold">{entry.totalStars}</span>
                          <span className="text-xs text-muted-foreground font-arabic">نجوم</span>
                        </div>
                        <div className="flex items-center gap-1 text-purple-500">
                          <Award className="w-4 h-4" />
                          <span className="text-sm font-bold">{entry.badgeCount}</span>
                          <span className="text-xs text-muted-foreground font-arabic">شارات</span>
                        </div>
                      </div>
                    </div>
                    {entry.rank <= 3 && (
                      <Badge 
                        className={
                          entry.rank === 1 
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" 
                            : entry.rank === 2 
                            ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" 
                            : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                        }
                      >
                        {entry.rank === 1 ? "ذهبي" : entry.rank === 2 ? "فضي" : "برونزي"}
                      </Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-muted-foreground font-arabic text-sm">
                  شجع أبناءك على التعلم وجمع النجوم والشارات للتقدم في الترتيب
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
