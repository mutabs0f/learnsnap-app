import { useState, useCallback } from "react";

export function useAdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState("");

  const login = useCallback(async (password: string): Promise<boolean> => {
    if (password.length === 0) return false;
    
    setIsLoggingIn(true);
    setError("");
    
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-password": password }
      });
      
      if (res.status === 401) {
        setError("كلمة المرور غير صحيحة");
        setIsAuthenticated(false);
        return false;
      }
      
      if (!res.ok) {
        setError("خطأ في الاتصال");
        return false;
      }
      
      setSessionToken(password);
      setIsAuthenticated(true);
      return true;
    } catch {
      setError("خطأ في الاتصال بالخادم");
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setSessionToken(null);
  }, []);

  const fetchWithAuth = useCallback(async (url: string) => {
    if (!sessionToken) throw new Error("Not authenticated");
    const res = await fetch(url, {
      headers: { "x-admin-password": sessionToken }
    });
    if (res.status === 401) {
      setIsAuthenticated(false);
      setSessionToken(null);
      throw new Error("Session expired");
    }
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  }, [sessionToken]);

  const postWithAuth = useCallback(async (url: string, body: any) => {
    if (!sessionToken) throw new Error("Not authenticated");
    const res = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-admin-password": sessionToken 
      },
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      setIsAuthenticated(false);
      setSessionToken(null);
      throw new Error("Session expired");
    }
    return res;
  }, [sessionToken]);

  const patchWithAuth = useCallback(async (url: string, body: any) => {
    if (!sessionToken) throw new Error("Not authenticated");
    const res = await fetch(url, {
      method: "PATCH",
      headers: { 
        "Content-Type": "application/json",
        "x-admin-password": sessionToken 
      },
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      setIsAuthenticated(false);
      setSessionToken(null);
      throw new Error("Session expired");
    }
    return res;
  }, [sessionToken]);

  return {
    isAuthenticated,
    sessionToken,
    isLoggingIn,
    error,
    login,
    logout,
    fetchWithAuth,
    postWithAuth,
    patchWithAuth,
  };
}
