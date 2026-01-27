import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/gamification";
import { ArrowRight, CheckCircle, XCircle, Sparkles, HelpCircle, Check, X } from "lucide-react";
import { useChildAuth } from "@/hooks/useChildAuth";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import type { Chapter } from "@shared/schema";

interface PracticeQuestion {
  question: string;
  options: string[];
  correct: string;
  explanation?: string;
}

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

  const { isAuthenticated } = useChildAuth();
  const sounds = useSoundEffects();

  const { data: chapter } = useQuery<Chapter>({
    queryKey: ["/api/chapters", id],
    enabled: !!id && isAuthenticated,
  });

  const questions = (chapter?.content?.practice || []) as PracticeQuestion[];
  const question = questions[currentQuestion] as PracticeQuestion | undefined;
  const progress = questions.length > 0 ? ((currentQuestion + 1) / questions.length) * 100 : 0;

  const handleAnswer = (answer: string) => {
    setSelectedAnswer(answer);
    sounds.playClick();
  };

  const handleCheck = () => {
    if (!selectedAnswer || !question) return;

    const correct = selectedAnswer === question.correct;
    setIsCorrect(correct);
    setAnswers(prev => [...prev, selectedAnswer]);
    setShowFeedback(true);
    
    if (correct) {
      sounds.playCorrect();
      
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 }
        });
      }, 250);
      
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 }
        });
      }, 400);
    } else {
      sounds.playWrong();
    }
  };

  const handleContinue = () => {
    setShowFeedback(false);
    setSelectedAnswer(null);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      setLocation(`/child/chapter/${id}/results?practice=${answers.join(",")}`);
    }
  };

  if (!question) {
    return null;
  }

  const answerKeys = ['A', 'B', 'C', 'D'];
  const answerLabels = ['أ', 'ب', 'ج', 'د'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-teal-50 flex flex-col" dir="rtl">
      {showFeedback && (
        <FeedbackOverlay isCorrect={isCorrect} onContinue={handleContinue} />
      )}

      <header className="bg-white/90 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link href={`/child/chapter/${id}/learn`}>
              <Button variant="ghost" size="icon">
                <ArrowRight className="w-6 h-6" />
              </Button>
            </Link>
            
            <div className="text-sm font-bold text-gray-600 dark:text-gray-300">
              {currentQuestion + 1} / {questions.length}
            </div>
            
            <div className="flex items-center gap-2 bg-duo-green-100 dark:bg-duo-green-900/30 px-3 py-1.5 rounded-full">
              <span className="text-sm font-bold text-duo-green-700 dark:text-duo-green-300">تمرين</span>
            </div>
          </div>
          
          <ProgressBar
            progress={progress}
            color="primary"
            showLabel={false}
            height="medium"
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full px-4 md:px-6 py-8">
        <div className="mb-6">
          <Card className="shadow-elevated border-2 border-gray-200 dark:border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-duo-blue-500 to-duo-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <HelpCircle className="w-7 h-7 text-white" />
                </div>
                
                <div className="flex-1">
                  <div className="text-sm font-bold text-duo-blue-600 dark:text-duo-blue-400 mb-2">
                    سؤال {currentQuestion + 1}
                  </div>
                  <p 
                    className="text-2xl font-bold text-gray-900 dark:text-white leading-relaxed"
                    data-testid="text-question"
                  >
                    {question.question}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3 flex-1">
          {question.options.map((option, index) => {
            const letter = answerKeys[index];
            const label = answerLabels[index];
            const isSelected = selectedAnswer === letter;
            const isCorrectAnswer = showFeedback && letter === question.correct;
            const isWrongAnswer = showFeedback && isSelected && !isCorrect;
            
            return (
              <motion.button
                key={index}
                onClick={() => !showFeedback && handleAnswer(letter)}
                disabled={showFeedback}
                className={`
                  w-full p-5 rounded-2xl border-2 text-right
                  transition-all duration-200
                  flex items-center gap-4
                  ${!showFeedback && !isSelected ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-duo-blue-400 hover:bg-duo-blue-50 dark:hover:bg-duo-blue-900/20 hover:shadow-md hover:scale-[1.02]' : ''}
                  ${isSelected && !showFeedback ? 'border-duo-blue-500 bg-duo-blue-50 dark:bg-duo-blue-900/30 shadow-glow-blue' : ''}
                  ${isCorrectAnswer ? 'border-duo-green-500 bg-duo-green-50 dark:bg-duo-green-900/30 shadow-glow-green' : ''}
                  ${isWrongAnswer ? 'border-red-500 bg-red-50 dark:bg-red-900/30 shadow-glow-red' : ''}
                  disabled:cursor-not-allowed
                `}
                whileHover={!showFeedback ? { scale: 1.02, y: -2 } : {}}
                whileTap={!showFeedback ? { scale: 0.98 } : {}}
                animate={
                  isCorrectAnswer ? { scale: [1, 1.05, 1] } :
                  isWrongAnswer ? { x: [-10, 10, -10, 10, 0] } : {}
                }
                transition={
                  isCorrectAnswer ? { duration: 0.5 } :
                  isWrongAnswer ? { duration: 0.5 } : {}
                }
                data-testid={`button-answer-${index}`}
              >
                <div className={`
                  w-12 h-12 rounded-xl flex items-center justify-center
                  flex-shrink-0 font-black text-lg shadow-md
                  ${!showFeedback && !isSelected ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : ''}
                  ${isSelected && !showFeedback ? 'bg-gradient-to-br from-duo-blue-500 to-duo-blue-600 text-white' : ''}
                  ${isCorrectAnswer ? 'bg-gradient-to-br from-duo-green-500 to-duo-green-600 text-white' : ''}
                  ${isWrongAnswer ? 'bg-gradient-to-br from-red-500 to-red-600 text-white' : ''}
                `}>
                  {showFeedback ? (
                    isCorrectAnswer ? <Check className="w-6 h-6" /> :
                    isWrongAnswer ? <X className="w-6 h-6" /> :
                    label
                  ) : (
                    label
                  )}
                </div>
                
                <span className={`
                  text-lg font-semibold
                  ${!showFeedback && !isSelected ? 'text-gray-700 dark:text-gray-300' : ''}
                  ${isSelected && !showFeedback ? 'text-duo-blue-700 dark:text-duo-blue-300' : ''}
                  ${isCorrectAnswer ? 'text-duo-green-700 dark:text-duo-green-300' : ''}
                  ${isWrongAnswer ? 'text-red-700 dark:text-red-300' : ''}
                `}>
                  {option}
                </span>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {showFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-6 mb-6"
            >
              <Card className={`
                border-2
                ${isCorrect 
                  ? 'bg-gradient-to-r from-duo-green-50 to-duo-green-100 dark:from-duo-green-900/20 dark:to-duo-green-900/30 border-duo-green-500' 
                  : 'bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/30 border-red-500'
                }
              `}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`
                      w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg
                      ${isCorrect 
                        ? 'bg-gradient-to-br from-duo-green-500 to-duo-green-600' 
                        : 'bg-gradient-to-br from-red-500 to-red-600'
                      }
                    `}>
                      {isCorrect ? (
                        <Check className="w-7 h-7 text-white" />
                      ) : (
                        <X className="w-7 h-7 text-white" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <h3 className={`
                        text-2xl font-black mb-2
                        ${isCorrect ? 'text-duo-green-700 dark:text-duo-green-300' : 'text-red-700 dark:text-red-300'}
                      `}>
                        {isCorrect ? 'رائع! إجابة صحيحة!' : 'للأسف، إجابة خاطئة'}
                      </h3>
                      
                      <p className="text-gray-700 dark:text-gray-300 text-lg mb-4">
                        {question.explanation || (isCorrect ? 'أحسنت! إجابتك صحيحة.' : 'لا بأس، الخطأ جزء من التعلم.')}
                      </p>
                      
                      {!isCorrect && (
                        <div className="mt-4 p-4 bg-white/80 dark:bg-gray-800/80 rounded-xl border border-duo-green-500">
                          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                            الإجابة الصحيحة:
                          </div>
                          <div className="text-lg font-bold text-duo-green-700 dark:text-duo-green-300">
                            {question.correct}. {question.options[answerKeys.indexOf(question.correct)]}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto pt-6">
          {!showFeedback ? (
            <Button
              variant="duoPrimary"
              size="lg"
              className="w-full"
              disabled={!selectedAnswer}
              onClick={handleCheck}
              data-testid="button-check"
            >
              تحقق من الإجابة
            </Button>
          ) : (
            <Button
              variant="duoPrimary"
              size="lg"
              className="w-full"
              onClick={handleContinue}
              data-testid="button-continue"
            >
              {currentQuestion < questions.length - 1 ? "السؤال التالي" : "إنهاء الاختبار"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
