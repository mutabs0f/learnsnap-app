import { useEffect, useState } from "react";

interface UseChildAuthResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// Hook for child authentication
// If childId is provided, will attempt login. Otherwise, will just verify existing session.
export function useChildAuth(childId?: string | undefined): UseChildAuthResult {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const authenticate = async () => {
      try {
        // First, try to verify existing child session
        const verifyResponse = await fetch("/api/child/me", {
          method: "GET",
          credentials: "include",
        });

        if (verifyResponse.ok) {
          // Already authenticated with valid child session
          setIsAuthenticated(true);
          setError(null);
          setIsLoading(false);
          return;
        }

        // No valid session - need to login with childId
        if (!childId) {
          setIsLoading(false);
          setError("يرجى العودة لصفحة الترحيب");
          return;
        }

        // Call child login - parent session is verified via httpOnly cookie
        const response = await fetch("/api/child/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ childId }),
          credentials: "include", // Important: sends parent cookie
        });

        if (response.ok) {
          setIsAuthenticated(true);
          setError(null);
        } else {
          const data = await response.json();
          setError(data.error || "Authentication failed");
        }
      } catch (err) {
        setError("Failed to authenticate");
        console.error("Child auth error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    authenticate();
  }, [childId]);

  return { isAuthenticated, isLoading, error };
}
