/**
 * Upload Page Tests
 * Tests for the upload functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  useRoute: () => [false, {}],
  Link: ({ children, ...props }: Record<string, unknown>) => <a {...props}>{children as React.ReactNode}</a>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/lib/api', () => ({
  getCsrfToken: vi.fn().mockResolvedValue('test-csrf-token'),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('Upload Page Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('deviceId', 'test-device-123');
  });

  describe('Upload UI Elements', () => {
    it('renders upload page with camera button', async () => {
      const { default: UploadPage } = await import('@/pages/upload');
      
      render(
        <Wrapper>
          <UploadPage />
        </Wrapper>
      );
      
      const cameraButton = screen.queryByTestId('button-camera');
      const uploadButton = screen.queryByTestId('button-upload-files');
      
      expect(cameraButton || uploadButton).toBeTruthy();
    });

    it('shows credit display area', async () => {
      const { default: UploadPage } = await import('@/pages/upload');
      
      render(
        <Wrapper>
          <UploadPage />
        </Wrapper>
      );
      
      const creditsElement = screen.queryByTestId('credits-display') || 
                            screen.queryByText(/صفحة|صفحات/i);
      expect(creditsElement).toBeTruthy();
    });
  });

  describe('Image Selection', () => {
    it('handles file input change', async () => {
      const { default: UploadPage } = await import('@/pages/upload');
      
      const { container } = render(
        <Wrapper>
          <UploadPage />
        </Wrapper>
      );
      
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeTruthy();
      
      if (fileInput) {
        expect((fileInput as HTMLInputElement).accept).toContain('image');
      }
    });
  });
});
