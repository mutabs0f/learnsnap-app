import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Loader2, 
  Sparkles, 
  BookOpen, 
  CheckCircle,
  ArrowRight,
  Brain,
  FileText,
  ClipboardCheck
} from "lucide-react";
import type { Chapter } from "@shared/schema";

const processingSteps = [
  { icon: FileText, label: "تحليل الصور", description: "قراءة محتوى الصفحات" },
  { icon: Brain, label: "فهم المحتوى", description: "استخراج المفاهيم الأساسية" },
  { icon: Sparkles, label: "إنشاء الشرح", description: "تبسيط المحتوى للأطفال" },
  { icon: ClipboardCheck, label: "إنشاء الأسئلة", description: "تحضير تمارين واختبار" },
];

const didYouKnow = [
  "الدماغ البشري يستطيع تخزين 2.5 بيتابايت من المعلومات!",
  "النحل يستطيع التعرف على الوجوه البشرية!",
  "القلب ينبض حوالي 100,000 مرة في اليوم!",
  "الضوء يسافر بسرعة 300,000 كيلومتر في الثانية!",
  "الماء يغطي 71% من سطح الأرض!",
];

export default function ProcessingPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [fact, setFact] = useState(didYouKnow[0]);

  const { data: chapter } = useQuery<Chapter>({
    queryKey: ["/api/chapters", id],
    refetchInterval: 2000,
    enabled: !!id,
  });

  useEffect(() => {
    if (chapter?.status === "ready" || chapter?.status === "completed") {
      setLocation(`/chapter/${id}`);
    }
  }, [chapter?.status, id, setLocation]);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % processingSteps.length);
    }, 4000);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return 95;
        return prev + Math.random() * 3;
      });
    }, 500);

    const factInterval = setInterval(() => {
      setFact(didYouKnow[Math.floor(Math.random() * didYouKnow.length)]);
    }, 6000);

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
      clearInterval(factInterval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50" dir="rtl">
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold font-arabic">جاري المعالجة</h1>
                <p className="text-xs text-muted-foreground font-arabic">يتم تحضير الفصل...</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-pulse-glow">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          </div>
          <h1 className="text-3xl font-bold font-arabic mb-3">
            جاري تحضير الفصل
          </h1>
          <p className="text-muted-foreground font-arabic text-lg">
            الذكاء الاصطناعي يعمل على إنشاء محتوى تعليمي مميز
          </p>
        </div>

        <Card className="mb-8">
          <CardContent className="py-6">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-arabic text-sm text-muted-foreground">التقدم</span>
                <span className="font-arabic text-sm font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>

            <div className="space-y-4 mt-6">
              {processingSteps.map((step, index) => (
                <div 
                  key={index} 
                  className={`flex items-center gap-4 p-3 rounded-lg transition-all duration-300 ${
                    index === currentStep 
                      ? "bg-primary/10 scale-[1.02]" 
                      : index < currentStep 
                        ? "opacity-50" 
                        : "opacity-30"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                    index === currentStep 
                      ? "bg-primary text-white" 
                      : index < currentStep 
                        ? "bg-green-100 text-green-600" 
                        : "bg-muted text-muted-foreground"
                  }`}>
                    {index < currentStep ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <step.icon className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-arabic font-medium">{step.label}</p>
                    <p className="text-sm text-muted-foreground font-arabic">{step.description}</p>
                  </div>
                  {index === currentStep && (
                    <Loader2 className="w-5 h-5 text-primary animate-spin mr-auto" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold font-arabic text-amber-800 mb-1">هل تعلم؟</h3>
                <p className="font-arabic text-amber-700 animate-slide-up" key={fact}>
                  {fact}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-muted-foreground font-arabic mt-8 text-sm">
          المعالجة تستغرق عادة 30-60 ثانية
        </p>
      </main>
    </div>
  );
}
