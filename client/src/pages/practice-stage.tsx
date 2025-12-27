import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, CheckCircle, XCircle, Sparkles, ArrowLeft, AlertCircle } from "lucide-react";
import { useChildAuth } from "@/hooks/useChildAuth";
import type { Chapter, Question } from "@shared/schema";

function ConfettiPiece({ delay }: { delay: number }) {
  const colors = ["bg-child-coral", "bg-child-turquoise", "bg-child-yellow", "bg-child-green", "bg-child-purple"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const left = Math.random() * 100;
  
  return (
    <div 
      className={`absolute w-3 h-3 rounded-sm ${color} animate-confetti-fall`}
      style={{ 
        left: `${left}%`, 
        animationDelay: `${delay}ms`,
        top: "-20px"
      }}
    />
  );
}

function FeedbackOverlay({ isCorrect, onContinue }: { isCorrect: boolean; onContinue: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onContinue, 2000);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      {isCorrect && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <ConfettiPiece key={i} delay={i * 50} />
          ))}
        </div>
      )}
      <div className={`text-center animate-scale-in ${isCorrect ? "text-white" : "text-white"}`}>
        <div className={`w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-6 ${
          isCorrect ? "bg-child-green" : "bg-child-coral"
        } shadow-2xl`}>
          {isCorrect ? (
            <CheckCircle className="w-20 h-20" />
          ) : (
            <XCircle className="w-20 h-20" />
          )}
        </div>
        <h2 className="text-4xl font-child font-bold mb-2">
          {isCorrect ? "ممتاز!" : "حاول مرة أخرى!"}
        </h2>
        <p className="text-xl font-arabic opacity-90">
          {isCorrect ? "أحسنت، أجابتك صحيحة" : "لا بأس، الخطأ جزء من التعلم"}
        </p>
      </div>
    </div>
  );
}

export default function PracticeStage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);

  // Check for existing child session (JWT cookie)
  const { isAuthenticated } = useChildAuth();

  const { data: chapter } = useQuery<Chapter>({
    queryKey: ["/api/chapters", id],
    enabled: !!id && isAuthenticated,
  });

  const questions = chapter?.content?.practice || [];
  const question = questions[currentQuestion];
  const progress = questions.length > 0 ? ((currentQuestion + 1) / questions.length) * 100 : 0;

  const handleAnswer = (answer: string) => {
    setSelectedAnswer(answer);
  };

  const handleCheck = () => {
    if (!selectedAnswer || !question) return;

    const correct = selectedAnswer === question.correct;
    setIsCorrect(correct);
    setAnswers(prev => [...prev, selectedAnswer]);
    setShowFeedback(true);
  };

  const handleContinue = () => {
    setShowFeedback(false);
    setSelectedAnswer(null);
    
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      localStorage.setItem(`practice_answers_${id}`, JSON.stringify(answers));
      setLocation(`/child/chapter/${id}/test`);
    }
  };

  if (!chapter || !question) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-teal-50 flex items-center justify-center" dir="rtl">
        <p className="font-arabic text-gray-500">جاري التحميل...</p>
      </div>
    );
  }

  const answerLabels = ["أ", "ب", "ج", "د"];
  const answerKeys = ["A", "B", "C", "D"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-teal-50 flex flex-col" dir="rtl">
      {showFeedback && (
        <FeedbackOverlay isCorrect={isCorrect} onContinue={handleContinue} />
      )}

      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center h-16 gap-4">
            <Link href={`/child/chapter/${id}/learn`}>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ArrowRight className="w-6 h-6" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="font-child font-bold text-lg">تمرين</h1>
              <p className="text-xs text-muted-foreground font-arabic">
                السؤال {currentQuestion + 1} من {questions.length}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-green-100 px-3 py-1.5 rounded-full">
              <Sparkles className="w-4 h-4 text-green-600" />
              <span className="text-sm font-child font-bold text-green-700">تمرين</span>
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
                  ? "border-2 border-green-500 bg-green-50"
                  : "hover:bg-gray-50"
              }`}
              onClick={() => handleAnswer(answerKeys[index])}
              data-testid={`button-answer-${index}`}
            >
              <span className={`w-10 h-10 rounded-lg ml-4 flex items-center justify-center font-child font-bold ${
                selectedAnswer === answerKeys[index]
                  ? "bg-green-500 text-white"
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
          onClick={handleCheck}
          disabled={!selectedAnswer}
          className="h-16 mt-6 font-child font-bold text-xl rounded-xl bg-gradient-to-r from-green-500 to-emerald-600"
          data-testid="button-check"
        >
          <CheckCircle className="w-6 h-6 ml-2" />
          تحقق من الإجابة
        </Button>
      </main>
    </div>
  );
}
