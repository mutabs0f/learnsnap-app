// CSRF Token Management & Secure Fetch Utility

let csrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }
  
  try {
    const response = await fetch('/api/csrf-token', {
      credentials: 'include',
    });
    const data = await response.json();
    csrfToken = data.csrfToken;
    return csrfToken!;
  } catch (error) {
    console.error('Failed to get CSRF token:', error);
    throw new Error('فشل في الحصول على رمز الأمان');
  }
}

// Wrapper for fetch that includes CSRF token
export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getCsrfToken();
  
  const headers = new Headers(options.headers);
  headers.set('CSRF-Token', token);
  
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

// Clear cached CSRF token (call on logout or token expiry)
export function clearCsrfToken() {
  csrfToken = null;
}
