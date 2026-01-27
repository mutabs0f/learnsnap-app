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
  ClipboardCheck,
  AlertCircle,
  X,
  Home
} from "lucide-react";
import type { QuizSession } from "@shared/schema";

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
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showWarning, setShowWarning] = useState(false);

  const { data: session } = useQuery<QuizSession>({
    queryKey: ["/api/quiz", id],
    refetchInterval: 2000,
    enabled: !!id,
  });

  useEffect(() => {
    if (session?.status === "ready" || session?.status === "completed") {
      setLocation(`/quiz/${id}`);
    }
  }, [session?.status, id, setLocation]);
  
  // Handle error states with appropriate messages
  const errorStatus = session?.status;
  const hasError = errorStatus === "error" || errorStatus === "timeout" || errorStatus === "recapture_required" || errorStatus === "service_error";
  
  const getErrorMessage = () => {
    switch (errorStatus) {
      case "timeout":
        return {
          title: "انتهت مهلة التوليد",
          description: "حاول مرة أخرى بصور أقل (3-5 صفحات)"
        };
      case "recapture_required":
        return {
          title: "الصور غير واضحة",
          description: "أعد تصوير الصفحات بإضاءة أفضل وجودة أعلى"
        };
      case "service_error":
        return {
          title: "الخدمة مشغولة حالياً",
          description: "انتظر دقيقة وحاول مرة أخرى"
        };
      default:
        return {
          title: "حدث خطأ",
          description: "حاول مرة أخرى"
        };
    }
  };

  // Timer for elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Show warning after 90 seconds
  useEffect(() => {
    if (timeElapsed >= 90) {
      setShowWarning(true);
    }
  }, [timeElapsed]);

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

  const handleCancel = () => {
    if (confirm('هل تريد إلغاء توليد الاختبار والعودة؟')) {
      setLocation('/');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Show error UI if there's an error
  if (hasError) {
    const error = getErrorMessage();
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full">
          <Card className="text-center">
            <CardContent className="py-8">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2 font-arabic">{error.title}</h1>
              <p className="text-gray-600 mb-6 font-arabic">{error.description}</p>
              <div className="space-y-3">
                <Button onClick={() => setLocation('/upload')} className="w-full" data-testid="button-retry">
                  حاول مرة أخرى
                </Button>
                <Button variant="outline" onClick={() => setLocation('/')} className="w-full" data-testid="button-home">
                  العودة للرئيسية
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50" dir="rtl">
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
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

      <main className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 md:px-6 py-16">
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
          <p className="text-sm text-muted-foreground mt-2">
            الوقت المنقضي: {formatTime(timeElapsed)}
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

        {showWarning && (
          <Card className="mb-6 border-yellow-200 bg-yellow-50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-right text-sm text-yellow-800">
                  <p className="font-medium mb-1 font-arabic">العملية تأخذ وقتاً أطول من المعتاد</p>
                  <p className="font-arabic">قد يكون بسبب:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1 font-arabic">
                    <li>عدد الصفحات كبير</li>
                    <li>النص غير واضح في الصور</li>
                    <li>ازدحام الخدمة</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 mb-6">
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

        <p className="text-center text-muted-foreground font-arabic text-sm mb-6">
          الوقت المتوقع: 30-90 ثانية
        </p>

        <Button
          variant="outline"
          onClick={handleCancel}
          className="w-full py-3"
          data-testid="button-cancel-processing"
        >
          <X className="w-4 h-4 me-2" aria-hidden="true" />
          إلغاء والعودة
        </Button>

        <div className="mt-6 bg-white/80 rounded-lg p-4 text-right text-sm text-gray-600">
          <p className="font-medium text-gray-900 mb-2 font-arabic">نصائح لتحليل أسرع:</p>
          <ul className="space-y-1 font-arabic">
            <li>- ارفع 3-5 صفحات فقط في كل مرة</li>
            <li>- تأكد من وضوح النص في الصور</li>
            <li>- استخدم إضاءة جيدة عند التصوير</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
