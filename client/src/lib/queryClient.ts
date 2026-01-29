import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCsrfToken, clearCsrfToken } from "./api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new ApiError(res.status, text);
  }
}

// [ENTERPRISE v3.0] Check if legacy Bearer auth is enabled via env flag
const LEGACY_BEARER_AUTH = typeof window !== 'undefined' && 
  (window as any).__LEGACY_BEARER_AUTH === true;

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // [FIX v2.9.12] Add x-device-id header for BOLA protection
  if (typeof window !== 'undefined' && window.localStorage) {
    const deviceId = localStorage.getItem('deviceId');
    if (deviceId) {
      headers['x-device-id'] = deviceId;
    }
    
    // [ENTERPRISE v3.0] Only send Authorization header if legacy mode is enabled
    // Primary auth is now via httpOnly cookie (credentials: "include")
    if (LEGACY_BEARER_AUTH) {
      const authToken = localStorage.getItem('authToken');
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
    }
  }
  
  // Add CSRF token for mutating requests
  if (method !== "GET" && method !== "HEAD") {
    try {
      const csrfToken = await getCsrfToken();
      headers["CSRF-Token"] = csrfToken;
    } catch {
      // CSRF token fetch failed silently
    }
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // If CSRF token invalid, clear cache and retry once
  if (res.status === 403) {
    const text = await res.clone().text();
    if (text.includes("CSRF")) {
      clearCsrfToken();
      // Retry with fresh token
      const freshToken = await getCsrfToken();
      headers["CSRF-Token"] = freshToken;
      const retryRes = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });
      await throwIfResNotOk(retryRes);
      return retryRes;
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

// [FIX v2.9.12] Helper to get device ID from localStorage
function getDeviceId(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('deviceId');
  }
  return null;
}

// [FIX v2.9.19] Helper to get auth token from localStorage
function getAuthToken(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('authToken');
  }
  return null;
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // [FIX v2.9.12] Add x-device-id header for BOLA protection
    const headers: Record<string, string> = {
      'Cache-Control': 'no-cache', // [FIX v2.9.17] Prevent browser caching
    };
    const deviceId = getDeviceId();
    if (deviceId) {
      headers['x-device-id'] = deviceId;
    }
    
    // [ENTERPRISE v3.0] Only send Authorization header if legacy mode is enabled
    // Primary auth is now via httpOnly cookie (credentials: "include")
    if (LEGACY_BEARER_AUTH) {
      const authToken = getAuthToken();
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
    }
    
    // [FIX v2.9.17] Use no-store cache mode to prevent 304 errors
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
      cache: 'no-store',
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }
    
    // [FIX v2.9.17] Handle 304 responses - treat as cache error
    if (res.status === 304) {
      throw new ApiError(304, 'Cache not modified - please refresh');
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
