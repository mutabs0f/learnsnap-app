import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BookOpen, Sparkles, GraduationCap, Star, Loader2 } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { useLanguage } from "@/contexts/language-context";
import { LanguageToggle } from "@/components/language-toggle";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const { toast } = useToast();
  const { t, isRTL } = useLanguage();

  // Check for error params
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const error = params.get("error");
    if (error === "google_failed") {
      toast({
        title: "فشل تسجيل الدخول",
        description: "حدث خطأ أثناء تسجيل الدخول بـ Google",
        variant: "destructive",
      });
    }
  }, [searchParams, toast]);

  // Check auth providers - default to showing Google button
  const { data: providers, isLoading: providersLoading } = useQuery<{ google: boolean; email: boolean }>({
    queryKey: ["/api/auth/providers"],
  });
  
  // Show Google button by default while loading or if enabled
  const showGoogle = providersLoading || providers?.google !== false;

  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});

  const [registerData, setRegisterData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});

  const handleLoginChange = (field: string, value: string) => {
    setLoginData(prev => ({ ...prev, [field]: value }));
    if (loginErrors[field]) {
      setLoginErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleRegisterChange = (field: string, value: string) => {
    setRegisterData(prev => ({ ...prev, [field]: value }));
    if (registerErrors[field]) {
      setRegisterErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.success || data.token) {
        // [ENTERPRISE v3.0] Do NOT store authToken in localStorage
        // Auth is now handled via httpOnly cookie set by server
        // Only store non-sensitive user info for UI display
        if (data.user) {
          localStorage.setItem("userId", data.user.id);
          localStorage.setItem("userName", data.user.name || "");
        }
        
        // [FIX v4.6] Sync credits from temp deviceId to browser's deviceId
        let deviceId = localStorage.getItem("deviceId");
        if (!deviceId) {
          deviceId = crypto.randomUUID();
          localStorage.setItem("deviceId", deviceId);
        }
        try {
          // [ENTERPRISE v3.0] No Authorization header needed - cookie handles auth
          const syncResponse = await fetch("/api/auth/sync-credits", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ deviceId }),
          });
          
          if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            // Update localStorage with actual credits from server
            localStorage.setItem("pagesRemaining", String(syncData.pagesRemaining));
            
            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent("creditsUpdated", {
              detail: { pagesRemaining: syncData.pagesRemaining }
            }));
          }
        } catch {
          // Credits sync failed silently
        }
        
        toast({ title: t.auth.loginSuccess, description: t.auth.loginSuccessDesc });
        setLocation("/"); // Navigate to home page
      }
    },
    onError: (error: any) => {
      const message = error?.message || t.auth.loginErrorDesc;
      toast({ title: t.auth.loginError, description: message, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: "تم إنشاء الحساب", 
          description: "تحقق من إيميلك لتفعيل الحساب",
        });
        setIsLogin(true);
      }
    },
    onError: (error: any) => {
      const message = error?.message || t.auth.registerErrorDesc;
      toast({ title: t.auth.registerError, description: message, variant: "destructive" });
    },
  });

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginData.email)) {
      errors.email = t.auth.invalidEmail;
    }
    if (loginData.password.length < 6) {
      errors.password = t.auth.passwordMin;
    }
    
    if (Object.keys(errors).length > 0) {
      setLoginErrors(errors);
      return;
    }
    
    loginMutation.mutate(loginData);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors: Record<string, string> = {};
    if (registerData.fullName.trim().length < 2) {
      errors.fullName = t.auth.nameMin;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerData.email)) {
      errors.email = t.auth.invalidEmail;
    }
    if (registerData.password.length < 6) {
      errors.password = t.auth.passwordMin;
    }
    if (registerData.password !== registerData.confirmPassword) {
      errors.confirmPassword = t.auth.passwordMismatch;
    }
    
    if (Object.keys(errors).length > 0) {
      setRegisterErrors(errors);
      return;
    }
    
    registerMutation.mutate({
      email: registerData.email,
      password: registerData.password,
      name: registerData.fullName
    });
  };

  const resetForms = () => {
    setLoginData({ email: '', password: '' });
    setLoginErrors({});
    setRegisterData({ fullName: '', email: '', password: '', confirmPassword: '' });
    setRegisterErrors({});
  };

  const features = [
    { icon: BookOpen, text: t.auth.feature1 },
    { icon: Sparkles, text: t.auth.feature4 },
    { icon: GraduationCap, text: t.auth.feature2 },
    { icon: Star, text: t.auth.feature3 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex" dir={isRTL ? "rtl" : "ltr"}>
      <div className="absolute top-4 right-4 z-10">
        <LanguageToggle />
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-lg border-0">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">
              {isLogin ? t.auth.login : t.auth.createAccount}
            </CardTitle>
            <CardDescription>
              {isLogin ? t.auth.loginDesc : t.auth.registerDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLogin ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">{t.auth.email}</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="example@email.com"
                    value={loginData.email}
                    onChange={(e) => handleLoginChange('email', e.target.value)}
                    data-testid="input-email"
                    className="text-left"
                    dir="ltr"
                  />
                  {loginErrors.email && (
                    <p className="text-sm text-destructive">{loginErrors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">{t.auth.password}</Label>
                    <a 
                      href="/forgot-password" 
                      className="text-sm text-primary hover:underline"
                      data-testid="link-forgot-password"
                    >
                      نسيت كلمة المرور؟
                    </a>
                  </div>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginData.password}
                    onChange={(e) => handleLoginChange('password', e.target.value)}
                    data-testid="input-password"
                  />
                  {loginErrors.password && (
                    <p className="text-sm text-destructive">{loginErrors.password}</p>
                  )}
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.auth.login}
                </Button>
                
                {showGoogle && (
                  <>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">أو</span>
                      </div>
                    </div>
                    <Button 
                      type="button"
                      variant="outline" 
                      className="w-full gap-2" 
                      onClick={handleGoogleLogin}
                      data-testid="button-google-login"
                    >
                      <SiGoogle className="w-4 h-4" />
                      الدخول بـ Google
                    </Button>
                  </>
                )}
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-fullname">{t.auth.fullName}</Label>
                  <Input
                    id="register-fullname"
                    type="text"
                    placeholder={t.dashboard.sampleNamePlaceholder}
                    value={registerData.fullName}
                    onChange={(e) => handleRegisterChange('fullName', e.target.value)}
                    data-testid="input-fullname"
                  />
                  {registerErrors.fullName && (
                    <p className="text-sm text-destructive">{registerErrors.fullName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">{t.auth.email}</Label>
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="example@email.com"
                    value={registerData.email}
                    onChange={(e) => handleRegisterChange('email', e.target.value)}
                    data-testid="input-email-register"
                    className="text-left"
                    dir="ltr"
                  />
                  {registerErrors.email && (
                    <p className="text-sm text-destructive">{registerErrors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">{t.auth.password}</Label>
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="••••••••"
                    value={registerData.password}
                    onChange={(e) => handleRegisterChange('password', e.target.value)}
                    data-testid="input-password-register"
                  />
                  {registerErrors.password && (
                    <p className="text-sm text-destructive">{registerErrors.password}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-confirm">{t.auth.confirmPassword}</Label>
                  <Input
                    id="register-confirm"
                    type="password"
                    placeholder="••••••••"
                    value={registerData.confirmPassword}
                    onChange={(e) => handleRegisterChange('confirmPassword', e.target.value)}
                    data-testid="input-confirm-password"
                  />
                  {registerErrors.confirmPassword && (
                    <p className="text-sm text-destructive">{registerErrors.confirmPassword}</p>
                  )}
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={registerMutation.isPending}
                  data-testid="button-register"
                >
                  {registerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.auth.register}
                </Button>
                
                {showGoogle && (
                  <>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">أو</span>
                      </div>
                    </div>
                    <Button 
                      type="button"
                      variant="outline" 
                      className="w-full gap-2" 
                      onClick={handleGoogleLogin}
                      data-testid="button-google-register"
                    >
                      <SiGoogle className="w-4 h-4" />
                      التسجيل بـ Google
                    </Button>
                  </>
                )}
              </form>
            )}
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  resetForms();
                }}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="button-toggle-auth"
              >
                {isLogin ? t.auth.noAccount : t.auth.hasAccount}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-blue-600 to-emerald-600 items-center justify-center p-12">
        <div className="text-white max-w-lg">
          <h1 className="text-4xl font-bold mb-6">
            {t.auth.appName}
          </h1>
          <p className="text-xl opacity-90 mb-8 leading-relaxed">
            {t.auth.heroTagline}
          </p>
          <div className="space-y-4">
            {features.map((feature, index) => (
              <div key={index} className="flex items-center gap-4 bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <feature.icon className="w-5 h-5" />
                </div>
                <span className="text-lg">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
