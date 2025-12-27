import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Loader2, Home, BookOpen } from "lucide-react";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    // Get device ID and fetch updated credits
    const deviceId = localStorage.getItem("deviceId");
    if (deviceId) {
      fetch(`/api/credits/${deviceId}`)
        .then((res) => res.json())
        .then((data) => {
          setCredits(data.pages || 0);
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-primary/10 to-background"
      dir="rtl"
    >
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-6 space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              تم الدفع بنجاح!
            </h1>
            <p className="text-muted-foreground">
              شكراً لك! تم إضافة الصفحات إلى رصيدك.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-muted-foreground">جاري تحديث الرصيد...</span>
            </div>
          ) : credits !== null ? (
            <div className="bg-primary/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">رصيدك الحالي</p>
              <p className="text-3xl font-bold text-primary">{credits} صفحة</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 pt-2">
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => setLocation("/upload")}
              data-testid="button-start-quiz"
            >
              <BookOpen className="w-5 h-5" />
              ابدأ اختبار جديد
            </Button>
            
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2"
              onClick={() => setLocation("/")}
              data-testid="button-go-home"
            >
              <Home className="w-5 h-5" />
              الصفحة الرئيسية
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
