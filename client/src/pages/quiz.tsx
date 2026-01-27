import { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  CheckCircle, 
  XCircle, 
  ArrowRight, 
  ChevronLeft, 
  Flag, 
  Volume2, 
  VolumeX, 
  HelpCircle,
  Lightbulb,
  Sparkles,
  Loader2,
  X,
  AlertTriangle,
  Star,
  Check,
  ThumbsUp,
  ThumbsDown,
  Heart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { Question, LessonStep, LessonContent, QuizSession, MatchingPair } from "@/types/quiz";

// [P0.3 FIX] Sound utilities with WebAudio fallback - reuse single AudioContext
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  try {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioContext;
  } catch {
    return null;
  }
}

// [P0.3 FIX] Generate beep using WebAudio API - reuses shared context
function playBeep(frequency: number, duration: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Silently fail if WebAudio not supported
  }
}

const sounds = {
  enabled: true,
  audioLoaded: { correct: false, wrong: false, click: false },
  audio: {
    correct: null as HTMLAudioElement | null,
    wrong: null as HTMLAudioElement | null,
    click: null as HTMLAudioElement | null,
  },
  // [P0.3 FIX] Initialize audio with error handling
  init() {
    if (typeof Audio === 'undefined') return;
    
    // Try to load audio files, mark as loaded only on success
    const tryLoadAudio = (key: 'correct' | 'wrong' | 'click', src: string) => {
      const audio = new Audio(src);
      audio.addEventListener('canplaythrough', () => {
        this.audio[key] = audio;
        this.audioLoaded[key] = true;
      }, { once: true });
      audio.addEventListener('error', () => {
        // File doesn't exist - will use WebAudio fallback
        this.audioLoaded[key] = false;
      }, { once: true });
      audio.load();
    };
    
    tryLoadAudio('correct', '/sounds/correct.mp3');
    tryLoadAudio('wrong', '/sounds/wrong.mp3');
    tryLoadAudio('click', '/sounds/click.mp3');
  },
  // [P0.3 FIX] Play with WebAudio fallback
  playCorrect() { 
    if (!this.enabled) return;
    if (this.audioLoaded.correct && this.audio.correct) { 
      this.audio.correct.currentTime = 0; 
      this.audio.correct.play().catch(() => {}); 
    } else {
      playBeep(880, 0.15); // High beep for correct
    }
  },
  playWrong() { 
    if (!this.enabled) return;
    if (this.audioLoaded.wrong && this.audio.wrong) { 
      this.audio.wrong.currentTime = 0; 
      this.audio.wrong.play().catch(() => {}); 
    } else {
      playBeep(220, 0.2); // Low beep for wrong
    }
  },
  playClick() { 
    if (!this.enabled) return;
    if (this.audioLoaded.click && this.audio.click) { 
      this.audio.click.currentTime = 0; 
      this.audio.click.play().catch(() => {}); 
    } else {
      playBeep(440, 0.05); // Short beep for click
    }
  },
  toggle() { this.enabled = !this.enabled; }
};

// Initialize sounds on module load
sounds.init();

// [SECURITY FIX v2.9.32] Safe SVG validation - prevents XSS via diagram
function isSafeSvg(svgString: string): boolean {
  if (!svgString || typeof svgString !== 'string') return false;
  
  const trimmed = svgString.trim().toLowerCase();
  
  // Must start with <svg and end with </svg>
  if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) return false;
  
  // Block dangerous patterns
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,  // onclick, onload, onerror, etc.
    /<iframe/i,
    /<foreignobject/i,
    /<embed/i,
    /<object/i,
    /data:/i,  // data: URLs can be dangerous
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(svgString)) return false;
  }
  
  return true;
}

