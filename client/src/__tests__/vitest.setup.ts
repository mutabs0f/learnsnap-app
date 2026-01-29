/**
 * Vitest setup for frontend tests
 */
import '@testing-library/jest-dom';
import { vi, beforeAll, afterAll } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock global fetch to handle relative URLs in jsdom
const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = vi.fn().mockImplementation((url: string | URL) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.startsWith('/api')) {
      return Promise.resolve(new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    return originalFetch(url);
  });
});

afterAll(() => {
  global.fetch = originalFetch;
});
