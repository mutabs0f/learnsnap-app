import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Loader2, CheckCircle, XCircle, ChevronLeft, BookOpen, Lightbulb, PlayCircle, Check, X, Volume2, VolumeX, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Question, Lesson, LessonStep } from "@shared/schema";
import { Star, Sparkles, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useConfetti } from "@/hooks/useConfetti";
import { useSoundEffects } from "@/hooks/useSoundEffects";

// [GO-2] CHANGE: Added processing info for progress tracking
interface QuizSession {
  id: string;
  lesson: Lesson | null;
  questions: Question[];
  status: string;
  processing?: {
    progress: number;
    stage: string;
    etaSeconds: number;
  };
}

type QuizPhase = "loading" | "lesson" | "quiz";

export default function QuizPage() {
  const params = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { celebrate } = useConfetti();
  const sounds = useSoundEffects();
  
  const [phase, setPhase] = useState<QuizPhase>("loading");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  
  // Lesson step state
  const [currentStep, setCurrentStep] = useState(0);
  const [practiceAnswer, setPracticeAnswer] = useState<string | null>(null);
  const [showPracticeFeedback, setShowPracticeFeedback] = useState(false);
  const [showHint, setShowHint] = useState(false);
  
  // Fill blank state
  const [fillBlankAnswer, setFillBlankAnswer] = useState("");
  
  // Matching state - stores selected pairs
  const [matchingSelections, setMatchingSelections] = useState<Record<string, string>>({});
  const [shuffledRightOptions, setShuffledRightOptions] = useState<string[]>([]);

  const { data: session, isLoading, error } = useQuery<QuizSession>({
    queryKey: ["/api/quiz", params.sessionId],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "processing") return 2000;
      return false;
    }
  });

  // [GO-1] Refresh credits when quiz becomes ready (credits charged on success)
  useEffect(() => {
    if (session?.status === "ready" && phase === "loading") {
      setPhase("lesson");
      // Refresh credits from server since they were charged on success
      const refreshCredits = async () => {
        try {
          const deviceId = localStorage.getItem("deviceId");
          if (deviceId) {
            const response = await fetch(`/api/credits/${deviceId}`);
            if (response.ok) {
              const data = await response.json();
              localStorage.setItem("pagesRemaining", String(data.pagesRemaining));
            }
          }
        } catch {}
      };
      refreshCredits();
    }
  }, [session?.status, phase]);
  
  // Shuffle right options for matching questions when question changes
  useEffect(() => {
    const question = session?.questions?.[currentQuestion];
    if (question?.type === "matching" && (question as any).pairs) {
      const rightOptions = (question as any).pairs.map((p: any) => p.right);
      // Fisher-Yates shuffle
      const shuffled = [...rightOptions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setShuffledRightOptions(shuffled);
    }
  }, [currentQuestion, session?.questions]);

  const submitMutation = useMutation({
    mutationFn: async (finalAnswers: string[]) => {
      const response = await apiRequest("POST", `/api/quiz/${params.sessionId}/submit`, {
        answers: finalAnswers
      });
      return response.json();
    },
    onSuccess: () => {
      setLocation(`/result/${params.sessionId}`);
    },
    onError: () => {
      toast({
        title: "حدث خطأ",
        description: "فشل في إرسال الإجابات. حاول مرة أخرى.",
        variant: "destructive"
      });
    }
  });

  const questions = session?.questions || [];
  const totalQuestions = questions.length;
  const progress = totalQuestions > 0 ? ((currentQuestion + 1) / totalQuestions) * 100 : 0;

  const handleSelectAnswer = (answer: string) => {
    if (showFeedback) return;
    setSelectedAnswer(answer);
  };

  const handleNext = () => {
    if (!selectedAnswer) return;

    const newAnswers = [...answers, selectedAnswer];
    setAnswers(newAnswers);

    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
      // Reset question-type specific state
      setFillBlankAnswer("");
      setMatchingSelections({});
    } else {
      submitMutation.mutate(newAnswers);
    }
  };

  const handleShowFeedback = () => {
    if (!selectedAnswer) return;
    setShowFeedback(true);
    
    const question = questions[currentQuestion];
    const qType = (question as any).type || "multiple_choice";
    let isCorrect = false;
    
    if (qType === "multiple_choice") {
      const arabicToEnglishMap: Record<string, string> = { "أ": "A", "ب": "B", "ج": "C", "د": "D" };
      const englishAnswer = arabicToEnglishMap[selectedAnswer] || selectedAnswer;
      isCorrect = englishAnswer === (question as any).correct;
    } else if (qType === "true_false") {
      isCorrect = (selectedAnswer === "true") === (question as any).correct;
    } else if (qType === "fill_blank") {
      const userAns = fillBlankAnswer.trim().toLowerCase();
      const correctAns = ((question as any).correct || "").toLowerCase();
      isCorrect = userAns === correctAns || userAns.includes(correctAns) || correctAns.includes(userAns);
    } else if (qType === "matching") {
      isCorrect = selectedAnswer === "correct";
    }
    
    if (isCorrect) {
      sounds.playCorrect();
      celebrate('correct');
    } else {
      sounds.playWrong();
    }
  };

  const startQuiz = () => {
    setPhase("quiz");
  };

  // FIX: Only check isLoading for initial query load, not phase
  // This allows processing/error states to be displayed properly
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-duo-green-50 via-duo-blue-50 to-white dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Loader2 className="h-12 w-12 animate-spin text-duo-green-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">جاري تحميل الاختبار...</p>
        </motion.div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-duo-green-50 via-duo-blue-50 to-white dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">حدث خطأ</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">لم نتمكن من تحميل الاختبار</p>
            <Button onClick={() => setLocation("/upload")}>
              حاول مرة أخرى
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // [GO-2] Processing state with progress tracking
  if (session.status === "processing") {
    const processing = session.processing;
    const progress = processing?.progress || 15;
    const stage = processing?.stage || 'جاري المعالجة';
    const etaSeconds = processing?.etaSeconds || 60;
    
    // Format ETA
    const formatEta = (seconds: number) => {
      if (seconds < 20) return 'قريبين...';
      if (seconds < 60) return `~ ${Math.ceil(seconds)} ثانية`;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `~ ${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    // Stage titles and subtitles
    const stageInfo: Record<string, { title: string; subtitle: string }> = {
      'تهيئة الطلب': { title: 'نجهّز الاختبار...', subtitle: 'بنرتّب الصور ونجهزها للقراءة. لحظات.' },
      'تحسين الصور': { title: 'نحسّن جودة الصور...', subtitle: 'نقلّل الضوضاء ونضبط الوضوح عشان تكون القراءة أدق.' },
      'قراءة النص من الصور': { title: 'نقرأ المحتوى من الصفحات...', subtitle: 'نلتقط النص والأفكار الأساسية من الكتاب.' },
      'توليد الأسئلة': { title: 'نولّد أسئلة ذكية...', subtitle: 'نصنع أسئلة تناسب مستوى الصفحة وتغطي أهم النقاط.' },
      'التحقق من الإجابات': { title: 'نتحقق من الإجابات...', subtitle: 'نتأكد أن كل إجابة صحيحة.' },
      'التحقق من الجودة': { title: 'نراجع الجودة قبل الإرسال...', subtitle: 'نتأكد أن الأسئلة من نفس المحتوى وما فيها أخطاء.' },
      'حفظ النتائج': { title: 'نجهّزها لك...', subtitle: 'نرتّب الاختبار ونحفظه عشان يفتح بسرعة.' },
      'اكتمل': { title: 'جاهز', subtitle: 'تفضل، هذا اختبارك!' },
    };
    
    const info = stageInfo[stage] || { title: stage, subtitle: 'جاري المعالجة...' };
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-duo-green-50 via-duo-blue-50 to-white dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-duo-blue-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2" data-testid="text-processing-title">{info.title}</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4" data-testid="text-processing-subtitle">{info.subtitle}</p>
            <Progress value={progress} className="h-3 mb-3" data-testid="progress-bar" />
            <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
              <span data-testid="text-progress-percent">{progress}%</span>
              <span data-testid="text-eta">متبقي تقريباً: {formatEta(etaSeconds)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // FIX: Handle queued status
  if (session.status === "queued") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-duo-green-50 via-duo-blue-50 to-white dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-duo-blue-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2" data-testid="text-queued-title">بانتظار بدء المعالجة...</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">طلبك في قائمة الانتظار وسيبدأ قريباً</p>
            <Progress value={5} className="h-3 mb-3" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // FIX: Handle timeout status
  if (session.status === "timeout") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-duo-orange-50 to-white dark:from-gray-900 dark:via-red-900/20 dark:to-gray-900 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">انتهى الوقت</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              استغرقت المعالجة وقتاً أطول من المتوقع. حاول مجدداً بصور أقل أو أوضح.
            </p>
            <Button onClick={() => setLocation("/upload")} data-testid="button-retry-timeout">
              حاول مرة أخرى
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // FIX: Handle service_error and validation_unavailable
  if (session.status === "service_error" || session.status === "validation_unavailable") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-duo-orange-50 to-white dark:from-gray-900 dark:via-red-900/20 dark:to-gray-900 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">الخدمة غير متوفرة مؤقتاً</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              حدثت مشكلة في خدمة الذكاء الاصطناعي. لم يتم خصم أي رصيد. حاول مجدداً بعد دقيقة.
            </p>
            <Button onClick={() => setLocation("/upload")} data-testid="button-retry-service">
              حاول مرة أخرى
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // FIX: Handle recapture_required
  if (session.status === "recapture_required") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-duo-orange-50 to-white dark:from-gray-900 dark:via-red-900/20 dark:to-gray-900 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">الصور غير واضحة</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              لم نتمكن من قراءة النص من الصور. الرجاء إعادة تصوير الصفحات بإضاءة أفضل وجودة أعلى.
            </p>
            <Button onClick={() => setLocation("/upload")} data-testid="button-recapture">
              إعادة التصوير
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (session.status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-duo-orange-50 to-white dark:from-gray-900 dark:via-red-900/20 dark:to-gray-900 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">فشل تحليل الصورة</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              لم نتمكن من توليد الأسئلة. تأكد من أن الصورة واضحة وتحتوي على نص مقروء.
            </p>
            <Button onClick={() => setLocation("/upload")} data-testid="button-retry-upload">
              حاول مرة أخرى
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Lesson Phase - Interactive lesson with steps
  if (phase === "lesson" && session.lesson) {
    const lesson = session.lesson;
    const steps = lesson.steps || [];
    const hasSteps = steps.length > 0;
    const step = hasSteps ? steps[currentStep] : null;
    const isLastStep = currentStep >= steps.length - 1;
    const practiceLabels = ["A", "B", "C", "D"];

    const handleNextStep = () => {
      if (step?.type === "practice" && !showPracticeFeedback) {
        setShowPracticeFeedback(true);
        return;
      }
      
      if (isLastStep) {
        startQuiz();
      } else {
        setCurrentStep(currentStep + 1);
        setPracticeAnswer(null);
        setShowPracticeFeedback(false);
        setShowHint(false);
      }
    };

    const isPracticeCorrect = step?.type === "practice" && practiceAnswer === step.correctAnswer;

    return (
      <div className="min-h-screen bg-gradient-to-br from-duo-green-50 via-duo-blue-50 to-white dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col">
        <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between gap-2 max-w-md mx-auto">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation("/upload")}
              data-testid="button-back"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <span className="font-medium text-gray-600 dark:text-gray-300">
              {hasSteps ? `الخطوة ${currentStep + 1} من ${steps.length}` : "ملخص الدرس"}
            </span>
            <div className="w-9" />
          </div>
          {hasSteps && (
            <div className="max-w-md mx-auto mt-2">
              <Progress value={((currentStep + 1) / steps.length) * 100} className="h-2" />
            </div>
          )}
        </header>

        <main className="flex-1 px-4 py-6 max-w-md md:max-w-xl lg:max-w-2xl mx-auto w-full">
          {/* Lesson Title */}
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-6 w-6 text-blue-500" />
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">{lesson.title}</h1>
          </div>

          {/* Warnings from AI processing */}
          {session.warnings && session.warnings.length > 0 && (
            <Card className="mb-4 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    {session.warnings.map((warning: string, idx: number) => (
                      <p key={idx} className="text-sm text-amber-700 dark:text-amber-300">{warning}</p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step Content */}
          {hasSteps && step ? (
            <Card className="mb-4">
              <CardContent className="p-5">
                {/* Step Type Badge */}
                <div className="flex items-center gap-2 mb-4">
                  {step.type === "explanation" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm">
                      <Lightbulb className="h-4 w-4" />
                      شرح
                    </span>
                  )}
                  {step.type === "example" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm">
                      <Star className="h-4 w-4" />
                      مثال
                    </span>
                  )}
                  {step.type === "practice" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-sm">
                      <Sparkles className="h-4 w-4" />
                      تدريب
                    </span>
                  )}
                </div>

                {/* Main Content */}
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg mb-4">
                  {step.content}
                </p>

                {/* Practice Question */}
                {step.type === "practice" && step.question && (
                  <div className="mt-4 space-y-3">
                    <p className="font-medium text-gray-800 dark:text-gray-200">{step.question}</p>
                    
                    {step.options && step.options.map((option, idx) => {
                      const label = practiceLabels[idx];
                      const isSelected = practiceAnswer === label;
                      const isCorrect = showPracticeFeedback && label === step.correctAnswer;
                      const isWrong = showPracticeFeedback && isSelected && label !== step.correctAnswer;

                      return (
                        <Card
                          key={idx}
                          className={`cursor-pointer transition-all ${
                            isCorrect
                              ? "border-2 border-green-500 bg-green-50 dark:bg-green-900/30"
                              : isWrong
                              ? "border-2 border-red-500 bg-red-50 dark:bg-red-900/30"
                              : isSelected
                              ? "border-2 border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                              : "hover-elevate"
                          }`}
                          onClick={() => !showPracticeFeedback && setPracticeAnswer(label)}
                          data-testid={`practice-option-${label}`}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${
                                isCorrect
                                  ? "bg-green-500 text-white"
                                  : isWrong
                                  ? "bg-red-500 text-white"
                                  : isSelected
                                  ? "bg-purple-500 text-white"
                                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                              }`}
                            >
                              {isCorrect ? <CheckCircle className="h-4 w-4" /> : isWrong ? <XCircle className="h-4 w-4" /> : label}
                            </div>
                            <span className="text-gray-700 dark:text-gray-300">{option}</span>
                          </CardContent>
                        </Card>
                      );
                    })}

                    {/* Hint Button */}
                    {step.hint && !showPracticeFeedback && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowHint(!showHint)}
                        className="text-purple-600 dark:text-purple-400"
                        data-testid="button-hint"
                      >
                        <HelpCircle className="h-4 w-4 ml-1" />
                        {showHint ? "إخفاء التلميح" : "أحتاج مساعدة"}
                      </Button>
                    )}

                    {/* Show Hint */}
                    {showHint && step.hint && (
                      <Card className="bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700">
                        <CardContent className="p-3">
                          <p className="text-sm text-yellow-800 dark:text-yellow-200">
                            <strong>تلميح:</strong> {step.hint}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Feedback Message */}
                    {showPracticeFeedback && (
                      <Card className={`${isPracticeCorrect ? "bg-green-50 dark:bg-green-900/30 border-green-200" : "bg-orange-50 dark:bg-orange-900/30 border-orange-200"}`}>
                        <CardContent className="p-4 text-center">
                          {isPracticeCorrect ? (
                            <>
                              <Sparkles className="h-8 w-8 text-green-500 mx-auto mb-2" />
                              <p className="text-lg font-bold text-green-700 dark:text-green-300">شاطر! أحسنت!</p>
                            </>
                          ) : (
                            <>
                              <Star className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                              <p className="text-lg font-bold text-orange-700 dark:text-orange-300">لا بأس، حاول مرة أخرى!</p>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Fallback: Simple lesson summary if no steps */
            <Card className="mb-4">
              <CardContent className="p-5">
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                  {lesson.summary}
                </p>
                
                {lesson.keyPoints.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <Lightbulb className="h-5 w-5" />
                      <span className="font-medium">النقاط الرئيسية:</span>
                    </div>
                    <ul className="space-y-2">
                      {lesson.keyPoints.map((point, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-sm font-medium shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-gray-700 dark:text-gray-300">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </main>

        {/* Bottom Action */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t p-4">
          <div className="max-w-md md:max-w-xl lg:max-w-2xl mx-auto">
            <Button
              className="w-full h-12"
              onClick={handleNextStep}
              disabled={step?.type === "practice" && !practiceAnswer && !showPracticeFeedback}
              data-testid="button-next-step"
            >
              {isLastStep || !hasSteps ? (
                <>
                  <PlayCircle className="h-5 w-5 ml-2" />
                  ابدأ الاختبار ({totalQuestions} أسئلة)
                </>
              ) : step?.type === "practice" && !showPracticeFeedback ? (
                "تحقق من الإجابة"
              ) : (
                "التالي"
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Quiz Phase
  const question = questions[currentQuestion];
  if (!question) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-duo-green-50 via-duo-blue-50 to-white dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <p>لا توجد أسئلة</p>
      </div>
    );
  }

  const optionLabelsArabic = ["أ", "ب", "ج", "د"];
  const optionLabelsEnglish = ["A", "B", "C", "D"];
  
  // Map Arabic to English for comparison with AI answers
  const arabicToEnglish: Record<string, string> = { "أ": "A", "ب": "B", "ج": "C", "د": "D" };
  const englishToArabic: Record<string, string> = { "A": "أ", "B": "ب", "C": "ج", "D": "د" };

  // Strip letter prefixes from options (e.g., "A. 50" -> "50")
  const cleanOption = (option: string): string => {
    return option.replace(/^[A-Da-dأبجد][\.\)\:\-]\s*/, '').trim();
  };

  // [FIX #3] Detect text direction based on content
  const getTextDirection = (text: string): 'rtl' | 'ltr' => {
    if (!text) return 'rtl';
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    const trimmed = text.trim();
    for (let i = 0; i < Math.min(trimmed.length, 10); i++) {
      if (arabicPattern.test(trimmed[i])) return 'rtl';
      if (/[a-zA-Z]/.test(trimmed[i])) return 'ltr';
    }
    return 'rtl';
  };

  // [FIX #5] Format question text - remove numbering, fix punctuation
  const formatQuestionText = (text: string): string => {
    if (!text) return text;
    let cleaned = text.trim();
    
    // Remove leading numbers like "1." or "1)" or "السؤال 1:"
    cleaned = cleaned.replace(/^(?:\d+[\.\)\:]|\s*السؤال\s*\d+\s*[:\-]?)\s*/i, '');
    
    // Remove misplaced question marks from start
    cleaned = cleaned.replace(/^[؟?]+\s*/, '');
    
    // Detect language
    const isArabic = /[\u0600-\u06FF]/.test(cleaned);
    const isEnglish = /^[A-Za-z]/.test(cleaned.trim());
    
    // Check if it's a question
    const isQuestion = 
      cleaned.includes('؟') || 
      cleaned.includes('?') ||
      /^(what|where|when|who|why|how|do|does|did|is|are|was|were|can|could|will|would|ما|من|أين|متى|كيف|هل|لماذا)/i.test(cleaned);
    
    if (isQuestion) {
      // Remove any existing question marks first
      cleaned = cleaned.replace(/[؟?]+$/, '').trim();
      // Add appropriate question mark
      if (isEnglish && !isArabic) {
        cleaned = cleaned + '?';
      } else {
        cleaned = cleaned + '؟';
      }
    }
    
    // Remove double punctuation
    cleaned = cleaned.replace(/([؟?:]){2,}/g, '$1');
    
    return cleaned.trim();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-duo-green-50 via-duo-blue-50 to-white dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b px-4 py-3 shadow-lg">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              sounds.playClick();
              if (confirm("هل تريد الخروج من الاختبار؟ ستفقد تقدمك.")) {
                setLocation("/upload");
              }
            }}
            className="hover:scale-110 transition-transform"
            data-testid="button-exit"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-600 dark:text-gray-300">
              السؤال {currentQuestion + 1} من {totalQuestions}
            </span>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={sounds.toggle}
              className="hover:scale-110 transition-transform"
              title={sounds.enabled ? "إيقاف الأصوات" : "تشغيل الأصوات"}
              data-testid="button-sound-toggle"
            >
              {sounds.enabled ? (
                <Volume2 className="h-5 w-5 text-duo-green-600" />
              ) : (
                <VolumeX className="h-5 w-5 text-gray-400" />
              )}
            </Button>
          </div>
          
          <div className="w-9" />
        </div>
        <div className="max-w-md mx-auto mt-2">
          <Progress value={progress} className="h-2.5 rounded-full" />
        </div>
      </header>

      {/* Question */}
      <main className="flex-1 px-4 py-6 max-w-md md:max-w-xl lg:max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          key={currentQuestion}
        >
          <Card className="mb-6 relative overflow-visible bg-gradient-to-br from-white to-purple-50/30 dark:from-gray-800 dark:to-purple-900/10 border-2 border-purple-200/50 dark:border-purple-700/30 shadow-elevated backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 pointer-events-none rounded-lg" />
            
            <div className="absolute -top-3 -right-3 w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-glow z-10">
              {currentQuestion + 1}
            </div>
            
            <CardContent className="p-8 relative z-10">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/50 dark:to-pink-900/50 flex items-center justify-center flex-shrink-0">
                  <HelpCircle className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                
                <p 
                  className="text-xl md:text-2xl font-medium text-gray-800 dark:text-gray-100 leading-relaxed"
                  style={{ 
                    direction: getTextDirection(question.question),
                    textAlign: getTextDirection(question.question) === 'rtl' ? 'right' : 'left'
                  }}
                >
                  {formatQuestionText(question.question)}
                </p>
              </div>
              
              {question.diagram && (
                <div 
                  className="mt-4 flex justify-center"
                  dangerouslySetInnerHTML={{ __html: question.diagram }}
                />
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Question Type Rendering */}
        {question.type === "multiple_choice" || (!question.type && "options" in question) ? (
          /* Multiple Choice */
          <div className="space-y-3">
            {(question as any).options?.map((option: string, index: number) => {
              const optionLabelArabic = optionLabelsArabic[index];
              const optionLabelEnglish = optionLabelsEnglish[index];
              const isSelected = selectedAnswer === optionLabelArabic;
              const correctAnswer = (question as any).correct;
              const isCorrect = showFeedback && optionLabelEnglish === correctAnswer;
              const isWrong = showFeedback && isSelected && optionLabelEnglish !== correctAnswer;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card
                    className={`
                      cursor-pointer 
                      transition-all duration-300 
                      hover:scale-[1.02] 
                      hover:-translate-y-1
                      active:scale-[0.98]
                      ${isCorrect
                        ? "border-2 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 shadow-glow-green animate-celebrate"
                        : isWrong
                        ? "border-2 border-red-500 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 shadow-glow-red animate-shake"
                        : isSelected
                        ? "border-2 border-purple-500 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 shadow-glow ring-4 ring-purple-400/30"
                        : "border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 shadow-md hover:shadow-xl"
                      }
                    `}
                    onClick={() => handleSelectAnswer(optionLabelArabic)}
                    data-testid={`option-${optionLabelEnglish}`}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <motion.div
                        className={`
                          flex h-12 w-12 items-center justify-center rounded-xl font-bold text-lg
                          ${isCorrect
                            ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg"
                            : isWrong
                            ? "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg"
                            : isSelected
                            ? "bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-lg"
                            : "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-600 dark:text-gray-300"
                          }
                        `}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        {isCorrect ? (
                          <CheckCircle className="h-6 w-6" />
                        ) : isWrong ? (
                          <XCircle className="h-6 w-6" />
                        ) : (
                          optionLabelArabic
                        )}
                      </motion.div>
                      <p 
                        className="flex-1 text-gray-800 dark:text-gray-200 text-lg"
                        style={{ 
                          direction: getTextDirection(option),
                          textAlign: getTextDirection(option) === 'rtl' ? 'right' : 'left'
                        }}
                      >
                        {cleanOption(option)}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : question.type === "true_false" ? (
          /* True/False - Show English labels for English content */
          <div className="space-y-3">
            {(() => {
              const isEnglish = getTextDirection(question.question) === 'ltr';
              return [
                { value: "true", label: isEnglish ? "True" : "صح", icon: Check },
                { value: "false", label: isEnglish ? "False" : "خطأ", icon: X }
              ];
            })().map(({ value, label, icon: Icon }) => {
              const isSelected = selectedAnswer === value;
              const correctAnswer = (question as any).correct;
              const isCorrect = showFeedback && (value === "true") === correctAnswer;
              const isWrong = showFeedback && isSelected && (value === "true") !== correctAnswer;

              return (
                <motion.div
                  key={value}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: value === "true" ? 0 : 0.1 }}
                >
                  <Card
                    className={`
                      cursor-pointer 
                      transition-all duration-300 
                      hover:scale-[1.02] 
                      hover:-translate-y-1
                      active:scale-[0.98]
                      ${isCorrect
                        ? "border-2 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 shadow-glow-green animate-celebrate"
                        : isWrong
                        ? "border-2 border-red-500 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 shadow-glow-red animate-shake"
                        : isSelected
                        ? "border-2 border-purple-500 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 shadow-glow ring-4 ring-purple-400/30"
                        : "border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 shadow-md hover:shadow-xl"
                      }
                    `}
                    onClick={() => handleSelectAnswer(value)}
                    data-testid={`option-${value}`}
                  >
                    <CardContent className="p-6 flex items-center gap-4">
                      <motion.div
                        className={`
                          flex h-16 w-16 items-center justify-center rounded-xl
                          ${isCorrect
                            ? "bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg"
                            : isWrong
                            ? "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg"
                            : isSelected
                            ? "bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-lg"
                            : "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-600 dark:text-gray-300"
                          }
                        `}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        {isCorrect ? (
                          <CheckCircle className="h-8 w-8" />
                        ) : isWrong ? (
                          <XCircle className="h-8 w-8" />
                        ) : (
                          <Icon className="h-8 w-8" />
                        )}
                      </motion.div>
                      <p className="flex-1 text-2xl font-bold text-gray-800 dark:text-gray-200">
                        {label}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : question.type === "fill_blank" ? (
          /* Fill in the Blank */
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <Input
                  value={fillBlankAnswer}
                  onChange={(e) => {
                    setFillBlankAnswer(e.target.value);
                    setSelectedAnswer(e.target.value || null);
                  }}
                  placeholder="اكتب إجابتك هنا..."
                  className="text-lg text-center"
                  disabled={showFeedback}
                  data-testid="input-fill-blank"
                />
              </CardContent>
            </Card>
            
            {/* Hint for fill blank */}
            {(question as any).hint && !showFeedback && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                <HelpCircle className="h-4 w-4 inline ml-1" />
                {(question as any).hint}
              </p>
            )}
            
            {/* Show correct answer on feedback */}
            {showFeedback && (() => {
              const userAns = fillBlankAnswer.trim().toLowerCase();
              const correctAns = ((question as any).correct || "").toLowerCase();
              // Accept if user typed exact fragment OR the full word containing it
              const isCorrectFillBlank = userAns === correctAns || 
                userAns.includes(correctAns) || 
                correctAns.includes(userAns);
              return (
              <Card className={`${
                isCorrectFillBlank
                  ? "bg-green-50 dark:bg-green-900/30 border-green-200"
                  : "bg-red-50 dark:bg-red-900/30 border-red-200"
              }`}>
                <CardContent className="p-4 text-center">
                  <p className="text-gray-600 dark:text-gray-300">
                    الإجابة الصحيحة: <strong className="text-green-600 dark:text-green-400">{(question as any).correct}</strong>
                  </p>
                </CardContent>
              </Card>
              );
            })()}
          </div>
        ) : question.type === "matching" ? (
          /* Matching - Show left items and shuffled right options separately */
          <div className="space-y-4">
            {/* Clear instructions at the top */}
            <Card className="bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700">
              <CardContent className="p-3 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                  كيفية الحل: اضغط على إجابة من اليمين لتوصيلها بالعنصر التالي على اليسار
                </p>
              </CardContent>
            </Card>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center font-medium">
              وصّل كل عنصر بما يناسبه
            </p>
            
            {/* Two columns: Left items and shuffled Right options */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left column - items to match */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center font-medium mb-2">العناصر</p>
                {(question as any).pairs?.map((pair: { left: string; right: string }, idx: number) => {
                  const matchedWith = matchingSelections[pair.left];
                  const isCorrectMatch = matchedWith === pair.right;
                  
                  return (
                    <Card
                      key={`left-${idx}`}
                      className={`transition-all ${
                        matchedWith 
                          ? showFeedback
                            ? isCorrectMatch
                              ? "border-2 border-green-500 bg-green-50 dark:bg-green-900/30"
                              : "border-2 border-red-500 bg-red-50 dark:bg-red-900/30"
                            : "border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                          : "bg-gray-50 dark:bg-gray-800"
                      }`}
                      data-testid={`match-left-${idx}`}
                    >
                      <CardContent className="p-3 text-center">
                        <p className="text-gray-800 dark:text-gray-200 font-medium text-sm">{pair.left}</p>
                        {matchedWith && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            {matchedWith}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              
              {/* Right column - shuffled options */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center font-medium mb-2">الإجابات</p>
                {shuffledRightOptions.map((rightOption, idx) => {
                  const isUsed = Object.values(matchingSelections).includes(rightOption);
                  const pairs = (question as any).pairs || [];
                  const leftItem = pairs.find((p: any) => !matchingSelections[p.left])?.left;
                  
                  return (
                    <Card
                      key={`right-${idx}`}
                      className={`cursor-pointer transition-all ${
                        isUsed 
                          ? "opacity-50 pointer-events-none bg-gray-100 dark:bg-gray-700" 
                          : "hover-elevate bg-blue-50 dark:bg-blue-900/30"
                      }`}
                      onClick={() => {
                        if (!showFeedback && !isUsed && leftItem) {
                          const newSelections = { ...matchingSelections, [leftItem]: rightOption };
                          setMatchingSelections(newSelections);
                          // If all pairs are matched, set answer
                          if (Object.keys(newSelections).length === pairs.length) {
                            // Check if all matches are correct
                            const typedSelections = newSelections as Record<string, string>;
                            const allCorrect = pairs.every((p: { left: string; right: string }) => typedSelections[p.left] === p.right);
                            setSelectedAnswer(allCorrect ? "correct" : "wrong");
                          }
                        }
                      }}
                      data-testid={`match-right-${idx}`}
                    >
                      <CardContent className="p-3 text-center">
                        <p className="text-gray-800 dark:text-gray-200 font-medium text-sm">{rightOption}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
            
            {/* Reset button */}
            {Object.keys(matchingSelections).length > 0 && !showFeedback && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setMatchingSelections({});
                  setSelectedAnswer(null);
                }}
                data-testid="button-reset-matching"
              >
                إعادة التوصيل
              </Button>
            )}
            
            
            {showFeedback && (
              <Card className={selectedAnswer === "correct" 
                ? "bg-green-50 dark:bg-green-900/30 border-green-200" 
                : "bg-red-50 dark:bg-red-900/30 border-red-200"}>
                <CardContent className="p-4 text-center">
                  {selectedAnswer === "correct" ? (
                    <>
                      <CheckCircle className="h-6 w-6 text-green-500 mx-auto mb-2" />
                      <p className="text-green-700 dark:text-green-300">أحسنت! تم التوصيل بنجاح</p>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
                      <p className="text-red-700 dark:text-red-300">بعض التوصيلات غير صحيحة</p>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}

        {/* Feedback & Explanation */}
        {showFeedback && (() => {
          // Check if answer is correct based on question type
          let isAnswerCorrect = false;
          switch (question.type) {
            case "true_false":
              isAnswerCorrect = (selectedAnswer === "true") === (question as any).correct;
              break;
            case "fill_blank": {
              const userAns = fillBlankAnswer.trim().toLowerCase();
              const correctAns = ((question as any).correct || "").toLowerCase();
              // Accept full word or just the fragment
              isAnswerCorrect = userAns === correctAns || userAns.includes(correctAns) || correctAns.includes(userAns);
              break;
            }
            case "matching":
              isAnswerCorrect = selectedAnswer === "correct";
              break;
            case "multiple_choice":
            default: {
              // Map Arabic labels to English for comparison
              const arabicLabels = ["أ", "ب", "ج", "د"];
              const englishLabels = ["A", "B", "C", "D"];
              const englishAnswer = arabicLabels.includes(selectedAnswer || "") 
                ? englishLabels[arabicLabels.indexOf(selectedAnswer || "")]
                : selectedAnswer;
              isAnswerCorrect = englishAnswer === (question as any).correct;
              break;
            }
          }
          
          return (
            <>
              {/* Encouragement Message */}
              <Card className={`mt-4 ${isAnswerCorrect 
                ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700" 
                : "bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700"}`}>
                <CardContent className="p-4 text-center">
                  {isAnswerCorrect ? (
                    <>
                      <Sparkles className="h-8 w-8 text-green-500 mx-auto mb-2" />
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">
                        {["شاطر!", "أحسنت!", "رائع!", "ممتاز!"][Math.floor(Math.random() * 4)]}
                      </p>
                    </>
                  ) : (
                    <>
                      <Star className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                      <p className="text-lg font-bold text-orange-700 dark:text-orange-300">لا بأس، تعلمت شيئاً جديداً!</p>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Explanation */}
              {question.explanation && (
                <Card className="mt-3 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700">
                  <CardContent className="p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>التوضيح:</strong> {question.explanation}
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          );
        })()}
      </main>

      {/* Bottom Action */}
      <div className="sticky bottom-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-t p-4 shadow-lg">
        <div className="max-w-md md:max-w-xl lg:max-w-2xl mx-auto">
          {!showFeedback ? (
            <Button
              className="w-full h-14 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-glow transition-all hover:scale-[1.02]"
              onClick={() => {
                sounds.playClick();
                handleShowFeedback();
              }}
              disabled={!selectedAnswer}
              data-testid="button-check"
            >
              تحقق من الإجابة
            </Button>
          ) : (
            <Button
              className="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-glow transition-all hover:scale-[1.02]"
              onClick={() => {
                sounds.playClick();
                handleNext();
              }}
              disabled={submitMutation.isPending}
              data-testid="button-next"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-6 w-6 animate-spin" />
                  جاري الإرسال...
                </>
              ) : currentQuestion < totalQuestions - 1 ? (
                <>
                  السؤال التالي
                  <ChevronLeft className="mr-2 h-5 w-5" />
                </>
              ) : (
                "إنهاء الاختبار"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
