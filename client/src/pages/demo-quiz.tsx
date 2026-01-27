import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Home, ArrowLeft, ThumbsUp, ThumbsDown, Heart, X } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const DEMO_QUIZ = {
  lesson: {
    title: "درس تجريبي: الكسور",
    summary: "تعلم أساسيات الكسور البسيطة",
  },
  questions: [
    {
      question: "ما هو البسط في الكسر ٣/٤؟",
      options: ["٣", "٤", "٧", "١"],
      correct: 0,
      explanation: "البسط هو العدد العلوي في الكسر"
    },
    {
      question: "ما هو المقام في الكسر ٥/٨؟",
      options: ["٥", "٨", "١٣", "٣"],
      correct: 1,
      explanation: "المقام هو العدد السفلي في الكسر"
    },
    {
      question: "الكسر ١/٢ يساوي:",
      options: ["الربع", "النصف", "الثلث", "الكل"],
      correct: 1,
      explanation: "١/٢ يعني جزء واحد من جزئين"
    },
    {
      question: "أي كسر أكبر؟",
      options: ["١/٤", "١/٢", "١/٨", "١/١٦"],
      correct: 1,
      explanation: "كلما صغر المقام كبر الكسر"
    },
    {
      question: "١/٤ + ١/٤ = ؟",
      options: ["١/٢", "٢/٨", "١/٤", "٢/١٦"],
      correct: 0,
      explanation: "١/٤ + ١/٤ = ٢/٤ = ١/٢"
    }
  ]
};

