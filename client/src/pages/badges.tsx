import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Trophy, Star, Flame, Crown, Zap, BookOpen, Calculator, Beaker, GraduationCap, Lock, Sparkles, Award, Target, Rocket } from "lucide-react";
import type { Badge as BadgeType, ChildBadge } from "@shared/schema";

const iconMap: Record<string, any> = {
  Footprints: Rocket, // Using Rocket as fallback for Footprints
  Star,
  Flame,
  Trophy,
  Calculator,
  Beaker,
  BookOpen,
  GraduationCap,
  Zap,
  Crown,
  Award,
  Target,
  Rocket,
};

const colorMap: Record<string, string> = {
  amber: "from-amber-400 to-amber-600",
  yellow: "from-yellow-400 to-yellow-600",
  orange: "from-orange-400 to-orange-600",
  purple: "from-purple-400 to-purple-600",
  blue: "from-blue-400 to-blue-600",
  green: "from-green-400 to-green-600",
  teal: "from-teal-400 to-teal-600",
  indigo: "from-indigo-400 to-indigo-600",
  cyan: "from-cyan-400 to-cyan-600",
  gold: "from-yellow-500 to-amber-600",
};

const rarityColors: Record<string, string> = {
  common: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  rare: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  epic: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  legendary: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

const rarityNamesAr: Record<string, string> = {
  common: "عادي",
  rare: "نادر",
  epic: "ملحمي",
  legendary: "أسطوري",
};

export default function BadgesPage() {
  const params = useParams<{ childId: string }>();
  const childId = params.childId;

  const { data: allBadges, isLoading: loadingAll } = useQuery<BadgeType[]>({
    queryKey: ["/api/badges"],
  });

  const { data: earnedBadges, isLoading: loadingEarned } = useQuery<(ChildBadge & { badge: BadgeType })[]>({
    queryKey: ["/api/children", childId, "badges"],
    enabled: !!childId,
  });

  const earnedIds = new Set(earnedBadges?.map((cb) => cb.badgeId) || []);

  if (loadingAll || loadingEarned) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-coral-100 via-turquoise-50 to-sunny-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-turquoise-500 border-t-transparent" />
      </div>
    );
  }

  const earnedCount = earnedBadges?.length || 0;
  const totalCount = allBadges?.length || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-coral-100 via-turquoise-50 to-sunny-100" dir="rtl">
      <header className="bg-gradient-to-l from-coral-500 to-turquoise-500 text-white p-4 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8" />
            <div>
              <h1 className="font-child text-xl font-bold">شاراتي</h1>
              <p className="text-sm opacity-90 font-child">{earnedCount} من {totalCount} شارة</p>
            </div>
          </div>
          <Link href={`/child/${childId}/lessons`}>
            <Button variant="secondary" size="sm" className="font-child gap-2" data-testid="button-back-lessons">
              <ArrowRight className="w-4 h-4" />
              الدروس
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 pb-20">
        {earnedBadges && earnedBadges.length > 0 && (
          <section className="mb-8">
            <h2 className="font-child text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-500" />
              الشارات المكتسبة
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {earnedBadges.map((cb) => {
                const IconComponent = iconMap[cb.badge.icon] || Star;
                const gradientClass = colorMap[cb.badge.color] || "from-gray-400 to-gray-600";
                
                return (
                  <Card 
                    key={cb.id} 
                    className="overflow-hidden hover-elevate" 
                    data-testid={`badge-earned-${cb.badgeId}`}
                  >
                    <CardContent className="p-4 text-center">
                      <div className={`w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center shadow-lg`}>
                        <IconComponent className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="font-child font-bold text-gray-800 mb-1">{cb.badge.nameAr}</h3>
                      <p className="text-xs text-muted-foreground font-child mb-2">{cb.badge.descriptionAr}</p>
                      <Badge className={`${rarityColors[cb.badge.rarity || "common"]} text-xs`}>
                        {rarityNamesAr[cb.badge.rarity || "common"]}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-child text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Lock className="w-6 h-6 text-gray-400" />
            شارات للفتح
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {allBadges?.filter((b) => !earnedIds.has(b.id)).map((badge) => {
              const IconComponent = iconMap[badge.icon] || Star;
              
              return (
                <Card 
                  key={badge.id} 
                  className="overflow-hidden opacity-60" 
                  data-testid={`badge-locked-${badge.id}`}
                >
                  <CardContent className="p-4 text-center">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                      <Lock className="w-8 h-8 text-gray-500" />
                    </div>
                    <h3 className="font-child font-bold text-gray-600 dark:text-gray-400 mb-1">{badge.nameAr}</h3>
                    <p className="text-xs text-muted-foreground font-child mb-2">{badge.descriptionAr}</p>
                    <Badge className={`${rarityColors[badge.rarity || "common"]} text-xs`}>
                      {rarityNamesAr[badge.rarity || "common"]}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
