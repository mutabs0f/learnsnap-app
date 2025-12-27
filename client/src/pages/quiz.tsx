import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Loader2, CheckCircle, XCircle, ChevronLeft, BookOpen, Lightbulb, PlayCircle, Check, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Question, Lesson, LessonStep } from "@shared/schema";
import { Star, Sparkles, HelpCircle } from "lucide-react";

interface QuizSession {
  id: string;
  lesson: Lesson | null;
  questions: Question[];
  status: string;
}

type QuizPhase = "loading" | "lesson" | "quiz";

export default function QuizPage() {
  const params = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
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

  useEffect(() => {
    if (session?.status === "ready" && phase === "loading") {
      setPhase("lesson");
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
  };

  const startQuiz = () => {
    setPhase("quiz");
  };

  if (isLoading || phase === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">جاري تحميل الاختبار...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
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

  if (session.status === "processing") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">جاري تحليل الصورة</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">الذكاء الاصطناعي يعمل على توليد الشرح والأسئلة...</p>
            <Progress value={50} className="h-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">قد يستغرق هذا حتى ٦٠ ثانية</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (session.status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
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
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex flex-col">
        <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b px-4 py-3">
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
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              if (confirm("هل تريد الخروج من الاختبار؟ ستفقد تقدمك.")) {
                setLocation("/upload");
              }
            }}
            data-testid="button-exit"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <span className="font-medium text-gray-600 dark:text-gray-300">
            السؤال {currentQuestion + 1} من {totalQuestions}
          </span>
          <div className="w-9" />
        </div>
        <div className="max-w-md mx-auto mt-2">
          <Progress value={progress} className="h-2" />
        </div>
      </header>

      {/* Question */}
      <main className="flex-1 px-4 py-6 max-w-md md:max-w-xl lg:max-w-2xl mx-auto w-full">
        <Card className="mb-6">
          <CardContent className="p-6">
            <p className="text-lg font-medium text-gray-800 dark:text-gray-200 leading-relaxed">
              {question.question}
            </p>
            
            {/* Render diagram if exists */}
            {question.diagram && (
              <div 
                className="mt-4 flex justify-center"
                dangerouslySetInnerHTML={{ __html: question.diagram }}
              />
            )}
          </CardContent>
        </Card>

        {/* Question Type Rendering */}
        {question.type === "multiple_choice" || (!question.type && "options" in question) ? (
          /* Multiple Choice */
          <div className="space-y-3">
            {(question as any).options?.map((option: string, index: number) => {
              const optionLabelArabic = optionLabelsArabic[index];
              const optionLabelEnglish = optionLabelsEnglish[index];
              const isSelected = selectedAnswer === optionLabelArabic;
              const correctAnswer = (question as any).correct; // This is "A", "B", "C", or "D"
              const isCorrect = showFeedback && optionLabelEnglish === correctAnswer;
              const isWrong = showFeedback && isSelected && optionLabelEnglish !== correctAnswer;

              return (
                <Card
                  key={index}
                  className={`cursor-pointer transition-all ${
                    isCorrect
                      ? "border-2 border-green-500 bg-green-50 dark:bg-green-900/30"
                      : isWrong
                      ? "border-2 border-red-500 bg-red-50 dark:bg-red-900/30"
                      : isSelected
                      ? "border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                      : "hover-elevate"
                  }`}
                  onClick={() => handleSelectAnswer(optionLabelArabic)}
                  data-testid={`option-${optionLabelEnglish}`}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                        isCorrect
                          ? "bg-green-500 text-white"
                          : isWrong
                          ? "bg-red-500 text-white"
                          : isSelected
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : isWrong ? (
                        <XCircle className="h-5 w-5" />
                      ) : (
                        optionLabelArabic
                      )}
                    </div>
                    <p className="flex-1 text-gray-800 dark:text-gray-200">{cleanOption(option)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : question.type === "true_false" ? (
          /* True/False */
          <div className="space-y-3">
            {[
              { value: "true", label: "صح", icon: Check },
              { value: "false", label: "خطأ", icon: X }
            ].map(({ value, label, icon: Icon }) => {
              const isSelected = selectedAnswer === value;
              const correctAnswer = (question as any).correct;
              const isCorrect = showFeedback && (value === "true") === correctAnswer;
              const isWrong = showFeedback && isSelected && (value === "true") !== correctAnswer;

              return (
                <Card
                  key={value}
                  className={`cursor-pointer transition-all ${
                    isCorrect
                      ? "border-2 border-green-500 bg-green-50 dark:bg-green-900/30"
                      : isWrong
                      ? "border-2 border-red-500 bg-red-50 dark:bg-red-900/30"
                      : isSelected
                      ? "border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                      : "hover-elevate"
                  }`}
                  onClick={() => handleSelectAnswer(value)}
                  data-testid={`option-${value}`}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                        isCorrect
                          ? "bg-green-500 text-white"
                          : isWrong
                          ? "bg-red-500 text-white"
                          : isSelected
                          ? "bg-blue-500 text-white"
                          : value === "true" 
                            ? "bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-300"
                            : "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="flex-1 text-gray-800 dark:text-gray-200 text-lg font-medium">{label}</p>
                  </CardContent>
                </Card>
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
      <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t p-4">
        <div className="max-w-md md:max-w-xl lg:max-w-2xl mx-auto">
          {!showFeedback ? (
            <Button
              className="w-full h-12"
              onClick={handleShowFeedback}
              disabled={!selectedAnswer}
              data-testid="button-check"
            >
              تحقق من الإجابة
            </Button>
          ) : (
            <Button
              className="w-full h-12"
              onClick={handleNext}
              disabled={submitMutation.isPending}
              data-testid="button-next"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-5 w-5 animate-spin" />
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
