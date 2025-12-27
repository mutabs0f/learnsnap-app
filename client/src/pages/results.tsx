import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Trophy, Home, RefreshCw } from "lucide-react";
import type { ChapterResult, Chapter } from "@shared/schema";

function ConfettiPiece({ delay }: { delay: number }) {
  const colors = ["bg-child-coral", "bg-child-turquoise", "bg-child-yellow", "bg-child-green", "bg-child-purple", "bg-amber-400"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const left = Math.random() * 100;
  const size = Math.random() * 8 + 4;
  
  return (
    <div 
      className={`absolute rounded-sm ${color} animate-confetti-fall`}
      style={{ 
        left: `${left}%`, 
        animationDelay: `${delay}ms`,
        animationDuration: `${3 + Math.random() * 2}s`,
        top: "-20px",
        width: `${size}px`,
        height: `${size}px`,
      }}
    />
  );
}

function AnimatedStar({ index, filled }: { index: number; filled: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), index * 200);
    return () => clearTimeout(timer);
  }, [index]);

  if (!show) return <Star className="w-12 h-12 text-gray-200" />;

  return (
    <Star 
      className={`w-12 h-12 ${filled ? "text-amber-400 fill-amber-400 animate-star-pop" : "text-gray-200"}`}
    />
  );
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();

  const { data: chapter } = useQuery<Chapter>({
    queryKey: ["/api/chapters", id],
    enabled: !!id,
  });

  const { data: result } = useQuery<ChapterResult>({
    queryKey: ["/api/chapters", id, "result"],
    enabled: !!id,
  });

  const stars = result?.stars || 0;
  const totalScore = result?.totalScore || 0;
  const practiceScore = result?.practiceScore || 0;
  const testScore = result?.testScore || 0;

  const messages = [
    { min: 90, text: "مذهل! أنت نجم لامع!", icon: "trophy" },
    { min: 80, text: "رائع جداً! استمر!", icon: "star" },
    { min: 70, text: "أحسنت! عمل جيد!", icon: "thumbsup" },
    { min: 60, text: "جيد! يمكنك التحسن!", icon: "smile" },
    { min: 0, text: "لا بأس! حاول مرة أخرى!", icon: "heart" },
  ];

  const percentage = Math.round((totalScore / 15) * 100);
  const message = messages.find(m => percentage >= m.min) || messages[messages.length - 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-amber-100 flex flex-col relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 50 }).map((_, i) => (
          <ConfettiPiece key={i} delay={i * 100} />
        ))}
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative z-10">
        <div className="w-28 h-28 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mb-6 shadow-2xl animate-bounce-gentle">
          <Trophy className="w-16 h-16 text-white" />
        </div>

        <h1 className="text-4xl font-child font-bold text-gray-800 mb-2 text-center" data-testid="text-congrats">
          أحسنت!
        </h1>
        <p className="text-xl font-arabic text-gray-600 mb-8 text-center">
          {message.text}
        </p>

        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <AnimatedStar key={i} index={i} filled={i < stars} />
          ))}
        </div>

        <Card className="w-full max-w-sm mb-8 shadow-xl border-0 bg-white/90 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="text-center mb-4">
              <p className="text-5xl font-child font-bold text-gray-800" data-testid="text-score">
                {totalScore}/15
              </p>
              <p className="text-lg font-arabic text-gray-500">النتيجة الإجمالية</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-child font-bold text-green-600">{practiceScore}/5</p>
                <p className="text-sm font-arabic text-gray-500">التمرين</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-child font-bold text-purple-600">{testScore}/10</p>
                <p className="text-sm font-arabic text-gray-500">الاختبار</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="w-full max-w-sm mb-8 bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0 shadow-lg">
          <CardContent className="p-4 text-center">
            <p className="font-arabic text-lg">
              والديك سيرون نتيجتك! استمر في التعلم
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
          <Link href={`/child/chapter/${id}/learn`} className="flex-1">
            <Button 
              variant="outline" 
              size="lg" 
              className="w-full h-14 font-child font-bold rounded-xl gap-2"
              data-testid="button-retry"
            >
              <RefreshCw className="w-5 h-5" />
              إعادة المحاولة
            </Button>
          </Link>
          <Link href="/" className="flex-1">
            <Button 
              size="lg" 
              className="w-full h-14 font-child font-bold rounded-xl gap-2 bg-gradient-to-r from-child-coral to-child-purple"
              data-testid="button-home"
            >
              <Home className="w-5 h-5" />
              الرئيسية
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
