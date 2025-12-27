import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ArrowLeft, BookOpen, Sparkles, Volume2, VolumeX, Pause, Play, Square, AlertCircle } from "lucide-react";
import { useSpeech } from "@/hooks/use-speech";
import { useChildAuth } from "@/hooks/useChildAuth";
import type { Chapter } from "@shared/schema";

export default function LearnStage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const [autoNarrate, setAutoNarrate] = useState(false);
  
  // Check for existing child session (JWT cookie) - no childId needed if already authenticated
  const { isAuthenticated, isLoading: authLoading, error: authError } = useChildAuth();

  const { speak, stop, pause, resume, isSpeaking, isPaused, isSupported } = useSpeech({
    lang: "ar-SA",
    rate: 0.85,
  });

  const { data: chapter, isLoading } = useQuery<Chapter>({
    queryKey: ["/api/chapters", id],
    enabled: !!id && isAuthenticated,
  });

  const content = chapter?.content;
  const paragraphs = content?.explanation.paragraphs || [];
  const progress = paragraphs.length > 0 ? ((currentParagraph + 1) / paragraphs.length) * 100 : 0;

  useEffect(() => {
    if (autoNarrate && paragraphs[currentParagraph]) {
      speak(paragraphs[currentParagraph]);
    }
  }, [currentParagraph, autoNarrate, paragraphs, speak]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const handlePlayPause = () => {
    if (isSpeaking && !isPaused) {
      pause();
    } else if (isPaused) {
      resume();
    } else {
      speak(paragraphs[currentParagraph]);
    }
  };

  const handleStop = () => {
    stop();
  };

  const toggleAutoNarrate = () => {
    if (autoNarrate) {
      stop();
      setAutoNarrate(false);
    } else {
      setAutoNarrate(true);
      speak(paragraphs[currentParagraph]);
    }
  };

  const handleNext = () => {
    stop();
    if (currentParagraph < paragraphs.length - 1) {
      setCurrentParagraph(prev => prev + 1);
    } else {
      setLocation(`/child/chapter/${id}/practice`);
    }
  };

  const handlePrev = () => {
    stop();
    if (currentParagraph > 0) {
      setCurrentParagraph(prev => prev - 1);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50" dir="rtl">
        <div className="max-w-2xl mx-auto p-6 pt-20">
          <Skeleton className="h-3 w-full mb-8" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!chapter || !content) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center" dir="rtl">
        <Card className="text-center p-8">
          <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-child font-bold mb-2">الدرس غير موجود</h2>
          <Link href="/">
            <Button className="font-arabic">العودة</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col" dir="rtl">
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center h-16 gap-4">
            <Link href={`/child/chapter/${id}`}>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ArrowRight className="w-6 h-6" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="font-child font-bold text-lg">{content.topic}</h1>
              <p className="text-xs text-muted-foreground font-arabic">
                {currentParagraph + 1} من {paragraphs.length}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-blue-100 px-3 py-1.5 rounded-full">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-child font-bold text-blue-700">تعلّم</span>
            </div>
            {isSupported && (
              <Button
                variant={autoNarrate ? "default" : "outline"}
                size="icon"
                onClick={toggleAutoNarrate}
                className="rounded-xl"
                data-testid="button-toggle-narration"
                title={autoNarrate ? "إيقاف القراءة التلقائية" : "تفعيل القراءة التلقائية"}
              >
                {autoNarrate ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </Button>
            )}
          </div>
          <Progress value={progress} className="h-2 mb-2" />
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-8">
        <Card className="flex-1 flex flex-col shadow-lg border-0 bg-white/90 backdrop-blur-sm">
          <CardContent className="flex-1 flex flex-col p-8">
            <div className="flex-1 flex items-center justify-center">
              <p 
                className="text-2xl font-arabic leading-loose text-gray-800 text-center animate-slide-up"
                key={currentParagraph}
                data-testid={`text-paragraph-${currentParagraph}`}
              >
                {paragraphs[currentParagraph]}
              </p>
            </div>

            {isSupported && (
              <div className="flex items-center justify-center gap-3 pt-4 border-t border-gray-100">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePlayPause}
                  className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100"
                  data-testid="button-play-pause"
                  title={isSpeaking && !isPaused ? "إيقاف مؤقت" : "تشغيل"}
                >
                  {isSpeaking && !isPaused ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                </Button>
                {isSpeaking && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleStop}
                    className="rounded-full bg-red-50 text-red-600 hover:bg-red-100"
                    data-testid="button-stop"
                    title="إيقاف"
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                )}
                <span className="text-sm font-arabic text-muted-foreground">
                  {isSpeaking 
                    ? isPaused 
                      ? "متوقف مؤقتاً" 
                      : "جارٍ القراءة..." 
                    : "اضغط للاستماع"}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-4 mt-6">
          <Button
            variant="outline"
            size="lg"
            onClick={handlePrev}
            disabled={currentParagraph === 0}
            className="h-14 px-6 font-child font-bold rounded-xl"
            data-testid="button-prev"
          >
            <ArrowRight className="w-5 h-5 ml-2" />
            السابق
          </Button>

          <div className="flex items-center gap-2">
            {paragraphs.map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  i === currentParagraph 
                    ? "bg-blue-600" 
                    : i < currentParagraph 
                      ? "bg-blue-300" 
                      : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          <Button
            size="lg"
            onClick={handleNext}
            className="h-14 px-6 font-child font-bold rounded-xl bg-gradient-to-r from-blue-500 to-blue-600"
            data-testid="button-next"
          >
            {currentParagraph === paragraphs.length - 1 ? (
              <>
                <Sparkles className="w-5 h-5 ml-2" />
                ابدأ التمرين
              </>
            ) : (
              <>
                التالي
                <ArrowLeft className="w-5 h-5 mr-2" />
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