export default function Quiz() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/quiz/:sessionId");
  const { toast } = useToast();
  const [showLessonIntro, setShowLessonIntro] = useState(() => {
    return localStorage.getItem("learnsnap_skipIntro") !== "true";
  });
  const [skipIntroPref, setSkipIntroPref] = useState(() => {
    return localStorage.getItem("learnsnap_skipIntro") === "true";
  });
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [fillBlankAnswer, setFillBlankAnswer] = useState("");
  const [matchingSelections, setMatchingSelections] = useState<Record<string, string>>({});
  // [FIX v2.9.30] Track user answers for submission
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  
  // Reporting state (v2.9.5)
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  
  // [v3.8.5] Question feedback state
  const [feedbackSent, setFeedbackSent] = useState<Record<number, "up" | "down">>({});
  
  // [v3.9] Hearts/lives system - Duolingo style
  const [hearts, setHearts] = useState(5);

  // [FIX v2.9.21] Poll while processing to wait for quiz generation to complete
  const { data: session, isLoading } = useQuery<QuizSession>({
    queryKey: [`/api/quiz/${params?.sessionId}`],
    enabled: !!params?.sessionId,
    refetchInterval: (query) => {
      // Poll every 2 seconds while processing
      const status = query.state.data?.status;
      if (status === "processing" || status === "pending") {
        return 2000;
      }
      return false; // Stop polling when done
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (answersArray: string[]) => {
      return apiRequest("POST", `/api/quiz/${params?.sessionId}/submit`, { answers: answersArray });
    },
    onSuccess: () => {
      setLocation(`/result/${params?.sessionId}`);
    },
  });

  // [v3.8.5] Send question feedback
  const sendFeedback = async (questionIndex: number, feedback: "up" | "down") => {
    if (feedbackSent[questionIndex]) return;
    
    try {
      await fetch(`/api/quiz/${params?.sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          questionIndex,
          questionText: validQuestions[questionIndex]?.question,
          feedback,
        }),
      });
      
      setFeedbackSent(prev => ({ ...prev, [questionIndex]: feedback }));
      toast({
        title: feedback === "up" ? "شكراً!" : "شكراً لملاحظتك",
        description: feedback === "up" ? "سعداء أن السؤال أعجبك" : "سنعمل على تحسين الأسئلة",
        duration: 2000,
      });
    } catch {
      // Silent fail for feedback
    }
  };

  // [FIX v2.9.30] Filter out invalid questions at the start - helper function
  const isValidQuestion = (q: Question | undefined): boolean => {
    if (!q) return false;
    const type = q.type;
    const hasOptions = q.options && Array.isArray(q.options) && q.options.length > 0;
    const hasPairs = q.pairs && Array.isArray(q.pairs) && q.pairs.length > 0;
    const hasCorrect = q.correct !== undefined && q.correct !== null;
    
    if (type === "multiple_choice") return hasOptions;
    if (type === "true_false") return hasCorrect;
    if (type === "fill_blank") return hasCorrect;
    if (type === "matching") return hasPairs;
    // No type specified - check if it looks like a valid MCQ (backward compatibility)
    if (!type && hasOptions && hasCorrect) return true;
    return false;
  };

  // [FIX v2.9.30] Pre-filter valid questions only - user only sees valid questions
  const validQuestions = useMemo(() => {
    if (!session?.questions) return [];
    return session.questions.filter((q: Question) => isValidQuestion(q));
  }, [session?.questions]);

  const question = validQuestions[currentQuestion];
  const totalQuestions = validQuestions.length;
  const progress = totalQuestions > 0 ? ((currentQuestion) / totalQuestions) * 100 : 0;

  // Shuffled matching options memoized
  const shuffledRightOptions = useMemo(() => {
    if (question?.type !== 'matching' || !question.pairs) return [];
    return [...question.pairs.map((p: MatchingPair) => p.right)].sort(() => Math.random() - 0.5);
  }, [question]);

  const handleSelectAnswer = (answer: string) => {
    if (showFeedback) return;
    setSelectedAnswer(answer);
    sounds.playClick();
  };

  const handleShowFeedback = () => {
    setShowFeedback(true);
    const isCorrect = isCurrentAnswerCorrect;
    if (isCorrect) {
      sounds.playCorrect();
    } else {
      sounds.playWrong();
      // [v3.9] Reduce hearts on wrong answer - Duolingo style
      setHearts(prev => Math.max(0, prev - 1));
    }
  };

  const handleNext = () => {
    // [FIX v2.9.30] Determine current answer based on question type
    let currentAnswerValue = selectedAnswer || "";
    const q = question as any;
    if (q?.type === "fill_blank") {
      currentAnswerValue = fillBlankAnswer;
    } else if (q?.type === "matching") {
      // For matching, check if all pairs were matched correctly
      const allCorrect = q.pairs?.every((pair: any) => matchingSelections[pair.left] === pair.right);
      currentAnswerValue = allCorrect ? "correct" : "wrong";
    } else if (q?.type === "true_false") {
      currentAnswerValue = selectedAnswer || "";
    }
    
    // Track answer for this question
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestion] = currentAnswerValue;
    setUserAnswers(newAnswers);
    
    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion(prev => prev + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
      setFillBlankAnswer("");
      setMatchingSelections({});
    } else {
      // [FIX v2.9.30] Submit with answers array - backend needs answers for ALL original questions
      // Map valid question answers back to original question indices
      const originalAnswers: string[] = [];
      const originalQuestions = session?.questions || [];
      let validIdx = 0;
      for (let i = 0; i < originalQuestions.length; i++) {
        if (isValidQuestion(originalQuestions[i])) {
          originalAnswers[i] = newAnswers[validIdx] || "";
          validIdx++;
        } else {
          originalAnswers[i] = ""; // Empty for invalid questions
        }
      }
      submitMutation.mutate(originalAnswers);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportReason || !question) return;
    
    setIsReporting(true);
    try {
      await apiRequest("POST", `/api/quiz/${params?.sessionId}/report-question`, {
        questionIndex: currentQuestion,
        questionText: question.question,
        reason: reportReason,
        details: reportDetails || undefined,
        deviceId: localStorage.getItem('deviceId')
      });
      
      toast({
        title: "تم إرسال البلاغ",
        description: "شكراً لمساعدتنا في تحسين الأسئلة!",
      });
      
      setShowReportModal(false);
      setReportReason('');
      setReportDetails('');
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل إرسال البلاغ، حاول مرة أخرى",
        variant: "destructive"
      });
    } finally {
      setIsReporting(false);
    }
  };

  const getCorrectAnswerDisplay = () => {
    if (!question) return "";
    
    if (question.type === "multiple_choice" || (!question.type && "options" in question)) {
      const labels = ["أ", "ب", "ج", "د"];
      const englishLabels = ["A", "B", "C", "D"];
      const correctIdx = englishLabels.indexOf((question as any).correct);
      return labels[correctIdx] || (question as any).correct;
    }
    
    if (question.type === "true_false") {
      const isEnglish = getTextDirection(question.question) === 'ltr';
      return (question as any).correct ? (isEnglish ? "True" : "صح") : (isEnglish ? "False" : "خطأ");
    }
    
    return (question as any).correct;
  };

  const isCurrentAnswerCorrect = (() => {
    if (!question || !selectedAnswer) return false;
    
    switch (question.type) {
      case "true_false":
        return (selectedAnswer === "true") === (question as any).correct;
      case "fill_blank": {
        const userAns = fillBlankAnswer.trim().toLowerCase();
        const correctAns = ((question as any).correct || "").toLowerCase();
        return userAns === correctAns || userAns.includes(correctAns) || correctAns.includes(userAns);
      }
      case "matching":
        return selectedAnswer === "correct";
      case "multiple_choice":
      default: {
        const arabicLabels = ["أ", "ب", "ج", "د"];
        const englishLabels = ["A", "B", "C", "D"];
        const englishAnswer = arabicLabels.includes(selectedAnswer) 
          ? englishLabels[arabicLabels.indexOf(selectedAnswer)]
          : selectedAnswer;
        return englishAnswer === (question as any).correct;
      }
    }
  })();

  const getTextDirection = (text: string) => {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text) ? 'rtl' : 'ltr';
  };

  const formatQuestionText = (text: string) => {
    return text.replace(/\\n/g, '\n');
  };

  const cleanOption = (text: string) => {
    if (!text) return "";
    let cleaned = text.replace(/^[A-Dأ-د]\)\s*/, "");
    cleaned = cleaned.replace(/^[A-Dأ-د][\.\-\)]\s*/, "");
    cleaned = cleaned.replace(/^([أ-د]|[A-D])\s*[:.-]\s*/, "");
    return cleaned.trim();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-white dark:bg-gray-900" role="status" aria-live="polite" aria-label="جاري التحميل">
        <Loader2 className="h-12 w-12 animate-spin text-duo-blue mb-4" aria-hidden="true" />
        <p className="text-xl font-bold text-gray-600 dark:text-gray-300">جاري تحميل الاختبار...</p>
        <span className="sr-only">جاري تحميل الاختبار، يرجى الانتظار</span>
      </div>
    );
  }

  // [FIX v2.9.21] Show processing state while waiting for quiz generation
  if (session?.status === "processing" || session?.status === "pending") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-white dark:bg-gray-900" role="status" aria-live="polite" aria-label="جاري إنشاء الاختبار">
        <Loader2 className="h-12 w-12 animate-spin text-duo-blue mb-4" aria-hidden="true" />
        <p className="text-xl font-bold text-gray-600 dark:text-gray-300 mb-2">جاري إنشاء الاختبار...</p>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {session?.progress ? `${session.progress}%` : "يُرجى الانتظار بضع ثوانٍ"}
        </p>
        {session?.progressMessage && (
          <p className="text-sm text-muted-foreground mt-1">{session.progressMessage}</p>
        )}
        <span className="sr-only">جاري إنشاء الاختبار، التقدم {session?.progress || 0} بالمئة</span>
      </div>
    );
  }

  // [FIX v2.9.21] Show error state for failed quiz generation
  if (session?.status === "error" || session?.status === "timeout" || session?.status === "service_error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-white dark:bg-gray-900">
        <AlertTriangle className="h-12 w-12 text-duo-red mb-4" />
        <p className="text-xl font-bold text-gray-600 dark:text-gray-300 mb-2">حدث خطأ في إنشاء الاختبار</p>
        <p className="text-sm text-muted-foreground mb-4">يرجى المحاولة مرة أخرى</p>
        <Button onClick={() => setLocation("/upload")}>العودة للبداية</Button>
      </div>
    );
  }

  if (!question && !showLessonIntro) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <p className="text-xl font-bold mb-4">لم يتم العثور على الاختبار</p>
        <Button onClick={() => setLocation("/upload")}>العودة للبداية</Button>
      </div>
    );
  }

  const optionLabelsArabic = ["أ", "ب", "ج", "د"];
  const lesson = session?.lesson as LessonContent | undefined;

  // Lesson Intro Screen - Show before questions
  if (showLessonIntro && lesson) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-duo-green/5 via-white to-duo-blue/5 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 flex flex-col" dir="rtl">
        <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b px-4 py-4">
          <div className="flex items-center justify-between w-full max-w-5xl mx-auto px-4 lg:px-8 gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation("/upload")}
              className="text-duo-gray hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              data-testid="button-back"
              aria-label="العودة للصفحة السابقة"
            >
              <ArrowRight className="h-6 w-6" aria-hidden="true" />
            </Button>
            <h1 className="text-lg font-bold text-gray-800 dark:text-white">الدرس</h1>
            <div className="w-9" />
          </div>
        </header>

        <main className="flex-1 py-8 w-full max-w-5xl mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Lesson Title */}
            <div className="space-y-3">
              <div className="flex items-center gap-4" style={{ direction: getTextDirection(lesson.title || "") }}>
                <div className="w-14 h-14 rounded-full bg-duo-green/10 flex items-center justify-center flex-shrink-0">
                  <Star className="h-7 w-7 text-duo-green" />
                </div>
                <h2 className="text-2xl font-black text-gray-800 dark:text-white">
                  {lesson.title || "درس جديد"}
                </h2>
              </div>
              {lesson.summary && (
                <p 
                  className="text-gray-600 dark:text-gray-300 text-lg leading-relaxed"
                  style={{ direction: getTextDirection(lesson.summary), textAlign: getTextDirection(lesson.summary) === 'rtl' ? 'right' : 'left' }}
                >
                  {lesson.summary}
                </p>
              )}
            </div>

            {/* Key Points */}
            {lesson.keyPoints && lesson.keyPoints.length > 0 && (
              <Card className="border-2 border-duo-blue/20 bg-duo-blue/5">
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold text-duo-blue mb-4 flex items-center gap-2" dir="rtl">
                    <Lightbulb className="h-5 w-5" />
                    النقاط الرئيسية
                  </h3>
                  <ul className="space-y-3">
                    {lesson.keyPoints.map((point: string, idx: number) => (
                      <li 
                        key={idx} 
                        className="flex items-start gap-3"
                        style={{ direction: getTextDirection(point), textAlign: getTextDirection(point) === 'rtl' ? 'right' : 'left' }}
                      >
                        <div className="w-6 h-6 rounded-full bg-duo-green/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="h-4 w-4 text-duo-green" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Steps/Explanation */}
            {lesson.steps && lesson.steps.length > 0 && (
              <div className="space-y-4">
                {lesson.steps.map((step: LessonStep, idx: number) => (
                  <Card key={idx} className="border-2 border-gray-100 dark:border-gray-800">
                    <CardContent className="p-5" style={{ direction: getTextDirection(step.content || ""), textAlign: getTextDirection(step.content || "") === 'rtl' ? 'right' : 'left' }}>
                      {step.type === "explanation" ? (
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">
                          {step.content}
                        </p>
                      ) : step.type === "example" ? (
                        <div className="bg-duo-yellow/10 rounded-xl p-4">
                          <p className="text-sm text-duo-yellow font-bold mb-2" dir="rtl">مثال:</p>
                          <p className="text-gray-700 dark:text-gray-300">{step.content}</p>
                        </div>
                      ) : (
                        <p className="text-gray-700 dark:text-gray-300">{step.content}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Quiz Info */}
            <Card className="border-2 border-duo-green/20 bg-duo-green/5">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-right">
                    <p className="text-gray-600 dark:text-gray-300 mb-1">
                      هذا الاختبار يحتوي على
                    </p>
                    <p className="text-sm text-gray-500">
                      أجب على جميع الأسئلة لإكمال الدرس
                    </p>
                  </div>
                  <div className="text-center flex-shrink-0">
                    <p className="text-4xl font-black text-duo-green">
                      {totalQuestions}
                    </p>
                    <p className="text-sm font-bold text-duo-green">سؤال</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </main>

        {/* Start Button */}
        <footer className="sticky bottom-0 bg-white dark:bg-gray-900 border-t-2 border-duo-gray-light dark:border-gray-800 p-4 pb-8">
          <div className="w-full max-w-5xl mx-auto px-4 lg:px-8">
            {/* Skip Intro Preference */}
            <div className="flex items-center gap-2 mb-4 justify-center">
              <input
                type="checkbox"
                id="skip-intro-checkbox"
                checked={skipIntroPref}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSkipIntroPref(checked);
                  localStorage.setItem("learnsnap_skipIntro", checked ? "true" : "false");
                }}
                className="w-4 h-4 rounded border-gray-300"
              />
              <label 
                htmlFor="skip-intro-checkbox" 
                className="text-sm text-muted-foreground cursor-pointer"
              >
                تخطي الشرح في المرات القادمة
              </label>
            </div>
            <Button
              className="w-full h-14 rounded-xl text-xl font-black bg-duo-green text-white"
              onClick={() => setShowLessonIntro(false)}
              data-testid="button-start-quiz"
            >
              ابدأ الاختبار
            </Button>
          </div>
        </footer>
      </div>
    );
  }

  // If no lesson data but intro still showing, skip to questions
  if (showLessonIntro && !lesson) {
    setShowLessonIntro(false);
    return null;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      {/* Report Question Modal (v2.9.5) */}
      <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>الإبلاغ عن مشكلة في السؤال</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">سبب البلاغ</Label>
              <RadioGroup value={reportReason} onValueChange={setReportReason}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="unclear" id="unclear" />
                  <Label htmlFor="unclear">السؤال غير واضح</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="wrong_answer" id="wrong_answer" />
                  <Label htmlFor="wrong_answer">الإجابة الصحيحة خاطئة</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="duplicate" id="duplicate" />
                  <Label htmlFor="duplicate">السؤال مكرر</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="inappropriate" id="inappropriate" />
                  <Label htmlFor="inappropriate">محتوى غير مناسب</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="other" id="other" />
                  <Label htmlFor="other">أخرى</Label>
                </div>
              </RadioGroup>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">تفاصيل إضافية (اختياري)</Label>
              <Textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="اشرح المشكلة بالتفصيل..."
                className="min-h-[80px]"
                data-testid="input-report-details"
              />
            </div>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowReportModal(false)} data-testid="button-cancel-report">
              إلغاء
            </Button>
            <Button 
              onClick={handleSubmitReport}
              disabled={!reportReason || isReporting}
              variant="destructive"
              data-testid="button-submit-report"
            >
              {isReporting ? 'جاري الإرسال...' : 'إرسال البلاغ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b px-4 py-4">
        <div className="flex items-center justify-between w-full max-w-5xl mx-auto px-4 lg:px-8 gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              sounds.playClick();
              if (confirm("هل تريد الخروج من الاختبار؟ ستفقد تقدمك.")) {
                setLocation("/upload");
              }
            }}
            className="text-duo-gray hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            data-testid="button-exit"
            aria-label="الخروج من الاختبار"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </Button>
          
          <div className="flex-1">
            <div 
              className="w-full h-4 bg-duo-gray-light dark:bg-gray-800 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`التقدم في الاختبار: ${Math.round(progress)}%`}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-duo-green to-duo-green-light rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
          
          {/* Hearts/Lives Indicator - Duolingo Style */}
          <div className="flex items-center gap-1" data-testid="hearts-display">
            <Heart className="h-6 w-6 text-duo-red fill-duo-red" aria-hidden="true" />
            <span className="font-bold text-duo-red text-lg">{hearts}</span>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={sounds.toggle}
            className="text-duo-gray rounded-full"
            data-testid="button-sound-toggle"
            aria-label={sounds.enabled ? "إيقاف الصوت" : "تشغيل الصوت"}
            aria-pressed={sounds.enabled}
          >
            {sounds.enabled ? (
              <Volume2 className="h-6 w-6 text-duo-blue" aria-hidden="true" />
            ) : (
              <VolumeX className="h-6 w-6 text-gray-400" aria-hidden="true" />
            )}
          </Button>
        </div>
      </header>

      {/* Question Area */}
      <main className="flex-1 px-4 py-8 w-full max-w-5xl mx-auto px-4 lg:px-8 w-full overflow-y-auto pb-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          key={currentQuestion}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-gray-800 dark:text-white">
              اختر الإجابة الصحيحة
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="text-duo-gray"
              onClick={() => setShowReportModal(true)}
              aria-label="الإبلاغ عن مشكلة في السؤال"
            >
              <Flag className="h-5 w-5" aria-hidden="true" />
            </Button>
            
            {/* [v3.8.5] Question Feedback Buttons */}
            <div className="flex gap-1" dir="ltr">
              <Button
                variant="ghost"
                size="icon"
                className={`${feedbackSent[currentQuestion] === "up" ? "text-duo-green" : "text-duo-gray"}`}
                onClick={() => sendFeedback(currentQuestion, "up")}
                disabled={!!feedbackSent[currentQuestion]}
                aria-label="سؤال جيد"
                data-testid="button-thumbs-up"
              >
                <ThumbsUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`${feedbackSent[currentQuestion] === "down" ? "text-duo-red" : "text-duo-gray"}`}
                onClick={() => sendFeedback(currentQuestion, "down")}
                disabled={!!feedbackSent[currentQuestion]}
                aria-label="سؤال سيء"
                data-testid="button-thumbs-down"
              >
                <ThumbsDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Duolingo-style Question Bubble */}
          <div className="relative mb-8">
            <div className="bg-gradient-to-br from-duo-blue-50 to-duo-blue-100 dark:from-duo-blue-900/30 dark:to-duo-blue-800/20 rounded-2xl border-2 border-duo-blue-200 dark:border-duo-blue-700 shadow-lg p-6 md:p-8">
              <div className="absolute -top-3 right-8 w-6 h-6 bg-duo-blue-100 dark:bg-duo-blue-900/30 border-2 border-duo-blue-200 dark:border-duo-blue-700 transform rotate-45 border-b-0 border-r-0"></div>
              <p 
                className="text-xl md:text-2xl font-bold text-gray-800 dark:text-gray-100 leading-relaxed text-center"
                style={{ direction: getTextDirection(question.question) }}
              >
                {formatQuestionText(question.question)}
              </p>
              
              {/* [SECURITY FIX v2.9.32] Safe SVG rendering - no dangerouslySetInnerHTML */}
              {question.diagram && isSafeSvg(question.diagram) && (
                <div className="mt-6 flex justify-center">
                  <img 
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(question.diagram)}`}
                    alt="رسم توضيحي"
                    className="max-w-full max-h-64"
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* [FIX v2.9.30] All questions here are pre-filtered to be valid */}
        {question.type === "multiple_choice" || (!question.type && "options" in question) ? (
          <div className="space-y-3">
            {(question as any).options?.map((option: string, index: number) => {
              const label = optionLabelsArabic[index];
              const isSelected = selectedAnswer === label;
              const isCorrect = showFeedback && label === getCorrectAnswerDisplay();
              const isWrong = showFeedback && isSelected && label !== getCorrectAnswerDisplay();

              return (
                <motion.button
                  key={index}
                  whileHover={!showFeedback ? { scale: 1.02 } : {}}
                  whileTap={!showFeedback ? { scale: 0.98 } : {}}
                  onClick={() => !showFeedback && handleSelectAnswer(label)}
                  disabled={showFeedback}
                  className={`
                    w-full p-4 rounded-xl border-2 transition-all duration-200
                    flex items-center gap-4 text-right
                    ${isCorrect 
                      ? 'bg-duo-green/10 border-duo-green text-duo-green-dark' 
                      : isWrong 
                      ? 'bg-duo-red/10 border-duo-red text-duo-red' 
                      : isSelected 
                      ? 'bg-duo-blue/10 border-duo-blue text-duo-blue shadow-[0_4px_0_0_#1CB0F6]' 
                      : 'bg-white dark:bg-gray-800 border-duo-gray-light dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }
                    ${!showFeedback && isSelected ? '-translate-y-1' : ''}
                  `}
                >
                  <div className={`
                    flex items-center justify-center w-10 h-10 rounded-full font-bold text-lg flex-shrink-0
                    ${isCorrect ? 'bg-duo-green text-white' : isWrong ? 'bg-duo-red text-white' : isSelected ? 'bg-duo-blue text-white' : 'bg-duo-gray-light dark:bg-gray-700 text-duo-gray-dark dark:text-gray-300'}
                  `}>
                    {isCorrect ? <CheckCircle className="h-5 w-5" /> : isWrong ? <XCircle className="h-5 w-5" /> : label}
                  </div>
                  <span className="flex-1 text-lg font-bold text-gray-700 dark:text-gray-200">
                    {cleanOption(option)}
                  </span>
                </motion.button>
              );
            })}
          </div>
        ) : question.type === "true_false" ? (
          <div className="space-y-3">
            {[
              { value: "true", label: "صح" },
              { value: "false", label: "خطأ" }
            ].map(({ value, label }) => {
              const isSelected = selectedAnswer === value;
              const isCorrect = showFeedback && (value === "true") === (question as any).correct;
              const isWrong = showFeedback && isSelected && (value === "true") !== (question as any).correct;

              return (
                <motion.button
                  key={value}
                  whileHover={!showFeedback ? { scale: 1.02 } : {}}
                  whileTap={!showFeedback ? { scale: 0.98 } : {}}
                  onClick={() => !showFeedback && handleSelectAnswer(value)}
                  disabled={showFeedback}
                  className={`
                    w-full p-6 rounded-xl border-2 transition-all duration-200
                    flex items-center gap-4 text-right shadow-sm
                    ${isCorrect 
                      ? 'bg-duo-green/10 border-duo-green text-duo-green-dark' 
                      : isWrong 
                      ? 'bg-duo-red/10 border-duo-red text-duo-red' 
                      : isSelected 
                      ? 'bg-duo-blue/10 border-duo-blue text-duo-blue shadow-[0_4px_0_0_#1CB0F6]' 
                      : 'bg-white dark:bg-gray-800 border-duo-gray-light dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }
                    ${!showFeedback && isSelected ? '-translate-y-1' : ''}
                  `}
                >
                  <div className={`
                    flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl flex-shrink-0
                    ${isCorrect ? 'bg-duo-green text-white' : isWrong ? 'bg-duo-red text-white' : isSelected ? 'bg-duo-blue text-white' : 'bg-duo-gray-light dark:bg-gray-700 text-duo-gray-dark dark:text-gray-300'}
                  `}>
                    {isCorrect ? <CheckCircle className="h-6 w-6" /> : isWrong ? <XCircle className="h-6 w-6" /> : label[0]}
                  </div>
                  <span className="flex-1 text-xl font-bold text-gray-700 dark:text-gray-200">
                    {label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        ) : question.type === "fill_blank" ? (
          <div className="space-y-4">
            <Card className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-duo-gray-light dark:border-gray-700 shadow-sm">
              <CardContent className="p-6">
                <Input
                  value={fillBlankAnswer}
                  onChange={(e) => {
                    setFillBlankAnswer(e.target.value);
                    setSelectedAnswer(e.target.value || null);
                  }}
                  placeholder="اكتب إجابتك هنا..."
                  className="text-xl text-center h-14 border-0 focus-visible:ring-0 font-bold"
                  disabled={showFeedback}
                  data-testid="input-fill-blank"
                />
              </CardContent>
            </Card>
            
            {showFeedback && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <p className="text-center text-lg font-bold text-duo-green">
                  الإجابة الصحيحة هي: {(question as any).correct}
                </p>
              </motion.div>
            )}
          </div>
        ) : question.type === "matching" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                {(question as any).pairs?.map((pair: any, idx: number) => {
                  const matchedWith = matchingSelections[pair.left];
                  return (
                    <div 
                      key={idx}
                      className={`p-4 rounded-xl border-2 text-center font-bold shadow-sm transition-all
                        ${matchedWith ? 'border-duo-blue bg-duo-blue/5 text-duo-blue' : 'border-duo-gray-light bg-white dark:bg-gray-800'}
                      `}
                    >
                      {pair.left}
                      {matchedWith && <div className="text-xs mt-1 opacity-70">{matchedWith}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-3">
                {shuffledRightOptions.map((opt, idx) => {
                  const isUsed = Object.values(matchingSelections).includes(opt);
                  return (
                    <motion.button
                      key={idx}
                      whileTap={{ scale: 0.95 }}
                      disabled={isUsed || showFeedback}
                      onClick={() => {
                        const pairs = (question as any).pairs || [];
                        const leftItem = pairs.find((p: any) => !matchingSelections[p.left])?.left;
                        if (leftItem) {
                          const newSelections = { ...matchingSelections, [leftItem]: opt };
                          setMatchingSelections(newSelections);
                          if (Object.keys(newSelections).length === pairs.length) {
                            const allCorrect = pairs.every((p: any) => newSelections[p.left] === p.right);
                            setSelectedAnswer(allCorrect ? "correct" : "wrong");
                          }
                        }
                      }}
                      className={`w-full p-4 rounded-xl border-2 font-bold shadow-sm transition-all
                        ${isUsed ? 'opacity-30 bg-duo-gray-light cursor-not-allowed' : 'border-duo-blue bg-white dark:bg-gray-800 hover:bg-duo-blue/5'}
                      `}
                    >
                      {opt}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {showFeedback && question.explanation && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 p-6 bg-duo-yellow/10 rounded-2xl border-2 border-duo-yellow/30">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-duo-yellow/20 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="h-6 w-6 text-duo-yellow" />
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                <strong>تلميح:</strong> {question.explanation}
              </p>
            </div>
          </motion.div>
        )}
      </main>

      {/* Footer Controls - Only show when NOT showing feedback */}
      {!showFeedback && (
        <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t-2 border-duo-gray-light dark:border-gray-800 p-4 pb-8 z-40">
          <div className="w-full max-w-5xl mx-auto px-4 lg:px-8">
            <Button
              className="w-full h-14 rounded-xl text-xl font-black"
              onClick={handleShowFeedback}
              disabled={!selectedAnswer}
              data-testid="button-check"
            >
              تحقق من الإجابة
            </Button>
          </div>
        </footer>
      )}

      {/* Feedback Banner with Next Button */}
      <AnimatePresence>
        {showFeedback && (
          <motion.div
            initial={{ y: 200 }}
            animate={{ y: 0 }}
            exit={{ y: 200 }}
            className={`
              fixed bottom-0 left-0 right-0 z-50 p-6 pb-8
              ${isCurrentAnswerCorrect ? 'bg-duo-green' : 'bg-duo-red'}
            `}
          >
            <div className="w-full max-w-5xl mx-auto px-4 lg:px-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center shadow-inner flex-shrink-0">
                  {isCurrentAnswerCorrect ? (
                    <Sparkles className="h-8 w-8 text-white animate-correct-bounce" />
                  ) : (
                    <AlertTriangle className="h-8 w-8 text-white animate-shake" />
                  )}
                </div>
                <div className="flex-1 text-white">
                  <h3 className="text-xl font-black mb-1">
                    {isCurrentAnswerCorrect ? 'أحسنت!' : 'خطأ بسيط...'}
                  </h3>
                  {!isCurrentAnswerCorrect && (
                    <p className="text-white/90 text-base font-bold">
                      الإجابة الصحيحة هي: {getCorrectAnswerDisplay()}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                className="w-full h-14 rounded-xl text-xl font-black"
                onClick={handleNext}
                data-testid="button-next"
              >
                {currentQuestion < totalQuestions - 1 ? "استمر" : "عرض النتائج"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
