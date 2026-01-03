import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, Image, Loader2, ArrowRight, X, Plus, Images } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";

const MAX_IMAGES = 20;

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [pagesRemaining, setPagesRemaining] = useState<number>(() => {
    const stored = localStorage.getItem("pagesRemaining");
    return stored ? parseInt(stored) : 1;
  });

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const deviceId = getOrCreateDeviceId();
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
    } catch {
      toast({
        title: "خطأ في الكاميرا",
        description: "لا يمكن الوصول للكاميرا. تأكد من إعطاء الإذن.",
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

  const processImages = async () => {
    if (capturedImages.length === 0) {
      toast({
        title: "لا توجد صور",
        description: "الرجاء رفع صور الصفحات أولاً",
        variant: "destructive"
      });
      return;
    }
    
    if (pagesRemaining < capturedImages.length) {
      toast({
        title: "صفحات غير كافية",
        description: `لديك ${pagesRemaining} صفحات وتحتاج ${capturedImages.length}`,
        variant: "destructive"
      });
      setLocation("/pricing");
      return;
    }

    setIsProcessing(true);
    const startTime = Date.now();
    
    try {
      const deviceId = getOrCreateDeviceId();
      
      const response = await apiRequest("POST", "/api/quiz/create", {
        images: capturedImages,
        deviceId
      });
      
      const data = await response.json();
      const duration = Date.now() - startTime;
      
      console.log(`Quiz created in ${duration}ms:`, data);
      
      // [GO-1] Don't deduct credits locally - credits are charged on successful generation only
      // Credits will be refreshed when quiz completes
      
      setLocation(`/quiz/${data.sessionId}`);
    } catch (error: unknown) {
      console.error("Quiz creation failed:", error);
      
      if (error instanceof ApiError && error.status === 402) {
        toast({
          title: "صفحات غير كافية",
          description: "اشترِ صفحات إضافية للمتابعة",
          variant: "destructive"
        });
        setLocation("/pricing");
        return;
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
      setIsProcessing(false);
    }
  };

  const removeImage = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllImages = () => {
    setCapturedImages([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-md md:max-w-xl lg:max-w-2xl mx-auto gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="font-bold text-lg">رفع الصفحات</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6 max-w-md md:max-w-xl lg:max-w-2xl mx-auto">
        <Card className="mb-6 bg-gradient-to-r from-blue-500 to-emerald-500 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">الصفحات المتبقية</p>
                <p className="text-3xl font-bold">{pagesRemaining}</p>
              </div>
              <div className="text-left">
                <p className="text-sm opacity-90">الصور المختارة</p>
                <p className="text-3xl font-bold">{capturedImages.length}</p>
              </div>
            </div>
            {pagesRemaining < capturedImages.length && (
              <Button 
                variant="secondary" 
                size="sm" 
                className="mt-3 w-full"
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
              >
                <X className="h-6 w-6" />
              </Button>
              <Button
                size="icon"
                className="h-20 w-20 rounded-full bg-white"
                onClick={capturePhoto}
                data-testid="button-capture"
              >
                <div className="h-16 w-16 rounded-full border-4 border-blue-500" />
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
              >
                <X className="h-4 w-4 ml-1" />
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
                  >
                    <X className="h-3 w-3" />
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
              >
                <Camera className="ml-2 h-4 w-4" />
                كاميرا
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={capturedImages.length >= MAX_IMAGES}
                data-testid="button-add-gallery"
              >
                <Image className="ml-2 h-4 w-4" />
                معرض
              </Button>
            </div>

            <Button
              className="w-full h-14 text-lg"
              onClick={processImages}
              disabled={isProcessing || pagesRemaining < capturedImages.length}
              data-testid="button-process"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="ml-2 h-6 w-6 animate-spin" />
                  جاري التحليل...
                </>
              ) : pagesRemaining < capturedImages.length ? (
                `تحتاج ${capturedImages.length - pagesRemaining} صفحات إضافية`
              ) : (
                <>
                  <Images className="ml-2 h-6 w-6" />
                  توليد الاختبار ({capturedImages.length} صفحات)
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Card 
              className="cursor-pointer hover-elevate active-elevate-2"
              onClick={startCamera}
              data-testid="card-camera"
            >
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                  <Camera className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-200">التقط صور</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">استخدم الكاميرا لتصوير الصفحات</p>
                </div>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover-elevate active-elevate-2"
              onClick={() => fileInputRef.current?.click()}
              data-testid="card-gallery"
            >
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                  <Images className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-200">اختر من المعرض</h3>
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

        <div className="mt-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 p-4">
          <h4 className="mb-2 font-bold text-blue-800 dark:text-blue-300">نصائح للاختبار الأفضل</h4>
          <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-400">
            <li>• يمكنك رفع حتى {MAX_IMAGES} صفحة في اختبار واحد</li>
            <li>• كلما زادت الصفحات، زادت الأسئلة الشاملة</li>
            <li>• تأكد من وضوح النص في كل صورة</li>
            <li>• الذكاء الاصطناعي سيفهم المادة ويختار أفضل الأسئلة</li>
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
