import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Flame, Trophy, Sparkles, ChevronLeft, Award, AlertCircle } from "lucide-react";
import type { Child, ChildBadge, Badge } from "@shared/schema";
import { useChildAuth } from "@/hooks/useChildAuth";

export default function ChildWelcome() {
  const { childId } = useParams<{ childId: string }>();
  const { isAuthenticated, isLoading: authLoading, error: authError } = useChildAuth(childId);

  const { data: child, isLoading } = useQuery<Child>({
    queryKey: ["/api/children", childId],
    enabled: !!childId && isAuthenticated,
  });

  const { data: childBadges } = useQuery<(ChildBadge & { badge: Badge })[]>({
    queryKey: ["/api/children", childId, "badges"],
    enabled: !!childId && isAuthenticated,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <Skeleton className="w-32 h-32 rounded-full mx-auto mb-6" />
          <Skeleton className="h-10 w-48 mx-auto mb-4" />
          <Skeleton className="h-6 w-64 mx-auto" />
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 flex items-center justify-center" dir="rtl">
        <div className="text-center p-8 bg-white/80 rounded-2xl shadow-lg">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-child font-bold text-gray-800 mb-2">عذراً!</h1>
          <p className="text-gray-600 font-arabic">{authError}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <Skeleton className="w-32 h-32 rounded-full mx-auto mb-6" />
          <Skeleton className="h-10 w-48 mx-auto mb-4" />
          <Skeleton className="h-6 w-64 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 flex flex-col" dir="rtl">
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-32 h-32 bg-gradient-to-br from-child-coral to-child-purple rounded-full flex items-center justify-center mb-6 shadow-lg animate-bounce-gentle">
          <span className="text-6xl font-child font-bold text-white">
            {child?.name?.charAt(0) || "؟"}
          </span>
        </div>

        <h1 className="text-4xl font-child font-bold text-gray-800 mb-2" data-testid="text-child-greeting">
          مرحباً {child?.name}!
        </h1>
        <p className="text-xl font-arabic text-gray-600 mb-8">
          يسعدنا رؤيتك اليوم
        </p>

        <div className="flex items-center justify-center gap-6 mb-12">
          <div className="text-center bg-white/60 backdrop-blur-sm rounded-2xl p-4 shadow-md">
            <div className="flex items-center justify-center gap-2 text-amber-500 mb-1">
              <Star className="w-8 h-8 fill-current" />
              <span className="text-3xl font-child font-bold">{child?.totalStars || 0}</span>
            </div>
            <p className="text-sm font-arabic text-gray-600">نجوم</p>
          </div>

          <div className="text-center bg-white/60 backdrop-blur-sm rounded-2xl p-4 shadow-md">
            <div className="flex items-center justify-center gap-2 text-orange-500 mb-1">
              <Flame className="w-8 h-8" />
              <span className="text-3xl font-child font-bold">{child?.streak || 0}</span>
            </div>
            <p className="text-sm font-arabic text-gray-600">أيام متتالية</p>
          </div>

          <Link href={`/child/${childId}/badges`}>
            <div className="text-center bg-white/60 backdrop-blur-sm rounded-2xl p-4 shadow-md hover-elevate cursor-pointer" data-testid="link-badges">
              <div className="flex items-center justify-center gap-2 text-child-purple mb-1">
                <Award className="w-8 h-8" />
                <span className="text-3xl font-child font-bold">{childBadges?.length || 0}</span>
              </div>
              <p className="text-sm font-arabic text-gray-600">شارات</p>
            </div>
          </Link>
        </div>

        <Link href={`/child/${childId}/lessons`}>
          <Button 
            size="lg" 
            className="h-16 px-12 text-xl font-child font-bold rounded-2xl bg-gradient-to-br from-child-coral to-child-purple hover:opacity-90 shadow-lg gap-3"
            data-testid="button-start-lessons"
          >
            <Sparkles className="w-6 h-6" />
            هيا نتعلم!
            <ChevronLeft className="w-6 h-6" />
          </Button>
        </Link>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white/40 to-transparent pointer-events-none" />
    </div>
  );
}
