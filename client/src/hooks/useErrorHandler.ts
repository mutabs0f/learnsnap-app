import { useToast } from './use-toast';
import { useLocation } from 'wouter';

interface ApiError {
  message?: string;
  status?: number;
  error?: string;
}

export function useErrorHandler() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleError = (error: unknown) => {
    console.error('API Error:', error);

    let title = 'خطأ';
    let message = 'حدث خطأ غير متوقع';

    if (error instanceof Response) {
      if (error.status === 400) {
        title = 'بيانات غير صحيحة';
        message = 'تحقق من البيانات المدخلة وحاول مجدداً';
      } else if (error.status === 401) {
        title = 'انتهت الجلسة';
        message = 'يرجى تسجيل الدخول مجدداً';
        setTimeout(() => {
          setLocation('/auth');
        }, 2000);
      } else if (error.status === 403) {
        title = 'غير مصرح';
        message = 'ليس لديك صلاحية للوصول';
      } else if (error.status === 404) {
        title = 'غير موجود';
        message = 'العنصر المطلوب غير موجود';
      } else if (error.status === 429) {
        title = 'طلبات كثيرة';
        message = 'حاول مرة أخرى بعد قليل';
      } else if (error.status === 500) {
        title = 'خطأ في الخادم';
        message = 'حدث خطأ في الخادم، يرجى المحاولة لاحقاً';
      } else if (error.status === 503) {
        title = 'الخدمة غير متوفرة';
        message = 'الخدمة تحت الصيانة، حاول لاحقاً';
      }
    } else if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'object' && error !== null) {
      const apiError = error as ApiError;
      message = apiError.error || apiError.message || message;
    }

    toast({
      variant: 'destructive',
      title,
      description: message,
      duration: 5000,
    });
  };

  const handleSuccess = (message: string) => {
    toast({
      title: 'نجح!',
      description: message,
      duration: 3000,
    });
  };

  return { handleError, handleSuccess };
}
