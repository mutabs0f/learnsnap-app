import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Star, 
  Play, 
  CheckCircle, 
  Clock, 
  ArrowRight,
  BookOpen,
  Calculator,
  Beaker,
  Globe,
  Moon,
  Users,
  AlertCircle
} from "lucide-react";
import type { Chapter, ChapterResult } from "@shared/schema";
import { useChildAuth } from "@/hooks/useChildAuth";

const subjectIcons: Record<string, any> = {
  math: Calculator,
  science: Beaker,
  arabic: BookOpen,
  english: Globe,
  islamic: Moon,
  social: Users,
};

const subjectColors: Record<string, string> = {
  math: "from-child-blue to-blue-600",
  science: "from-child-green to-emerald-600",
  arabic: "from-amber-400 to-orange-500",
  english: "from-child-purple to-purple-600",
  islamic: "from-emerald-400 to-teal-600",
  social: "from-child-coral to-pink-600",
};

const subjectLabels: Record<string, string> = {
  math: "الرياضيات",
  science: "العلوم",
  arabic: "اللغة العربية",
  english: "الإنجليزية",
  islamic: "الإسلامية",
  social: "الاجتماعية",
};

function LessonCard({ chapter, result }: { chapter: Chapter; result?: ChapterResult }) {
  const Icon = subjectIcons[chapter.subject] || BookOpen;
  const colorClass = subjectColors[chapter.subject] || "from-gray-400 to-gray-600";
  const isCompleted = chapter.status === "completed";
  const stars = result?.stars || 0;

  return (
    <Link href={`/child/chapter/${chapter.id}/learn`}>
      <Card 
        className="overflow-hidden hover:scale-[1.02] transition-transform cursor-pointer shadow-lg"
        data-testid={`card-lesson-${chapter.id}`}
      >
        <div className={`h-3 bg-gradient-to-r ${colorClass}`} />
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center shadow-md`}>
              <Icon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-xs font-arabic">
                  {subjectLabels[chapter.subject]}
                </Badge>
                {isCompleted && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
              </div>
              <h3 className="font-child font-bold text-lg mb-1 line-clamp-1" data-testid={`text-lesson-title-${chapter.id}`}>
                {chapter.title}
              </h3>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star 
                    key={i} 
                    className={`w-4 h-4 ${i < stars ? "text-amber-400 fill-amber-400" : "text-gray-200"}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <Button 
            className={`w-full mt-4 font-child font-bold h-12 rounded-xl ${
              isCompleted 
                ? "bg-gradient-to-r from-green-400 to-emerald-500" 
                : `bg-gradient-to-r ${colorClass}`
            }`}
            data-testid={`button-lesson-${chapter.id}`}
          >
            {isCompleted ? (
              <>
                <CheckCircle className="w-5 h-5 ml-2" />
                مراجعة
              </>
            ) : chapter.status === "processing" ? (
              <>
                <Clock className="w-5 h-5 ml-2" />
                قيد التحضير...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 ml-2" />
                ابدأ!
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ChildLessons() {
  const { childId } = useParams<{ childId: string }>();
  const { isAuthenticated, isLoading: authLoading, error: authError } = useChildAuth(childId);

  const { data: chapters, isLoading } = useQuery<Chapter[]>({
    queryKey: ["/api/children", childId, "chapters"],
    enabled: !!childId && isAuthenticated,
  });

  const { data: results } = useQuery<ChapterResult[]>({
    queryKey: ["/api/children", childId, "results"],
    enabled: !!childId && isAuthenticated,
  });

  const readyChapters = chapters?.filter(c => c.status === "ready" || c.status === "completed") || [];
  const processingChapters = chapters?.filter(c => c.status === "processing") || [];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <Skeleton className="w-16 h-16 rounded-xl mx-auto mb-4" />
          <Skeleton className="h-6 w-32 mx-auto" />
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-blue-100" dir="rtl">
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center h-16 gap-4">
            <Link href={`/child/${childId}/welcome`}>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ArrowRight className="w-6 h-6" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-child-coral to-child-purple rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <h1 className="font-child font-bold text-xl">دروسي</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <div className="h-3 bg-gray-200" />
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <Skeleton className="w-14 h-14 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-12 w-full mt-4 rounded-xl" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : readyChapters.length === 0 && processingChapters.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-white/60 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-12 h-12 text-gray-400" />
            </div>
            <h2 className="text-2xl font-child font-bold text-gray-700 mb-2">
              لا توجد دروس بعد
            </h2>
            <p className="font-arabic text-gray-500">
              اطلب من والديك إضافة درس جديد
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {readyChapters.map((chapter) => {
              const result = results?.find(r => r.chapterId === chapter.id);
              return <LessonCard key={chapter.id} chapter={chapter} result={result} />;
            })}
            
            {processingChapters.length > 0 && (
              <>
                <h2 className="font-child font-bold text-lg text-gray-600 mt-6 mb-2">
                  قيد التحضير...
                </h2>
                {processingChapters.map((chapter) => (
                  <Card key={chapter.id} className="opacity-60">
                    <div className="h-3 bg-gray-300" />
                    <CardContent className="p-5">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-gray-200 flex items-center justify-center animate-pulse">
                          <Clock className="w-7 h-7 text-gray-400" />
                        </div>
                        <div>
                          <p className="font-child font-bold text-lg">{chapter.title}</p>
                          <p className="text-sm text-gray-500 font-arabic">جاري التحضير...</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
