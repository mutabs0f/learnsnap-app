/**
 * Shared utility functions for LearnSnap server
 * Consolidates common helpers to avoid duplication
 * 
 * @version 3.5.3
 */

import crypto from "crypto";

/**
 * Mask sensitive IDs for logging (first 8 chars + "...")
 * Used across paylink-routes, audit-logger, storage
 */
export function maskId(id: string | undefined | null): string {
  if (!id) return "[empty]";
  if (id.length <= 8) return id.substring(0, 4) + "...";
  return id.substring(0, 8) + "...";
}

/**
 * Sanitize metadata for audit logging
 * Removes sensitive keys and truncates long values
 */
export function sanitizeMetadata(metadata: Record<string, any> | undefined): Record<string, any> {
  if (!metadata) return {};
  
  const sanitized: Record<string, any> = {};
  const sensitiveKeys = ['token', 'password', 'secret', 'cookie', 'authorization', 'apikey', 'api_key'];
  
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      continue;
    }
    if (typeof value === 'string' && value.length > 100) {
      sanitized[key] = value.substring(0, 100) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Safe string truncation for logging
 */
export function truncate(str: string | undefined | null, maxLength: number = 50): string {
  if (!str) return "[empty]";
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "...";
}

/**
 * Mask email addresses for logging
 * Shows first 3 characters + "***@domain"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "[empty]";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const maskedLocal = local.length > 3 ? local.substring(0, 3) + "***" : "***";
  return `${maskedLocal}@${domain}`;
}

/**
 * Get the correct ownerId for credits
 * - Guest: deviceId
 * - Logged in user: user_<USER_ID>
 */
export function getCreditOwnerId(deviceId: string, userId?: string | null): string {
  if (userId) {
    return `user_${userId}`;
  }
  return deviceId;
}

/**
 * Generate a unique idempotency key
 */
export function generateIdempotencyKey(prefix: string = "op"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Constants for credit system
 */
export const CREDIT_CONSTANTS = {
  FREE_PAGES_GUEST: 2,
  DEFAULT_FREE_PAGES: 2,
  EARLY_ADOPTER_FREE_PAGES: 50,
  EARLY_ADOPTER_LIMIT: 30,
} as const;

/**
 * Standardized API Response Format (Google Standard)
 * All API responses follow this structure for consistency
 * 
 * @version 3.4.0 - L6 Compliance Update
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
    requestId?: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * API response helper - success (L6 Standard Format)
 */
export function apiSuccess<T>(data: T, meta?: ApiSuccessResponse<T>['meta']): ApiSuccessResponse<T> {
  return { 
    success: true, 
    data,
    meta: meta ? {
      ...meta,
      timestamp: new Date().toISOString(),
    } : undefined,
  };
}

/**
 * API response helper - error (L6 Standard Format)
 */
export function apiError(
  message: string, 
  code: string = 'INTERNAL_ERROR',
  details?: unknown[],
  requestId?: string
): ApiErrorResponse {
  return { 
    success: false, 
    error: {
      code,
      message,
      details,
      requestId,
    },
  };
}

/**
 * Create paginated response
 */
export function apiPaginated<T>(
  items: T[],
  page: number,
  limit: number,
  total: number
): ApiSuccessResponse<T[]> {
  return apiSuccess(items, {
    timestamp: new Date().toISOString(),
    pagination: {
      page,
      limit,
      total,
      hasMore: page * limit < total,
    },
  });
}

/**
 * Format Arabic date
 */
export function formatDateArabic(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ar-SA");
}

/**
 * [P1.2] Hash a token for secure storage
 * Uses SHA-256 for one-way hashing
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * [P1.2] Compare a raw token against a stored hash
 * Uses constant-time comparison to prevent timing attacks
 */
export function compareTokenHash(rawToken: string, storedHash: string): boolean {
  const inputHash = hashToken(rawToken);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(inputHash, "hex"),
      Buffer.from(storedHash, "hex")
    );
  } catch {
    return false;
  }
}
