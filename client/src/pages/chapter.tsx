import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowRight, 
  BookOpen, 
  Play, 
  Share2, 
  Trash2,
  Star,
  CheckCircle,
  Clock,
  GraduationCap
} from "lucide-react";
import type { Chapter, ChapterResult } from "@shared/schema";

const subjectLabels: Record<string, string> = {
  math: "الرياضيات",
  science: "العلوم",
  arabic: "اللغة العربية",
  english: "اللغة الإنجليزية",
  islamic: "التربية الإسلامية",
  social: "الدراسات الاجتماعية",
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  processing: { label: "قيد المعالجة", color: "bg-amber-100 text-amber-700", icon: Clock },
  ready: { label: "جاهز للبدء", color: "bg-blue-100 text-blue-700", icon: Play },
  completed: { label: "مكتمل", color: "bg-green-100 text-green-700", icon: CheckCircle },
};

export default function ChapterPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: chapter, isLoading } = useQuery<Chapter>({
    queryKey: ["/api/chapters", id],
    enabled: !!id,
  });

  const { data: result } = useQuery<ChapterResult>({
    queryKey: ["/api/chapters", id, "result"],
    enabled: !!id && chapter?.status === "completed",
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50" dir="rtl">
        <header className="bg-white border-b sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="mr-3 space-y-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-64 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <Card className="text-center p-8">
          <BookOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold font-arabic mb-2">الفصل غير موجود</h2>
          <p className="text-muted-foreground font-arabic mb-4">لم نتمكن من العثور على هذا الفصل</p>
          <Link href="/">
            <Button className="font-arabic">العودة للرئيسية</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const status = statusConfig[chapter.status || "processing"];
  const StatusIcon = status.icon;
  const content = chapter.content;

  const handleShare = () => {
    const childUrl = `${window.location.origin}/child/chapter/${id}/learn`;
    navigator.clipboard.writeText(childUrl);
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold font-arabic line-clamp-1">{chapter.title}</h1>
                <p className="text-xs text-muted-foreground font-arabic">
                  {subjectLabels[chapter.subject]} - الصف {chapter.grade}
                </p>
              </div>
            </div>
            <Badge className={status.color}>
              <StatusIcon className="w-3 h-3 ml-1" />
              {status.label}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {chapter.status === "ready" && (
          <Card className="mb-6 bg-gradient-to-br from-blue-500 to-emerald-500 text-white border-0 overflow-hidden">
            <CardContent className="py-8 relative">
              <div className="absolute left-0 top-0 w-32 h-32 bg-white/10 rounded-full -translate-x-1/2 -translate-y-1/2" />
              <div className="relative z-10">
                <GraduationCap className="w-12 h-12 mb-4" />
                <h2 className="text-2xl font-bold font-arabic mb-2">الفصل جاهز!</h2>
                <p className="font-arabic opacity-90 mb-6">
                  شارك الرابط مع طفلك ليبدأ التعلم
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link href={`/child/chapter/${id}/learn`}>
                    <Button size="lg" variant="secondary" className="font-arabic gap-2" data-testid="button-start-learning">
                      <Play className="w-5 h-5" />
                      ابدأ التعلم
                    </Button>
                  </Link>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="font-arabic gap-2 bg-white/10 border-white/30 hover:bg-white/20"
                    onClick={handleShare}
                    data-testid="button-share"
                  >
                    <Share2 className="w-5 h-5" />
                    نسخ الرابط
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {chapter.status === "completed" && result && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="font-arabic flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                تم إكمال الفصل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 mb-4">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star 
                        key={i} 
                        className={`w-6 h-6 ${i < (result.stars || 0) ? "text-amber-400 fill-amber-400" : "text-gray-200"}`}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground font-arabic">{result.stars} نجوم</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold">{result.totalScore}/15</p>
                  <p className="text-sm text-muted-foreground font-arabic">النتيجة الإجمالية</p>
                </div>
              </div>
              <Link href={`/report/${result.id}`}>
                <Button className="w-full font-arabic" data-testid="button-view-report">
                  عرض التقرير المفصل
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {content && (
          <Card>
            <CardHeader>
              <CardTitle className="font-arabic">محتوى الفصل</CardTitle>
              <CardDescription className="font-arabic">{content.topic}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-bold font-arabic mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  الشرح
                </h3>
                <div className="space-y-3 text-muted-foreground font-arabic leading-relaxed">
                  {content.explanation.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <p className="text-3xl font-bold text-blue-600">{content.practice.length}</p>
                  <p className="text-sm font-arabic text-blue-700">أسئلة تمرين</p>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-xl">
                  <p className="text-3xl font-bold text-emerald-600">{content.test.length}</p>
                  <p className="text-sm font-arabic text-emerald-700">أسئلة اختبار</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
