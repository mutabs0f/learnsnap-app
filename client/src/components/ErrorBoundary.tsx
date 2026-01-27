import { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const isChunkError = 
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('ChunkLoadError');
    
    return { hasError: true, error, isChunkError };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    if (this.state.isChunkError) {
      const reloadKey = 'errorBoundary_lastReload';
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      
      if (!lastReload || now - parseInt(lastReload) > 10000) {
        sessionStorage.setItem(reloadKey, String(now));
        setTimeout(() => window.location.reload(), 500);
      }
    }
  }

  handleReload = () => {
    sessionStorage.removeItem('errorBoundary_lastReload');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background" dir="rtl">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold mb-2 text-foreground">
              {this.state.isChunkError ? "تم تحديث التطبيق" : "حدث خطأ غير متوقع"}
            </h1>
            <p className="text-muted-foreground mb-6">
              {this.state.isChunkError 
                ? "يرجى تحديث الصفحة للحصول على أحدث إصدار."
                : "نعتذر عن هذا الخطأ. يرجى تحديث الصفحة."}
            </p>
            <Button onClick={this.handleReload} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              تحديث الصفحة
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
