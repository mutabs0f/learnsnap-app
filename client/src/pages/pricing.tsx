import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Check, Star, Flame, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface Package {
  id: string;
  variantId: string;
  pages: number;
  price: number;
  pricePerPage: number;
  name: string;
  badge?: string;
}

function formatArabicNumber(num: number): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num.toString().split('').map(d => arabicDigits[parseInt(d)] || d).join('');
}

export default function PricingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [processingPackage, setProcessingPackage] = useState<string | null>(null);
  const [pagesRemaining, setPagesRemaining] = useState<number>(() => {
    return parseInt(localStorage.getItem("pagesRemaining") || "0");
  });

  const deviceId = getOrCreateDeviceId();

  // [6] Fetch packages from server (no hardcoded variant IDs)
  const { data: packagesData, isLoading: packagesLoading } = useQuery<{ packages: Package[] }>({
    queryKey: ["/api/billing/packs"],
  });

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const response = await fetch(`/api/credits/${deviceId}`);
        if (response.ok) {
          const data = await response.json();
          setPagesRemaining(data.pagesRemaining);
          localStorage.setItem("pagesRemaining", String(data.pagesRemaining));
        }
      } catch {
        // Fall back to localStorage value
      }
    };
    fetchCredits();
  }, [deviceId]);

  const handleCheckout = async (pkg: Package) => {
    setProcessingPackage(pkg.id);

    try {
      const response = await fetch("/api/lemonsqueezy/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: pkg.variantId,
          deviceId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || "فشل إنشاء رابط الدفع");
      }

      // Redirect to LemonSqueezy checkout
      window.location.href = data.checkoutUrl;
    } catch (error) {
      toast({
        title: "حدث خطأ",
        description: error instanceof Error ? error.message : "فشل الاتصال بنظام الدفع",
        variant: "destructive"
      });
      setProcessingPackage(null);
    }
  };

  const packages = packagesData?.packages || [];

  // Package display enhancements
  const getPackageDisplay = (pkg: Package) => {
    const priceInSar = pkg.price / 100;
    const pricePerPageInSar = (pkg.pricePerPage / 100).toFixed(2);
    
    return {
      displayPrice: `${formatArabicNumber(priceInSar)} ريال`,
      pricePerPage: `${pricePerPageInSar} ريال/صفحة`,
      popular: pkg.id === "popular",
      icon: pkg.id === "popular" ? Star : pkg.id === "best" ? Flame : null,
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2 max-w-md mx-auto">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="font-bold text-lg">شراء صفحات</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6 max-w-md mx-auto">
        {/* Current Balance */}
        <Card className="mb-6 bg-gradient-to-r from-purple-500 to-blue-500 text-white">
          <CardContent className="p-4 text-center">
            <p className="text-sm opacity-90">رصيدك الحالي</p>
            <p className="text-3xl font-bold">{pagesRemaining} صفحة</p>
          </CardContent>
        </Card>

        {/* Packages Loading */}
        {packagesLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        )}

        {/* Packages */}
        <div className="space-y-4">
          {packages.map((pkg) => {
            const display = getPackageDisplay(pkg);
            
            return (
              <Card 
                key={pkg.id}
                className={`relative transition-all ${
                  display.popular 
                    ? "border-2 border-purple-400 shadow-lg" 
                    : pkg.id === "best"
                      ? "border-2 border-orange-300"
                      : ""
                }`}
                data-testid={`card-package-${pkg.id}`}
              >
                {pkg.badge && (
                  <div className="absolute top-0 left-0 right-0">
                    <Badge className={`w-full rounded-none justify-center py-1 gap-1 ${
                      pkg.id === "best" ? "bg-orange-500" : "bg-purple-500"
                    }`}>
                      {display.icon && <display.icon className="h-3 w-3" />}
                      {pkg.badge}
                    </Badge>
                  </div>
                )}
                
                <CardContent className={`p-6 ${pkg.badge ? "pt-10" : ""}`}>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div>
                      <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                        {pkg.pages} صفحة
                      </p>
                      <p className="text-sm text-gray-500">{display.pricePerPage}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-3xl font-bold text-purple-600">
                        {display.displayPrice}
                      </p>
                    </div>
                  </div>

                  <ul className="mb-4 space-y-2">
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      صالحة للاستخدام في أي وقت
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      تدعم جميع المواد الدراسية
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      أسئلة متنوعة بالذكاء الاصطناعي
                    </li>
                  </ul>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => handleCheckout(pkg)}
                    disabled={processingPackage !== null}
                    data-testid={`button-buy-${pkg.id}`}
                  >
                    {processingPackage === pkg.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                        جاري التحويل...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 ml-2" />
                        اشتري الآن
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Payment Methods */}
        <div className="mt-8 text-center">
          <div className="flex justify-center items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            <span className="text-sm text-gray-600 dark:text-gray-300">دفع آمن ومشفر</span>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            يدعم جميع البطاقات البنكية - Visa, Mastercard, mada
          </p>
        </div>
      </main>
    </div>
  );
}

function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem("deviceId");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("deviceId", deviceId);
  }
  return deviceId;
}
