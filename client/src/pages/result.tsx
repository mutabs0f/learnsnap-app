import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, XCircle, Camera, ShoppingCart, Share2, Home, Trophy, ThumbsUp, TrendingUp, BookOpen } from "lucide-react";
import type { Question } from "@shared/schema";

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

  const { data: result, isLoading } = useQuery<QuizResult>({
    queryKey: ["/api/quiz", params.sessionId, "result"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-green-500" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
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
    if (percentage >= 90) return { icon: Trophy, text: "ممتاز!", color: "text-green-600", bgColor: "bg-green-100" };
    if (percentage >= 70) return { icon: ThumbsUp, text: "جيد جداً!", color: "text-blue-600", bgColor: "bg-blue-100" };
    if (percentage >= 50) return { icon: TrendingUp, text: "جيد، واصل!", color: "text-yellow-600", bgColor: "bg-yellow-100" };
    return { icon: BookOpen, text: "تحتاج مراجعة", color: "text-orange-600", bgColor: "bg-orange-100" };
  };

  const feedback = getFeedback();
  const FeedbackIcon = feedback.icon;

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
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-gray-900 dark:to-gray-800">
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
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: "نتيجتي في LearnSnap",
                  text: `حصلت على ${result.score}/${result.totalQuestions} (${percentage}%)!`
                });
              }
            }}
            data-testid="button-share"
          >
            <Share2 className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="px-4 py-6 max-w-md md:max-w-xl lg:max-w-2xl mx-auto">
        {/* Score Card */}
        <Card className="mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-8 text-center text-white">
            <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${feedback.bgColor}`}>
              <FeedbackIcon className={`h-10 w-10 ${feedback.color}`} />
            </div>
            <p className="text-5xl font-bold mb-2">
              {result.score}/{result.totalQuestions}
            </p>
            <p className="text-2xl opacity-90">{percentage}%</p>
          </div>
          <CardContent className="p-4 text-center">
            <p className={`text-xl font-bold ${feedback.color}`}>
              {feedback.text}
            </p>
          </CardContent>
        </Card>

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
        <div className="mt-8 space-y-3">
          <Button
            className="w-full h-12"
            onClick={() => setLocation("/upload")}
            data-testid="button-new-quiz"
          >
            <Camera className="ml-2 h-5 w-5" />
            صور صفحة جديدة
          </Button>
          
          <Button
            variant="outline"
            className="w-full h-12"
            onClick={() => setLocation("/pricing")}
            data-testid="button-buy-more"
          >
            <ShoppingCart className="ml-2 h-5 w-5" />
            اشتري صفحات إضافية
          </Button>
        </div>
      </main>
    </div>
  );
}
