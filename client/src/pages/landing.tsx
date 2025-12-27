import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Sparkles, CheckCircle, Star, Zap, Shield, User, LogOut } from "lucide-react";
import { useState, useEffect } from "react";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const name = localStorage.getItem("userName");
    if (token) {
      setIsLoggedIn(true);
      setUserName(name || "");
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    setIsLoggedIn(false);
    setUserName("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 via-blue-500 to-emerald-500">
      {/* Header with Login */}
      <header className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="text-white font-bold text-lg">LearnSnap</div>
        {isLoggedIn ? (
          <div className="flex items-center gap-2">
            <span className="text-white/90 text-sm" data-testid="text-username">
              مرحباً {userName || "!"}
            </span>
            <Button 
              variant="outline" 
              size="sm"
              className="border-white/50 bg-white/10 text-white backdrop-blur-sm"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="ml-1 h-4 w-4" />
              خروج
            </Button>
          </div>
        ) : (
          <Link href="/auth">
            <Button 
              variant="outline" 
              className="border-white/50 bg-white/10 text-white backdrop-blur-sm"
              data-testid="button-login"
            >
              <User className="ml-2 h-4 w-4" />
              تسجيل الدخول
            </Button>
          </Link>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative px-4 pt-8 pb-16 text-center text-white">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-white/20 p-4 backdrop-blur-sm">
              <Sparkles className="h-12 w-12" />
            </div>
          </div>
          
          <h1 className="mb-4 text-3xl font-bold leading-tight">
            صوّر واختبر
            <br />
            <span className="text-yellow-300">تعلم أذكى</span>
          </h1>
          
          <p className="mb-8 text-lg text-white/90">
            صور أي صفحة من الكتاب واحصل على أسئلة واختبارات فورية بالذكاء الاصطناعي
          </p>
          
          <Link href="/upload">
            <Button 
              size="lg" 
              className="h-14 w-full max-w-xs bg-white text-blue-600 text-lg font-bold shadow-lg"
              data-testid="button-try-free"
            >
              <Camera className="ml-2 h-5 w-5" />
              جرّب مجاناً
            </Button>
          </Link>
          
          <p className="mt-4 text-sm text-white/80">
            أول صفحة مجانية - بدون تسجيل
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white px-4 py-12">
        <div className="mx-auto max-w-md">
          <h2 className="mb-8 text-center text-2xl font-bold text-gray-800">
            كيف يعمل؟
          </h2>
          
          <div className="space-y-4">
            <FeatureCard
              icon={<Camera className="h-8 w-8 text-blue-500" />}
              title="صوّر الصفحة"
              description="التقط صورة من أي كتاب دراسي"
              step={1}
            />
            
            <FeatureCard
              icon={<Sparkles className="h-8 w-8 text-purple-500" />}
              title="الذكاء الاصطناعي"
              description="يحلل المحتوى ويولد أسئلة ذكية"
              step={2}
            />
            
            <FeatureCard
              icon={<CheckCircle className="h-8 w-8 text-green-500" />}
              title="اختبر فوراً"
              description="احصل على النتيجة مباشرة"
              step={3}
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md">
          <h2 className="mb-2 text-center text-2xl font-bold text-gray-800">
            أسعار بسيطة
          </h2>
          <p className="mb-8 text-center text-gray-600">
            ادفع حسب استخدامك
          </p>
          
          <div className="space-y-3">
            {/* Free */}
            <Card className="border-2 border-green-200 bg-green-50">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-bold text-green-700">تجربة مجانية</p>
                  <p className="text-sm text-green-600">صفحة واحدة مجاناً</p>
                </div>
                <Badge className="bg-green-500">مجاني</Badge>
              </CardContent>
            </Card>

            {/* Popular Package */}
            <Card className="border-2 border-purple-300">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-800">١٥ صفحة</p>
                    <Badge className="bg-purple-500">الأكثر شيوعاً</Badge>
                  </div>
                  <p className="text-sm text-gray-500">٠.٤٧ ريال/صفحة</p>
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold text-purple-600">٧ ريال</p>
                </div>
              </CardContent>
            </Card>

            {/* Best Value */}
            <Card className="border-2 border-orange-200">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-800">٥٠ صفحة</p>
                    <Badge className="bg-orange-500">أفضل قيمة</Badge>
                  </div>
                  <p className="text-sm text-gray-500">٠.٤٠ ريال/صفحة</p>
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold text-orange-600">٢٠ ريال</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Link href="/pricing">
            <Button 
              variant="outline" 
              className="mt-6 w-full"
              data-testid="button-view-pricing"
            >
              شراء صفحات
            </Button>
          </Link>
        </div>
      </section>

      {/* Trust Section */}
      <section className="bg-white px-4 py-12">
        <div className="mx-auto max-w-md">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                <Star className="h-6 w-6 text-yellow-500" />
              </div>
              <p className="text-sm font-medium text-gray-700">جودة عالية</p>
            </div>
            <div>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <Zap className="h-6 w-6 text-blue-500" />
              </div>
              <p className="text-sm font-medium text-gray-700">سريع</p>
            </div>
            <div>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Shield className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm font-medium text-gray-700">آمن</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-emerald-500 px-4 py-12 text-center text-white">
        <div className="mx-auto max-w-md">
          <h2 className="mb-4 text-2xl font-bold">
            ابدأ الآن مجاناً
          </h2>
          <p className="mb-6 text-white/90">
            صفحتك الأولى مجانية - لا حاجة للتسجيل
          </p>
          <Link href="/upload">
            <Button 
              size="lg" 
              className="h-14 w-full max-w-xs bg-white text-blue-600 text-lg font-bold"
              data-testid="button-start-now"
            >
              ابدأ الآن
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 px-4 py-6 text-center text-white">
        <p className="text-sm text-gray-400">
          LearnSnap © {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description, 
  step 
}: { 
  icon: JSX.Element; 
  title: string; 
  description: string; 
  step: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            {icon}
          </div>
          <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
            {step}
          </div>
        </div>
        <div>
          <h3 className="font-bold text-gray-800">{title}</h3>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
