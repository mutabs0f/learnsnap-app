import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowRight, 
  Star, 
  CheckCircle, 
  XCircle, 
  Clock, 
  TrendingUp,
  AlertTriangle,
  BookOpen,
  RefreshCw,
  Download,
  Loader2
} from "lucide-react";
import { exportReportToPDF } from "@/lib/pdf-export";
import type { ChapterResult, Chapter, Child } from "@shared/schema";

function CircularProgress({ value, size = 120, strokeWidth = 10 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{Math.round(value)}%</span>
        <span className="text-sm text-muted-foreground font-arabic">النتيجة</span>
      </div>
    </div>
  );
}

export default function ReportPage() {
  const { resultId } = useParams<{ resultId: string }>();
  const [isExporting, setIsExporting] = useState(false);

  const { data: result, isLoading: loadingResult } = useQuery<ChapterResult>({
    queryKey: ["/api/results", resultId],
    enabled: !!resultId,
  });

  const { data: chapter } = useQuery<Chapter>({
    queryKey: ["/api/chapters", result?.chapterId],
    enabled: !!result?.chapterId,
  });

  const { data: child } = useQuery<Child>({
    queryKey: ["/api/children", result?.childId],
    enabled: !!result?.childId,
  });

  const handleExportPDF = async () => {
    if (!result || !chapter) return;
    
    setIsExporting(true);
    try {
      await exportReportToPDF({ result, chapter, child });
    } catch (error) {
      console.error("Failed to export PDF:", error);
    } finally {
      setIsExporting(false);
    }
  };

  if (loadingResult || !result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <p className="font-arabic text-muted-foreground">جاري التحميل...</p>
      </div>
    );
  }

  const percentage = Math.round((result.totalScore! / 15) * 100);
  const practiceQuestions = chapter?.content?.practice || [];
  const testQuestions = chapter?.content?.test || [];
  const answers = result.answers as { practiceAnswers: string[]; testAnswers: string[] } | null;

  const practiceResults = practiceQuestions.map((q, i) => ({
    question: q.question,
    correct: q.correct,
    answered: answers?.practiceAnswers?.[i] || "",
    isCorrect: answers?.practiceAnswers?.[i] === q.correct,
  }));

  const testResults = testQuestions.map((q, i) => ({
    question: q.question,
    correct: q.correct,
    answered: answers?.testAnswers?.[i] || "",
    isCorrect: answers?.testAnswers?.[i] === q.correct,
  }));

  const strengths = [...practiceResults, ...testResults].filter(r => r.isCorrect);
  const weaknesses = [...practiceResults, ...testResults].filter(r => !r.isCorrect);

  const timeMinutes = Math.floor((result.timeSpentSeconds || 0) / 60);
  const timeSeconds = (result.timeSpentSeconds || 0) % 60;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="font-bold font-arabic">تقرير الأداء</h1>
                <p className="text-xs text-muted-foreground font-arabic">{chapter?.title}</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={handleExportPDF}
              disabled={isExporting || !chapter}
              className="font-arabic gap-2"
              data-testid="button-export-pdf"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              تحميل PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="md:col-span-1">
            <CardContent className="p-6 flex flex-col items-center justify-center">
              <CircularProgress value={percentage} />
              <div className="flex items-center gap-1 mt-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star 
                    key={i} 
                    className={`w-6 h-6 ${i < (result.stars || 0) ? "text-amber-400 fill-amber-400" : "text-gray-200"}`}
                  />
                ))}
              </div>
              <p className="font-arabic text-muted-foreground mt-2">
                {result.totalScore}/15 نقطة
              </p>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="font-arabic text-lg">ملخص النتائج</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-arabic">التمرين (5 أسئلة)</span>
                  <Badge variant="secondary">{result.practiceScore}/5</Badge>
                </div>
                <Progress value={((result.practiceScore || 0) / 5) * 100} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-arabic">الاختبار (10 أسئلة)</span>
                  <Badge variant="secondary">{result.testScore}/10</Badge>
                </div>
                <Progress value={((result.testScore || 0) / 10) * 100} className="h-2" />
              </div>
              <div className="flex items-center gap-4 pt-4 border-t">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="font-arabic text-sm">
                    {timeMinutes > 0 ? `${timeMinutes} دقيقة و ` : ""}{timeSeconds} ثانية
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="font-arabic text-lg flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                نقاط القوة ({strengths.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {strengths.length === 0 ? (
                <p className="text-muted-foreground font-arabic text-center py-4">لا توجد إجابات صحيحة</p>
              ) : (
                <ul className="space-y-2">
                  {strengths.slice(0, 5).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="font-arabic text-gray-700 line-clamp-2">{item.question}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-arabic text-lg flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-5 h-5" />
                يحتاج تحسين ({weaknesses.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weaknesses.length === 0 ? (
                <p className="text-green-600 font-arabic text-center py-4">ممتاز! كل الإجابات صحيحة</p>
              ) : (
                <ul className="space-y-2">
                  {weaknesses.slice(0, 5).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <span className="font-arabic text-gray-700 line-clamp-2">{item.question}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {weaknesses.length > 0 && (
          <Card className="mb-8 bg-gradient-to-br from-blue-50 to-emerald-50 border-blue-200">
            <CardHeader>
              <CardTitle className="font-arabic text-lg flex items-center gap-2 text-blue-800">
                <TrendingUp className="w-5 h-5" />
                توصيات للتحسين
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 font-arabic text-blue-900">
                <li className="flex items-start gap-2">
                  <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-sm shrink-0">1</span>
                  راجع الأسئلة التي أخطأت فيها وحاول فهم السبب
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-sm shrink-0">2</span>
                  أعد قراءة الشرح وركز على النقاط الصعبة
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-sm shrink-0">3</span>
                  حاول الاختبار مرة أخرى بعد المراجعة
                </li>
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href={`/child/chapter/${result.chapterId}/learn`} className="flex-1">
            <Button variant="outline" size="lg" className="w-full font-arabic gap-2">
              <RefreshCw className="w-5 h-5" />
              إعادة الفصل
            </Button>
          </Link>
          <Link href="/" className="flex-1">
            <Button size="lg" className="w-full font-arabic gap-2">
              <BookOpen className="w-5 h-5" />
              العودة للرئيسية
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
