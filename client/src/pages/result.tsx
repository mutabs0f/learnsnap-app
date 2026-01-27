import { useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, XCircle, Camera, ShoppingCart, Share2, Home, Trophy, ThumbsUp, TrendingUp, BookOpen } from "lucide-react";
import type { Question } from "@shared/schema";
import { motion } from "framer-motion";
import { useConfetti } from "@/hooks/useConfetti";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { XPBadge, StreakCounter } from "@/components/gamification";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";

interface QuizResult {
  id: string;
  questions: Question[];
  answers: string[];
  score: number;
  totalQuestions: number;
}

export default function ResultPage() {
  const params = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const { celebrate } = useConfetti();
  const sounds = useSoundEffects();
  const { toast } = useToast();
  const shareCardRef = useRef<HTMLDivElement>(null);

  const { data: result, isLoading } = useQuery<QuizResult>({
    queryKey: ["/api/quiz", params.sessionId, "result"],
  });

  useEffect(() => {
    if (result && !isLoading) {
      const percentage = Math.round((result.score / result.totalQuestions) * 100);
      
      if (percentage === 100) {
        sounds.playSuccess();
        celebrate('perfect');
      } else if (percentage >= 70) {
        sounds.playSuccess();
        celebrate('success');
      }
    }
  }, [result, isLoading, celebrate, sounds]);

  if (isLoading) {
    return (
      <div 
        className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 dark:from-gray-900 dark:via-emerald-900 dark:to-gray-900 flex items-center justify-center"
        role="status"
        aria-live="polite"
        aria-label="جاري تحميل النتائج"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Loader2 className="h-12 w-12 animate-spin text-emerald-500" aria-hidden="true" />
          <span className="sr-only">جاري تحميل نتائج الاختبار</span>
        </motion.div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 dark:from-gray-900 dark:via-emerald-900 dark:to-gray-900 flex items-center justify-center px-4">
        <Card className="w-full max-w-md md:max-w-xl lg:max-w-2xl">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2 dark:text-white">لم نجد النتيجة</h2>
            <Button onClick={() => setLocation("/upload")} data-testid="button-retry">
              ابدأ اختبار جديد
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const percentage = Math.round((result.score / result.totalQuestions) * 100);
  const getFeedback = () => {
    if (percentage >= 90) return { icon: Trophy, text: "ممتاز!", color: "text-duo-green-600", bgColor: "bg-duo-green-100 dark:bg-duo-green-900/30" };
    if (percentage >= 70) return { icon: ThumbsUp, text: "جيد جداً!", color: "text-duo-blue-600", bgColor: "bg-duo-blue-100 dark:bg-duo-blue-900/30" };
    if (percentage >= 50) return { icon: TrendingUp, text: "جيد، واصل!", color: "text-duo-orange-600", bgColor: "bg-duo-orange-100 dark:bg-duo-orange-900/30" };
    return { icon: BookOpen, text: "تحتاج مراجعة", color: "text-duo-red", bgColor: "bg-red-100 dark:bg-red-900/30" };
  };

  const feedback = getFeedback();
  const FeedbackIcon = feedback.icon;

  // XP Calculation
  const baseXP = Math.round(percentage * 2.5); // Max 250 XP
  const perfectBonus = percentage === 100 ? 50 : 0;
  const streakBonus = 0; // TODO: Get from backend
  const xpEarned = baseXP + perfectBonus + streakBonus;

  // Mock streak for now (TODO: Get from backend)
  const streak = 7;

  // Share result as image
  const handleShareAsImage = async () => {
    if (!shareCardRef.current) return;
    
    try {
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      
      const imageUrl = canvas.toDataURL('image/png');
      
      if (navigator.share) {
        try {
          const blob = await (await fetch(imageUrl)).blob();
          const file = new File([blob], 'نتيجتي-learnsnap.png', { type: 'image/png' });
          
          await navigator.share({
            title: 'نتيجتي في LearnSnap',
            text: `حصلت على ${percentage}%!`,
            files: [file],
          });
          return;
        } catch {
          // fallback to download
        }
      }
      
      const link = document.createElement('a');
      link.download = 'نتيجتي-learnsnap.png';
      link.href = imageUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "تم حفظ الصورة",
        description: "يمكنك مشاركتها الآن من معرض الصور",
      });
    } catch {
      toast({
        title: "فشل إنشاء الصورة",
        description: "حاول مرة أخرى",
        variant: "destructive",
      });
    }
  };

  // Helper to display answer based on question type
  const getAnswerDisplay = (question: Question, answer: string, isUserAnswer: boolean) => {
    const qType = (question as any).type || "multiple_choice";
    const q = question as any;
    
    if (qType === "multiple_choice") {
      const optionLabels = ["A", "B", "C", "D"];
      const arabicLabels = ["أ", "ب", "ج", "د"];
      // Map Arabic to English if needed
      const englishAnswer = arabicLabels.includes(answer) 
        ? optionLabels[arabicLabels.indexOf(answer)] 
        : answer;
      const idx = optionLabels.indexOf(englishAnswer);
      const options = q.options;
      if (options && idx >= 0 && idx < options.length) {
        return options[idx];
      }
      return answer;
    }
    
    if (qType === "true_false") {
      return answer === "true" ? "صح" : "خطأ";
    }
    
    if (qType === "fill_blank") {
      return answer || "-";
    }
    
    if (qType === "matching") {
      return isUserAnswer ? "تم التوصيل" : "توصيل صحيح";
    }
    
    return answer;
  };

  // Check if answer is correct based on question type
  const checkIsCorrect = (question: Question, userAnswer: string) => {
    const qType = (question as any).type || "multiple_choice";
    const q = question as any;
    
    if (qType === "multiple_choice") {
      const optionLabels = ["A", "B", "C", "D"];
      const arabicLabels = ["أ", "ب", "ج", "د"];
      // Map Arabic to English
      const englishAnswer = arabicLabels.includes(userAnswer) 
        ? optionLabels[arabicLabels.indexOf(userAnswer)] 
        : userAnswer;
      return englishAnswer === q.correct;
    }
    
    if (qType === "true_false") {
      const correctBool = q.correct === true || q.correct === "true";
      const userBool = userAnswer === "true";
      return correctBool === userBool;
    }
    
    if (qType === "fill_blank") {
      const userAns = (userAnswer || "").toLowerCase().trim();
      const correctAns = ((q.correct as string) || "").toLowerCase().trim();
      // Accept full word or fragment
      return userAns === correctAns || userAns.includes(correctAns) || correctAns.includes(userAns);
    }
    
    if (qType === "matching") {
      return userAnswer === "correct";
    }
    
    return userAnswer === q.correct;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-duo-green-50 via-duo-blue-50 to-white dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="px-4 py-3">
        <div className="flex items-center justify-between gap-2 max-w-md mx-auto">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-home"
          >
            <Home className="h-5 w-5" />
          </Button>
          <h1 className="font-bold text-lg dark:text-white">النتيجة</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShareAsImage}
            data-testid="button-share"
            title="شارك نتيجتك"
          >
            <Share2 className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="px-4 py-6 max-w-md md:max-w-xl lg:max-w-2xl mx-auto">
        {/* Score Card */}
        <div ref={shareCardRef} className="bg-white dark:bg-gray-800 p-4 rounded-2xl">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', duration: 0.8, bounce: 0.4 }}
            className="mb-8"
          >
            <Card className="relative overflow-visible bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border-0 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-orange-500/10 rounded-lg" />
            
            <CardContent className="p-8 relative z-10">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center mb-6 ${feedback.bgColor} shadow-2xl`}
              >
                <FeedbackIcon className={`w-16 h-16 ${feedback.color}`} />
              </motion.div>
              
              <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-4xl font-bold text-center mb-2"
              >
                {feedback.text}
              </motion.h2>
              
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.7, type: 'spring' }}
                className="text-center"
              >
                <div className="text-7xl font-black bg-gradient-to-r from-duo-green-500 to-duo-blue-500 bg-clip-text text-transparent mb-2">
                  {percentage}%
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-lg">
                  {result.score} من {result.totalQuestions} إجابة صحيحة
                </p>
              </motion.div>
              
              {/* XP and Streak Display */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="flex flex-wrap items-center justify-center gap-4 mt-6"
              >
                <XPBadge xp={xpEarned} animate={true} />
                {streak > 0 && (
                  <StreakCounter days={streak} />
                )}
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
          <div className="text-center mt-3 text-sm text-gray-500">
            LearnSnap - تعلم بذكاء
          </div>
        </div>

        {/* Progress Bar */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex justify-between gap-2 mb-2 text-sm">
              <span className="text-gray-600 dark:text-gray-400">الإجابات الصحيحة</span>
              <span className="font-bold text-green-600">{result.score}</span>
            </div>
            <Progress value={percentage} className="h-3 mb-4" />
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-400">الإجابات الخاطئة</span>
              <span className="font-bold text-red-600">{result.totalQuestions - result.score}</span>
            </div>
          </CardContent>
        </Card>

        {/* Question Review */}
        <h2 className="text-lg font-bold mb-4 dark:text-white">مراجعة الإجابات</h2>
        <div className="space-y-4">
          {result.questions.map((question, index) => {
            const userAnswer = result.answers[index];
            const isCorrect = checkIsCorrect(question, userAnswer);
            const qType = question.type || "multiple_choice";

            return (
              <Card key={index} className={isCorrect ? "border-green-200" : "border-red-200"}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      isCorrect ? "bg-green-100 dark:bg-green-900/50" : "bg-red-100 dark:bg-red-900/50"
                    }`}>
                      {isCorrect ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    <p className="text-gray-800 dark:text-gray-200 font-medium">{question.question}</p>
                  </div>

                  <div className="mr-11 space-y-2 text-sm">
                    <p className="text-gray-600 dark:text-gray-400">
                      إجابتك:{" "}
                      <span className={isCorrect ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                        {getAnswerDisplay(question, userAnswer, true)}
                      </span>
                    </p>
                    {!isCorrect && (
                      <p className="text-gray-600 dark:text-gray-400">
                        الإجابة الصحيحة:{" "}
                        <span className="text-green-600 font-medium">
                          {qType === "true_false" 
                            ? ((question as any).correct === true || (question as any).correct === "true" ? "صح" : "خطأ")
                            : qType === "fill_blank"
                            ? (question as any).correct
                            : qType === "matching"
                            ? "توصيل صحيح"
                            : getAnswerDisplay(question, (question as any).correct as string, false)
                          }
                        </span>
                      </p>
                    )}
                    {question.explanation && (
                      <p className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 p-2 rounded mt-2">
                        {question.explanation}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Actions */}
        <motion.div 
          className="mt-8 space-y-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <Button
            variant="duoPrimary"
            size="lg"
            className="w-full"
            onClick={() => {
              sounds.playClick();
              setLocation("/upload");
            }}
            data-testid="button-new-quiz"
          >
            <Camera className="me-2 h-5 w-5" aria-hidden="true" />
            صور صفحة جديدة
          </Button>
          
          <Button
            variant="duoBlue"
            size="lg"
            className="w-full"
            onClick={() => {
              sounds.playClick();
              setLocation("/pricing");
            }}
            data-testid="button-buy-more"
          >
            <ShoppingCart className="me-2 h-5 w-5" aria-hidden="true" />
            اشتري صفحات إضافية
          </Button>
        </motion.div>
      </main>
    </div>
  );
}