export default function DemoQuiz() {
  const [, setLocation] = useLocation();
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<Record<number, "up" | "down">>({});
  const [hearts, setHearts] = useState(5);
  const { toast } = useToast();

  const sendFeedback = (questionIndex: number, feedback: "up" | "down") => {
    if (feedbackSent[questionIndex]) return;
    setFeedbackSent(prev => ({ ...prev, [questionIndex]: feedback }));
    toast({
      title: feedback === "up" ? "شكراً!" : "شكراً لملاحظتك",
      description: feedback === "up" ? "سعداء أن السؤال أعجبك" : "سنعمل على تحسين الأسئلة",
      duration: 2000,
    });
  };

  const question = DEMO_QUIZ.questions[currentQ];
  const isCorrect = selected === question.correct;

  const handleSelect = (idx: number) => {
    if (showFeedback) return;
    setSelected(idx);
  };

  const handleCheck = () => {
    if (selected === null) return;
    setShowFeedback(true);
    if (isCorrect) {
      setScore(s => s + 1);
    } else {
      setHearts(h => Math.max(0, h - 1));
    }
  };

  const handleNext = () => {
    if (currentQ < DEMO_QUIZ.questions.length - 1) {
      setCurrentQ(q => q + 1);
      setSelected(null);
      setShowFeedback(false);
    } else {
      setFinished(true);
    }
  };

  if (finished) {
    const percentage = Math.round((score / DEMO_QUIZ.questions.length) * 100);
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-8">
            <div className="text-6xl mb-4">
              {percentage >= 80 ? "🎉" : percentage >= 60 ? "👍" : "💪"}
            </div>
            <h1 className="text-2xl font-bold mb-2">أحسنت!</h1>
            <p className="text-4xl font-black text-green-600 mb-2">{percentage}%</p>
            <p className="text-muted-foreground mb-6">
              {score} من {DEMO_QUIZ.questions.length} إجابات صحيحة
            </p>
            <p className="text-sm text-muted-foreground mb-6 bg-yellow-50 p-3 rounded-lg">
              هذا مجرد مثال! ارفع صورة من كتابك للحصول على اختبار مخصص
            </p>
            <div className="space-y-3">
              <Button className="w-full" onClick={() => setLocation("/upload")} data-testid="button-start-real">
                ابدأ اختبار حقيقي
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setLocation("/")} data-testid="button-home">
                <Home className="me-2 h-4 w-4" />
                الرئيسية
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-duo-blue-50 to-white" dir="rtl">
      {/* Duolingo-style Header */}
      <header className="sticky top-0 z-50 bg-white border-b px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full" data-testid="button-back">
            <X className="h-6 w-6" />
          </Button>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-duo-green to-duo-green-light rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${((currentQ + 1) / DEMO_QUIZ.questions.length) * 100}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
          {/* Hearts Indicator */}
          <div className="flex items-center gap-1" data-testid="hearts-display">
            <Heart className="h-6 w-6 text-duo-red fill-duo-red" />
            <span className="font-bold text-duo-red text-lg">{hearts}</span>
          </div>
          <span className="text-sm font-bold text-gray-600">{currentQ + 1}/{DEMO_QUIZ.questions.length}</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 mt-4">
        <div className="bg-duo-yellow/20 text-duo-orange-600 text-sm font-bold px-4 py-2 rounded-full inline-block border border-duo-yellow/30">
          اختبار تجريبي - مجاني
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Question Title with Feedback Buttons */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-700">اختر الإجابة الصحيحة</h2>
          
          {/* Question Feedback Buttons */}
          <div className="flex gap-1" dir="ltr">
            <Button
              variant="ghost"
              size="icon"
              className={`${feedbackSent[currentQ] === "up" ? "text-duo-green" : "text-gray-400"}`}
              onClick={() => sendFeedback(currentQ, "up")}
              disabled={!!feedbackSent[currentQ]}
              aria-label="سؤال جيد"
              data-testid="button-thumbs-up"
            >
              <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`${feedbackSent[currentQ] === "down" ? "text-duo-red" : "text-gray-400"}`}
              onClick={() => sendFeedback(currentQ, "down")}
              disabled={!!feedbackSent[currentQ]}
              aria-label="سؤال سيء"
              data-testid="button-thumbs-down"
            >
              <ThumbsDown className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        
        {/* Duolingo-style Question Bubble */}
        <div className="relative mb-6">
          <div className="bg-gradient-to-br from-duo-blue-50 to-duo-blue-100 rounded-2xl border-2 border-duo-blue-200 shadow-lg p-6">
            <div className="absolute -top-3 right-8 w-6 h-6 bg-duo-blue-100 border-2 border-duo-blue-200 transform rotate-45 border-b-0 border-r-0"></div>
            <p className="text-xl font-bold text-gray-800 text-center leading-relaxed">
              {question.question}
            </p>
          </div>
        </div>
        
        <div className="space-y-3">
          {question.options.map((opt, idx) => {
            const isSelected = selected === idx;
            const isCorrectAnswer = idx === question.correct;
            const optionLabels = ["أ", "ب", "ج", "د"];
            
            let className = "w-full p-4 rounded-xl border-2 text-right transition-all ";
            
            if (showFeedback) {
              if (isCorrectAnswer) {
                className += "border-duo-green bg-duo-green/10";
              } else if (isSelected) {
                className += "border-duo-red bg-duo-red-light";
              } else {
                className += "border-gray-200 opacity-50";
              }
            } else {
              className += isSelected 
                ? "border-duo-blue bg-duo-blue/10 shadow-[0_4px_0_0_#1CB0F6] -translate-y-1" 
                : "border-gray-200 hover:border-gray-300 bg-white";
            }

            return (
              <motion.button
                key={idx}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(idx)}
                disabled={showFeedback}
                className={className}
                data-testid={`option-${idx}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0
                    ${showFeedback && isCorrectAnswer ? "bg-duo-green text-white" : 
                      showFeedback && isSelected ? "bg-duo-red text-white" :
                      isSelected ? "bg-duo-blue text-white" : "bg-gray-100 text-gray-600"}
                  `}>
                    {showFeedback && isCorrectAnswer ? <CheckCircle className="w-5 h-5" /> :
                     showFeedback && isSelected && !isCorrectAnswer ? <XCircle className="w-5 h-5" /> :
                     optionLabels[idx]}
                  </div>
                  <span className="font-bold text-gray-700 text-lg">{opt}</span>
                </div>
              </motion.button>
            );
          })}
        </div>

        {showFeedback && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 bg-duo-yellow/10 rounded-2xl border-2 border-duo-yellow/30"
          >
            <p className="text-gray-700 font-medium"><strong>تلميح:</strong> {question.explanation}</p>
          </motion.div>
        )}
      </main>

      {/* Duolingo-style Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t-2 p-4 pb-8">
        <div className="max-w-2xl mx-auto">
          {!showFeedback ? (
            <Button 
              className="w-full h-14 rounded-xl text-xl font-black"
              disabled={selected === null}
              onClick={handleCheck}
              data-testid="button-check"
            >
              تحقق من الإجابة
            </Button>
          ) : (
            <Button 
              className={`w-full h-14 rounded-xl text-xl font-black
                ${isCorrect ? "bg-duo-green text-white" : "bg-duo-red text-white"}
              `}
              onClick={handleNext}
              data-testid="button-next"
            >
              {currentQ < DEMO_QUIZ.questions.length - 1 ? "التالي" : "عرض النتيجة"}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
