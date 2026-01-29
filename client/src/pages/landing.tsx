import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Sparkles, CheckCircle, Star, Zap, Shield, User, LogOut, BookOpen, Trophy, Target } from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check auth via cookie-based session
    fetch("/api/auth/me", { credentials: "include" })
      .then(res => res.json())
      .then(user => {
        if (user.id) {
          setIsLoggedIn(true);
          setUserName(user.name || localStorage.getItem("userName") || "");
        }
      })
      .catch(() => {
        // Not logged in
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleLogout = async () => {
    // Call server to clear session cookie
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    // Clear ALL user-related data on logout
    localStorage.removeItem("authToken");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    localStorage.removeItem("pagesRemaining");
    setIsLoggedIn(false);
    setUserName("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-duo-green-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-duo-green-500 to-duo-green-600 rounded-xl flex items-center justify-center shadow-lg">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-black text-gray-800 dark:text-white">LearnSnap</span>
            </div>
            
            {isLoggedIn ? (
              <div className="flex items-center gap-3">
                <span className="text-gray-600 dark:text-gray-300 text-sm" data-testid="text-username">
                  {userName || "مرحباً"}
                </span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleLogout}
                  data-testid="button-logout"
                  aria-label="تسجيل الخروج"
                >
                  <LogOut className="me-1 h-4 w-4" aria-hidden="true" />
                  خروج
                </Button>
              </div>
            ) : (
              <Link href="/auth">
                <Button 
                  variant="outline"
                  data-testid="button-login"
                  aria-label="تسجيل الدخول"
                >
                  <User className="me-2 h-4 w-4" aria-hidden="true" />
                  تسجيل الدخول
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center lg:text-right"
          >
            <h1 className="text-display-2 md:text-display-1 text-gray-900 dark:text-white mb-6">
              تعلّم بطريقة
              <span className="text-duo-green-500"> ممتعة</span>
              <br />
              ومسلية!
            </h1>
            
            <p className="text-body-large text-gray-600 dark:text-gray-300 mb-8">
              حوّل صور كتبك الدراسية إلى اختبارات تفاعلية ممتعة.
              تعلم، تدرب، وحقق أهدافك التعليمية!
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start flex-wrap">
              <Link href="/upload">
                <Button 
                  variant="duoPrimary"
                  size="lg"
                  className="w-full sm:w-auto"
                  data-testid="button-try-free"
                  aria-label="ابدأ التعلم الآن"
                >
                  <Zap className="me-2 h-5 w-5" aria-hidden="true" />
                  ابدأ التعلم الآن
                </Button>
              </Link>
              
              <Link href="/demo-quiz">
                <Button 
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                  data-testid="button-try-demo"
                >
                  <Sparkles className="me-2 h-5 w-5" />
                  جرب مثال مجاني
                </Button>
              </Link>
              
              <Button 
                variant="outline"
                size="lg"
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                data-testid="button-how-it-works"
              >
                كيف يعمل؟
              </Button>
            </div>
          </motion.div>
          
          {/* Illustration */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            <div className="relative w-full aspect-square max-w-md mx-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-duo-green-100 to-duo-blue-100 dark:from-duo-green-900/30 dark:to-duo-blue-900/30 rounded-3xl" />
              
              <motion.div
                className="absolute top-10 right-10 w-20 h-20 bg-duo-green-500 rounded-2xl shadow-glow-green flex items-center justify-center"
                animate={{ y: [0, -15, 0], rotate: [0, 5, 0] }}
                transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
              >
                <BookOpen className="w-10 h-10 text-white" />
              </motion.div>
              
              <motion.div
                className="absolute bottom-20 left-10 w-16 h-16 bg-duo-blue-500 rounded-2xl shadow-glow-blue flex items-center justify-center"
                animate={{ y: [0, 15, 0], rotate: [0, -5, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, repeatType: 'reverse' }}
              >
                <Trophy className="w-8 h-8 text-white" />
              </motion.div>
              
              <motion.div
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-duo-orange-500 rounded-2xl shadow-glow-orange flex items-center justify-center"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse' }}
              >
                <Target className="w-12 h-12 text-white" />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-white dark:bg-gray-800 px-4 py-16">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-display-2 text-gray-900 dark:text-white mb-4">
              كيف يعمل LearnSnap؟
            </h2>
            <p className="text-body-large text-gray-600 dark:text-gray-300">
              ثلاث خطوات بسيطة للتعلم الفعّال
            </p>
          </motion.div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Camera, title: "صوّر الصفحة", desc: "التقط صورة من أي كتاب دراسي", color: "duo-blue", step: 1 },
              { icon: Sparkles, title: "تحليل ذكي", desc: "الذكاء الاصطناعي يولد شرح وأسئلة", color: "duo-green", step: 2 },
              { icon: CheckCircle, title: "اختبر نفسك", desc: "أجب على الأسئلة واحصل على النتيجة", color: "duo-orange", step: 3 },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="card-duo card-duo-hover text-center p-6 h-full">
                  <div className={`w-20 h-20 mx-auto mb-6 bg-${feature.color}-500 rounded-2xl flex items-center justify-center shadow-lg relative`}
                    style={{ backgroundColor: feature.color === 'duo-blue' ? '#1CB0F6' : feature.color === 'duo-green' ? '#58CC02' : '#FF9600' }}
                  >
                    <feature.icon className="w-10 h-10 text-white" />
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-sm font-bold text-gray-700 dark:text-gray-200 shadow-md">
                      {feature.step}
                    </div>
                  </div>
                  <h3 className="text-h3 text-gray-900 dark:text-white mb-3">{feature.title}</h3>
                  <p className="text-body text-gray-600 dark:text-gray-300">{feature.desc}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="bg-gray-50 dark:bg-gray-900 px-4 py-16">
        <div className="container mx-auto max-w-md md:max-w-xl lg:max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-display-2 text-gray-900 dark:text-white mb-2">
              أسعار بسيطة
            </h2>
            <p className="text-body-large text-gray-600 dark:text-gray-300">
              ادفع حسب استخدامك
            </p>
          </motion.div>
          
          <div className="space-y-4">
            <Card className="border-2 border-duo-green-300 bg-duo-green-50 dark:bg-duo-green-900/20">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-bold text-duo-green-700 dark:text-duo-green-400">تجربة مجانية</p>
                  <p className="text-sm text-duo-green-600 dark:text-duo-green-500">صفحتين مجاناً</p>
                </div>
                <Badge className="bg-duo-green-500 text-white">مجاني</Badge>
              </CardContent>
            </Card>

            <Card className="border-2 border-purple-300">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-bold text-gray-800 dark:text-white">10 صفحات</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">0.50 ريال/صفحة</p>
                </div>
                <div className="text-left">
                  <p className="text-2xl font-black text-purple-600">5 ريال</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-duo-blue-300 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-duo-blue-500" />
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800 dark:text-white">25 صفحة</p>
                    <Badge className="bg-duo-blue-500 text-white">الأكثر شيوعاً</Badge>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">0.48 ريال/صفحة</p>
                </div>
                <div className="text-left">
                  <p className="text-2xl font-black text-duo-blue-600">12 ريال</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-duo-orange-300">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-800 dark:text-white">60 صفحة</p>
                    <Badge className="bg-duo-orange-500 text-white">أفضل قيمة</Badge>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">0.42 ريال/صفحة</p>
                </div>
                <div className="text-left">
                  <p className="text-2xl font-black text-duo-orange-600">25 ريال</p>
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
              عرض جميع الباقات
            </Button>
          </Link>
        </div>
      </section>

      {/* Trust Section */}
      <section className="bg-white dark:bg-gray-800 px-4 py-12">
        <div className="container mx-auto max-w-md md:max-w-xl lg:max-w-2xl">
          <div className="grid grid-cols-3 gap-4 text-center">
            <motion.div whileHover={{ scale: 1.05 }}>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-duo-yellow/20">
                <Star className="h-7 w-7 text-duo-yellow" style={{ color: '#FFC800' }} />
              </div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">جودة عالية</p>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }}>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-duo-blue-100 dark:bg-duo-blue-900/30">
                <Zap className="h-7 w-7 text-duo-blue-500" />
              </div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">سريع جداً</p>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }}>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-duo-green-100 dark:bg-duo-green-900/30">
                <Shield className="h-7 w-7 text-duo-green-500" />
              </div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">آمن وموثوق</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-duo-green-500 to-duo-green-600 px-4 py-16 text-center text-white">
        <div className="container mx-auto max-w-md md:max-w-xl lg:max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-display-2 mb-4">
              ابدأ الآن مجاناً
            </h2>
            <p className="text-lg text-white/90 mb-8">
              صفحتك الأولى مجانية - لا حاجة للتسجيل
            </p>
            <Link href="/upload">
              <Button 
                variant="duoBlue"
                size="lg"
                data-testid="button-start-now"
              >
                <Camera className="me-2 h-5 w-5" aria-hidden="true" />
                ابدأ الآن
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 px-4 py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-8 h-8 bg-duo-green-500 rounded-lg flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white">LearnSnap</span>
        </div>
        <p className="text-sm text-gray-400">
          LearnSnap © {new Date().getFullYear()} - تعلم بذكاء
        </p>
      </footer>
    </div>
  );
}
