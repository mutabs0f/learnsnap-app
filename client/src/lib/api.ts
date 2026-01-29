// CSRF Token Management & Secure Fetch Utility
// [SECURITY FIX v3.3.3] Added token rotation with TTL

let csrfToken: string | null = null;
let csrfTokenExpiry: number = 0;

// CSRF token TTL: 30 minutes
const CSRF_TOKEN_TTL = 30 * 60 * 1000;

export async function getCsrfToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid
  if (csrfToken && now < csrfTokenExpiry) {
    return csrfToken;
  }
  
  // Fetch new token
  try {
    const response = await fetch('/api/csrf-token', {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    csrfToken = data.csrfToken;
    csrfTokenExpiry = now + CSRF_TOKEN_TTL;
    return csrfToken!;
  } catch {
    throw new Error('فشل في الحصول على رمز الأمان');
  }
}

// Wrapper for fetch that includes CSRF token
export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getCsrfToken();
  
  const headers = new Headers(options.headers);
  headers.set('CSRF-Token', token);
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
  
  // [SECURITY FIX v3.3.3] Clear token on 403 to force refresh
  if (response.status === 403) {
    const text = await response.clone().text();
    if (text.includes('CSRF') || text.includes('csrf')) {
      clearCsrfToken();
    }
  }
  
  return response;
}

// Clear cached CSRF token (call on logout or token expiry)
export function clearCsrfToken() {
  csrfToken = null;
  csrfTokenExpiry = 0;
}
