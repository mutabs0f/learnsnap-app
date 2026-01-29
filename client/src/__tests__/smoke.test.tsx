/**
 * Frontend Smoke Tests
 * Verifies critical components can render without crashing
 * 
 * Run: npm run test:frontend
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/'],
  useRoute: () => [false, {}],
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  Switch: ({ children }: any) => children,
  Route: ({ children, component: Component }: any) => {
    if (Component) return null;
    return children || null;
  },
}));

// Mock theme provider
vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

// Mock API calls
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
  queryClient: new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
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

describe('Frontend Smoke Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Core Rendering', () => {
    it('renders App without crashing', async () => {
      // Dynamically import to avoid hoisting issues
      const { default: App } = await import('@/App');
      
      const { container } = render(
        <Wrapper>
          <App />
        </Wrapper>
      );
      
      // Basic check - app should render something
      expect(container).toBeDefined();
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  describe('Button Component', () => {
    it('renders button with variants', async () => {
      const { Button } = await import('@/components/ui/button');
      
      render(
        <Wrapper>
          <Button variant="default">Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
        </Wrapper>
      );
      
      expect(screen.getByText('Default')).toBeInTheDocument();
      expect(screen.getByText('Outline')).toBeInTheDocument();
      expect(screen.getByText('Ghost')).toBeInTheDocument();
    });
  });

  describe('Card Component', () => {
    it('renders card structure', async () => {
      const { Card, CardHeader, CardTitle, CardContent } = await import('@/components/ui/card');
      
      render(
        <Wrapper>
          <Card data-testid="test-card">
            <CardHeader>
              <CardTitle>Test Title</CardTitle>
            </CardHeader>
            <CardContent>Test Content</CardContent>
          </Card>
        </Wrapper>
      );
      
      expect(screen.getByTestId('test-card')).toBeInTheDocument();
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });
  });

  describe('Toast Component', () => {
    it('renders toaster without crashing', async () => {
      const { Toaster } = await import('@/components/ui/toaster');
      
      const { container } = render(
        <Wrapper>
          <Toaster />
        </Wrapper>
      );
      
      expect(container).toBeDefined();
    });
  });
});
