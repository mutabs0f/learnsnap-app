import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, ArrowLeft, ClipboardCheck, Send, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useChildAuth } from "@/hooks/useChildAuth";
import type { Chapter } from "@shared/schema";

export default function TestStage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);

  // Check for existing child session (JWT cookie)
  const { isAuthenticated } = useChildAuth();

  const { data: chapter } = useQuery<Chapter>({
    queryKey: ["/api/chapters", id],
    enabled: !!id && isAuthenticated,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const practiceAnswers = JSON.parse(localStorage.getItem(`practice_answers_${id}`) || "[]");
      const res = await apiRequest("POST", `/api/chapters/${id}/submit`, {
        practiceAnswers,
        testAnswers: answers,
      });
      return res.json();
    },
    onSuccess: () => {
      localStorage.removeItem(`practice_answers_${id}`);
      setLocation(`/child/chapter/${id}/results`);
    },
  });

  const questions = chapter?.content?.test || [];
  const question = questions[currentQuestion];
  const progress = questions.length > 0 ? ((currentQuestion + 1) / questions.length) * 100 : 0;

  const handleAnswer = (answer: string) => {
    setSelectedAnswer(answer);
  };

  const handleNext = () => {
    if (!selectedAnswer) return;

    const newAnswers = [...answers, selectedAnswer];
    setAnswers(newAnswers);
    setSelectedAnswer(null);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      submitMutation.mutate();
    }
  };

  if (!chapter || !question) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center" dir="rtl">
        <p className="font-arabic text-gray-500">جاري التحميل...</p>
      </div>
    );
  }

  const answerLabels = ["أ", "ب", "ج", "د"];
  const answerKeys = ["A", "B", "C", "D"];
  const isLastQuestion = currentQuestion === questions.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex flex-col" dir="rtl">
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center h-16 gap-4">
            <Link href={`/child/chapter/${id}/practice`}>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ArrowRight className="w-6 h-6" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="font-child font-bold text-lg">الاختبار</h1>
              <p className="text-xs text-muted-foreground font-arabic">
                السؤال {currentQuestion + 1} من {questions.length}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-purple-100 px-3 py-1.5 rounded-full">
              <ClipboardCheck className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-child font-bold text-purple-700">اختبار</span>
            </div>
          </div>
          <Progress value={progress} className="h-2 mb-2" />
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-8">
        <Card className="mb-6 shadow-lg border-0 bg-white/90 backdrop-blur-sm">
          <CardContent className="p-8">
            <p 
              className="text-2xl font-arabic leading-relaxed text-gray-800 text-center"
              data-testid="text-question"
            >
              {question.question}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-3 flex-1">
          {question.options.map((option, index) => (
            <Button
              key={index}
              variant="outline"
              className={`w-full h-16 text-lg font-arabic justify-start px-6 rounded-xl transition-all ${
                selectedAnswer === answerKeys[index]
                  ? "border-2 border-purple-500 bg-purple-50"
                  : "hover:bg-gray-50"
              }`}
              onClick={() => handleAnswer(answerKeys[index])}
              data-testid={`button-answer-${index}`}
            >
              <span className={`w-10 h-10 rounded-lg ml-4 flex items-center justify-center font-child font-bold ${
                selectedAnswer === answerKeys[index]
                  ? "bg-purple-500 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}>
                {answerLabels[index]}
              </span>
              {option}
            </Button>
          ))}
        </div>

        <Button
          size="lg"
          onClick={handleNext}
          disabled={!selectedAnswer || submitMutation.isPending}
          className={`h-16 mt-6 font-child font-bold text-xl rounded-xl ${
            isLastQuestion 
              ? "bg-gradient-to-r from-child-coral to-child-purple"
              : "bg-gradient-to-r from-purple-500 to-purple-600"
          }`}
          data-testid="button-next"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="w-6 h-6 ml-2 animate-spin" />
              جاري الإرسال...
            </>
          ) : isLastQuestion ? (
            <>
              <Send className="w-6 h-6 ml-2" />
              إنهاء الاختبار
            </>
          ) : (
            <>
              التالي
              <ArrowLeft className="w-6 h-6 mr-2" />
            </>
          )}
        </Button>
      </main>
    </div>
  );
}
