import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, Image, Loader2, ArrowRight, X, Plus, Images, Clock, XCircle } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { getCsrfToken } from "@/lib/api";

const MAX_IMAGES = 20;

// [P0.1 FIX] Handle 401 by clearing session and prompting re-login
function handleAuthError(setLocation: (path: string) => void, toast: any) {
  localStorage.removeItem("authToken");
  localStorage.removeItem("pagesRemaining");
  toast({
    title: "انتهت الجلسة",
    description: "يرجى تسجيل الدخول مرة أخرى",
    variant: "destructive"
  });
  setLocation("/auth");
}

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  // [FIX v2.9.14] Initialize with null to force fetch, not stale localStorage
  const [pagesRemaining, setPagesRemaining] = useState<number | null>(null);
  const [isLoadingCredits, setIsLoadingCredits] = useState(true);
  const [lowCreditAlertShown, setLowCreditAlertShown] = useState(false);
  // [P1 FIX] Cancel and elapsed time tracking
  const [elapsedTime, setElapsedTime] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // [P0.1 FIX] Fetch fresh credits from server - no localStorage fallback for stale data
  // [v2.9.31a] Returns the fetched value for direct use (avoids stale state issues)
  const fetchCreditsFromServer = useCallback(async (showLoadingState = true): Promise<number> => {
    if (showLoadingState) setIsLoadingCredits(true);
    try {
      const deviceId = getOrCreateDeviceId();
      
      // [P0.1 FIX] Always use credentials:include + proper headers
      const headers: Record<string, string> = {
        "x-device-id": deviceId,
      };
      const authToken = localStorage.getItem("authToken");
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      
      const response = await fetch(`/api/credits/${deviceId}`, { 
        headers,
        credentials: "include" // [P0.1 FIX] Send cookies
      });
      
      // [P0.1 FIX] Handle 401 - session expired, prompt re-login
      if (response.status === 401 && authToken) {
        handleAuthError(setLocation, toast);
        return 0;
      }
      
      if (response.ok) {
        const data = await response.json();
        const latestCredits = data.pagesRemaining ?? 0;
        setPagesRemaining(latestCredits);
        localStorage.setItem("pagesRemaining", String(latestCredits));
        return latestCredits;
      } else {
        // [P0.1 FIX] Don't use localStorage fallback - show 0 or error state
        setPagesRemaining(0);
        return 0;
      }
    } catch {
      // [P0.1 FIX] Network error - show 0, don't mislead user with stale data
      setPagesRemaining(0);
      return 0;
    } finally {
      setIsLoadingCredits(false);
    }
  }, [setLocation, toast]);

  useEffect(() => {
    fetchCreditsFromServer();
    
    // [FIX v4.6] Listen for credit updates from auth
    const handleCreditsUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.pagesRemaining !== undefined) {
        setPagesRemaining(customEvent.detail.pagesRemaining);
      }
    };
    
    window.addEventListener("creditsUpdated", handleCreditsUpdate);
    
    return () => {
      window.removeEventListener("creditsUpdated", handleCreditsUpdate);
    };
  }, []);

  // [v3.8.5] Low credit alert when only 1 page remaining
  useEffect(() => {
    if (pagesRemaining === 1 && !lowCreditAlertShown) {
      toast({
        title: "تنبيه: تبقى لك صفحة واحدة!",
        description: (
          <div className="flex flex-col gap-2">
            <span>اشترِ المزيد للاستمرار في التعلم</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setLocation("/pricing")}
              className="w-fit"
            >
              شراء صفحات
            </Button>
          </div>
        ),
        duration: 10000,
      });
      setLowCreditAlertShown(true);
    }
  }, [pagesRemaining, lowCreditAlertShown, toast, setLocation]);

  const startCamera = async () => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      setStream(mediaStream);
      setShowCamera(true);
    } catch (error) {
      const err = error as Error;
      let description = "لا يمكن الوصول للكاميرا.";
      
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        description = "اضغط على القفل بجانب الرابط واسمح بالوصول للكاميرا، ثم أعد تحميل الصفحة.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        description = "لم يتم العثور على كاميرا. تأكد أن جهازك يحتوي على كاميرا.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        description = "الكاميرا مستخدمة من تطبيق آخر. أغلق التطبيقات الأخرى وحاول مرة أخرى.";
      } else if (err.name === "OverconstrainedError") {
        description = "الكاميرا غير متوافقة. جرب من جهاز آخر.";
      }
      
      toast({
        title: "خطأ في الكاميرا",
        description,
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    if (showCamera && stream && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      
      const handleLoadedMetadata = async () => {
        try {
          await video.play();
        } catch {
          toast({
            title: "اضغط على الشاشة",
            description: "اضغط لبدء الكاميرا"
          });
        }
      };
      
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      };
    }
  }, [showCamera, stream, toast]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  }, [stream]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    if (capturedImages.length >= MAX_IMAGES) {
      toast({
        title: "الحد الأقصى",
        description: `يمكنك رفع ${MAX_IMAGES} صورة كحد أقصى`,
        variant: "destructive"
      });
      stopCamera();
      return;
    }
    
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg", 0.8);
      setCapturedImages(prev => [...prev, imageData]);
      stopCamera();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_IMAGES - capturedImages.length;
    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    
    if (files.length > remainingSlots) {
      toast({
        title: "تم تجاوز الحد",
        description: `يمكنك إضافة ${remainingSlots} صور إضافية فقط`,
        variant: "destructive"
      });
    }

    for (const file of filesToProcess) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "الملف كبير جداً",
          description: `${file.name} - الحد الأقصى 5 ميجابايت`,
          variant: "destructive"
        });
        continue;
      }

      try {
        const jpegDataUrl = await convertToJpeg(file);
        setCapturedImages(prev => [...prev, jpegDataUrl]);
      } catch {
        toast({
          title: "خطأ في الصورة",
          description: `فشل في تحويل ${file.name}`,
          variant: "destructive"
        });
      }
    }
    
    if (event.target) {
      event.target.value = "";
    }
  };

  // [v4.7] Improved image compression for multiple images
  const convertToJpeg = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        // More aggressive resize for multiple images
        const MAX_DIMENSION = 1200; // Reduced from 2048
        const MAX_FILE_SIZE = 200 * 1024; // 200KB per image target
        
        let width = img.width;
        let height = img.height;
        
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          
          // Start with quality 0.7 and reduce if needed
          let quality = 0.7;
          let jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
          
          // Reduce quality until file size is acceptable (base64 ~1.37x larger)
          while (jpegDataUrl.length > MAX_FILE_SIZE * 1.37 && quality > 0.3) {
            quality -= 0.1;
            jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
          }
          
          URL.revokeObjectURL(url);
          resolve(jpegDataUrl);
        } else {
          URL.revokeObjectURL(url);
          reject(new Error("Canvas context failed"));
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image load failed"));
      };
      
      img.src = url;
    });
  };

  // [P1 FIX] Cancel processing
  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsProcessing(false);
    setElapsedTime(0);
    toast({
      title: "تم الإلغاء",
      description: "يمكنك المحاولة مرة أخرى",
    });
  }, [toast]);

  const processImages = async () => {
    if (capturedImages.length === 0) {
      toast({
        title: "لا توجد صور",
        description: "الرجاء رفع صور الصفحات أولاً",
        variant: "destructive"
      });
      return;
    }
    
    if ((pagesRemaining ?? 0) < capturedImages.length) {
      toast({
        title: "صفحات غير كافية",
        description: `لديك ${pagesRemaining ?? 0} صفحات وتحتاج ${capturedImages.length}`,
        variant: "destructive"
      });
      setLocation("/pricing");
      return;
    }

    setIsProcessing(true);
    setElapsedTime(0);
    
    // [P1 FIX] Start elapsed time timer
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    
    // [P1 FIX] Create AbortController for cancellation
    abortControllerRef.current = new AbortController();
    
    try {
      const deviceId = getOrCreateDeviceId();
      
      // [P1 FIX] Use fetch directly with AbortController support + CSRF token
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
      };
      const authToken = localStorage.getItem("authToken");
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      
      // [FIX] Add CSRF token for mutating request
      try {
        const csrfToken = await getCsrfToken();
        headers["CSRF-Token"] = csrfToken;
      } catch {
        // CSRF token fetch failed silently
      }
      
      const response = await fetch("/api/quiz/create", {
        method: "POST",
        headers,
        body: JSON.stringify({ images: capturedImages, deviceId }),
        credentials: "include",
        signal: abortControllerRef.current.signal,
      });
      
      // [P0.1 FIX] Handle 401 - session expired
      if (response.status === 401 && authToken) {
        handleAuthError(setLocation, toast);
        return;
      }
      
      // [P0.1 FIX] Handle 402 with better UX
      // [v2.9.31a] Use returned value directly to avoid stale state
      if (response.status === 402) {
        // Fetch fresh credits and use returned value directly (not stale state)
        const latestCredits = await fetchCreditsFromServer(false);
        toast({
          title: "رصيد غير كافٍ",
          description: `لديك ${latestCredits} صفحات وتحتاج ${capturedImages.length}. اشترِ المزيد للمتابعة.`,
          variant: "destructive",
        });
        setLocation("/pricing");
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }
      
      const data = await response.json();
      setLocation(`/quiz/${data.sessionId}`);
      
    } catch (error: unknown) {
      // [P1 FIX] Handle abort gracefully
      if (error instanceof Error && error.name === "AbortError") {
        return; // Already handled in cancelProcessing
      }
      
      const errorMessage = error instanceof Error ? error.message : "";
      let errorTitle = "حدث خطأ";
      let errorDescription = "حاول مرة أخرى";
      
      if (errorMessage.includes('لا يوجد نص') || errorMessage.includes('UNCLEAR') || errorMessage.includes('غير واضح')) {
        errorTitle = "لا يوجد نص واضح في الصور";
        errorDescription = "تأكد من وضوح النص وجودة الإضاءة";
      } else if (errorMessage.includes('الأسئلة') || errorMessage.includes('فشل توليد')) {
        errorTitle = "فشل توليد الأسئلة";
        errorDescription = "جرب صوراً مختلفة أو أقل عدداً";
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive"
      });
    } finally {
      // [P1 FIX] Cleanup timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      abortControllerRef.current = null;
      setIsProcessing(false);
      setElapsedTime(0);
    }
  };

  const removeImage = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllImages = () => {
    setCapturedImages([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-duo-green-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Duolingo-style Header */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b px-4 py-4">
        <div className="flex items-center justify-between max-w-md md:max-w-xl lg:max-w-2xl mx-auto gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation("/")}
            className="rounded-full"
            data-testid="button-back"
            aria-label="العودة للصفحة الرئيسية"
          >
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Button>
          <h1 className="font-black text-xl text-gray-800 dark:text-white">رفع الصفحات</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6 max-w-md md:max-w-xl lg:max-w-2xl mx-auto">
        {/* Duolingo-style Credits Card */}
        <Card className="mb-6 bg-gradient-to-r from-duo-green-500 to-duo-blue-500 text-white border-0 shadow-lg overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-center">
                <p className="text-sm opacity-90 font-medium">الصفحات المتبقية</p>
                <p className="text-4xl font-black">
                  {isLoadingCredits ? "..." : (pagesRemaining ?? 0)}
                </p>
              </div>
              <div className="w-px h-12 bg-white/30" />
              <div className="text-center">
                <p className="text-sm opacity-90 font-medium">الصور المختارة</p>
                <p className="text-4xl font-black">{capturedImages.length}</p>
              </div>
            </div>
            { (pagesRemaining ?? 0) < capturedImages.length && (
              <Button 
                variant="secondary" 
                size="sm" 
                className="mt-4 w-full font-bold"
                onClick={() => setLocation("/pricing")}
                data-testid="button-buy-pages"
              >
                اشتري صفحات إضافية
              </Button>
            )}
          </CardContent>
        </Card>

        {showCamera && (
          <div className="fixed inset-0 z-50 bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="absolute top-4 right-4">
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {capturedImages.length + 1} / {MAX_IMAGES}
              </Badge>
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-4 p-6">
              <Button
                variant="secondary"
                size="icon"
                className="h-14 w-14 rounded-full"
                onClick={stopCamera}
                data-testid="button-cancel-camera"
                aria-label="إلغاء الكاميرا"
              >
                <X className="h-6 w-6" aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                className="h-20 w-20 rounded-full bg-white"
                onClick={capturePhoto}
                data-testid="button-capture"
                aria-label="التقاط صورة"
              >
                <div className="h-16 w-16 rounded-full border-4 border-blue-500" aria-hidden="true" />
              </Button>
              <div className="w-14" />
            </div>
          </div>
        )}

        {capturedImages.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800 dark:text-gray-200">
                الصفحات المختارة ({capturedImages.length})
              </h2>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={clearAllImages}
                data-testid="button-clear-all"
                aria-label="مسح جميع الصور"
              >
                <X className="h-4 w-4 me-1" aria-hidden="true" />
                مسح الكل
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {capturedImages.map((img, index) => (
                <div key={index} className="relative aspect-[3/4] rounded-md overflow-hidden">
                  <img
                    src={img}
                    alt={`صفحة ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 left-1 h-6 w-6"
                    onClick={() => removeImage(index)}
                    data-testid={`button-remove-image-${index}`}
                    aria-label={`حذف صورة ${index + 1}`}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </Button>
                  <Badge className="absolute bottom-1 right-1 text-xs">
                    {index + 1}
                  </Badge>
                </div>
              ))}
              
              {capturedImages.length < MAX_IMAGES && (
                <Card 
                  className="aspect-[3/4] cursor-pointer hover-elevate flex items-center justify-center"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="card-add-more"
                >
                  <div className="text-center p-2">
                    <Plus className="h-8 w-8 mx-auto text-gray-400 mb-1" />
                    <p className="text-xs text-gray-500">إضافة</p>
                  </div>
                </Card>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={startCamera}
                disabled={capturedImages.length >= MAX_IMAGES}
                data-testid="button-add-camera"
                aria-label="إضافة صور بالكاميرا"
              >
                <Camera className="me-2 h-4 w-4" aria-hidden="true" />
                كاميرا
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={capturedImages.length >= MAX_IMAGES}
                data-testid="button-add-gallery"
                aria-label="إضافة صور من المعرض"
              >
                <Image className="me-2 h-4 w-4" aria-hidden="true" />
                معرض
              </Button>
            </div>

            {isProcessing ? (
              <div className="space-y-3" role="status" aria-live="polite" aria-label="جاري التحليل">
                {/* [P1 FIX] Processing state with elapsed time and cancel */}
                <div className="flex items-center justify-center gap-3 text-duo-blue font-bold">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                  <span>جاري التحليل...</span>
                  <span className="flex items-center gap-1 text-sm bg-duo-blue/10 px-2 py-1 rounded-full">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}
                  </span>
                </div>
                <span className="sr-only">جاري تحليل الصور، الوقت المنقضي {Math.floor(elapsedTime / 60)} دقيقة و {elapsedTime % 60} ثانية</span>
                <Button
                  variant="outline"
                  className="w-full h-12 font-bold"
                  onClick={cancelProcessing}
                  data-testid="button-cancel-processing"
                  aria-label="إلغاء التحليل"
                >
                  <XCircle className="me-2 h-5 w-5" aria-hidden="true" />
                  إلغاء
                </Button>
              </div>
            ) : (
              <Button
                className="w-full h-14 rounded-xl text-xl font-black"
                onClick={processImages}
                disabled={(pagesRemaining ?? 0) < capturedImages.length}
                data-testid="button-process"
              >
                {(pagesRemaining ?? 0) < capturedImages.length ? (
                  `تحتاج ${capturedImages.length - (pagesRemaining ?? 0)} صفحات إضافية`
                ) : (
                  <>
                    <Images className="me-2 h-6 w-6" aria-hidden="true" />
                    توليد الاختبار ({capturedImages.length} صفحات)
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Duolingo-style Camera Card */}
            <Card 
              className="cursor-pointer hover-elevate active-elevate-2 border-2 border-duo-blue-200 hover:border-duo-blue-400 transition-colors"
              onClick={startCamera}
              data-testid="card-camera"
            >
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-duo-blue-100 dark:bg-duo-blue-900/30 shadow-md">
                  <Camera className="h-8 w-8 text-duo-blue" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-gray-800 dark:text-gray-200">التقط صور</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">استخدم الكاميرا لتصوير الصفحات</p>
                </div>
              </CardContent>
            </Card>

            {/* Duolingo-style Gallery Card */}
            <Card 
              className="cursor-pointer hover-elevate active-elevate-2 border-2 border-duo-purple-light/50 hover:border-duo-purple transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="card-gallery"
            >
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-duo-purple/10 dark:bg-duo-purple/20 shadow-md">
                  <Images className="h-8 w-8 text-duo-purple" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-gray-800 dark:text-gray-200">اختر من المعرض</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">ارفع حتى {MAX_IMAGES} صورة دفعة واحدة</p>
                </div>
              </CardContent>
            </Card>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileUpload}
              data-testid="input-file"
            />
          </div>
        )}

        {/* Duolingo-style Tips Card */}
        <div className="mt-8 rounded-2xl bg-duo-yellow/10 border-2 border-duo-yellow/30 p-5">
          <h4 className="mb-3 font-black text-lg text-duo-orange-600">نصائح للاختبار الأفضل</h4>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 font-medium">
            <li className="flex items-start gap-2"><span className="text-duo-green">•</span> يمكنك رفع حتى {MAX_IMAGES} صفحة في اختبار واحد</li>
            <li className="flex items-start gap-2"><span className="text-duo-green">•</span> كلما زادت الصفحات، زادت الأسئلة الشاملة</li>
            <li className="flex items-start gap-2"><span className="text-duo-green">•</span> تأكد من وضوح النص في كل صورة</li>
            <li className="flex items-start gap-2"><span className="text-duo-green">•</span> الذكاء الاصطناعي سيفهم المادة ويختار أفضل الأسئلة</li>
          </ul>
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
