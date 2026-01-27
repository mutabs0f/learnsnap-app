/**
 * Auth Page Tests
 * Tests for authentication functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('Auth Page Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Auth UI Elements', () => {
    it('renders auth page with login form', async () => {
      const { default: AuthPage } = await import('@/pages/auth');
      
      render(
        <Wrapper>
          <AuthPage />
        </Wrapper>
      );
      
      const emailInput = screen.queryByTestId('input-email') || 
                        screen.queryByPlaceholderText(/email|بريد/i);
      const passwordInput = screen.queryByTestId('input-password') || 
                           screen.queryByPlaceholderText(/password|كلمة/i);
      
      expect(emailInput || passwordInput).toBeTruthy();
    });

    it('renders Google OAuth button', async () => {
      const { default: AuthPage } = await import('@/pages/auth');
      
      render(
        <Wrapper>
          <AuthPage />
        </Wrapper>
      );
      
      const googleButton = screen.queryByTestId('button-google-login') ||
                          screen.queryByText(/google/i);
      
      expect(googleButton).toBeTruthy();
    });

    it('has toggle between login and register', async () => {
      const { default: AuthPage } = await import('@/pages/auth');
      
      render(
        <Wrapper>
          <AuthPage />
        </Wrapper>
      );
      
      const toggleButton = screen.queryByTestId('button-toggle-auth') ||
                          screen.queryByText(/تسجيل|إنشاء/i);
      
      expect(toggleButton).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('shows form fields for authentication', async () => {
      const { default: AuthPage } = await import('@/pages/auth');
      
      const { container } = render(
        <Wrapper>
          <AuthPage />
        </Wrapper>
      );
      
      const inputs = container.querySelectorAll('input');
      expect(inputs.length).toBeGreaterThanOrEqual(2);
    });
  });
});
