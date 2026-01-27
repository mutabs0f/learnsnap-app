import type { Request, Response, NextFunction } from 'express';

/**
 * API Versioning Middleware
 * 
 * Supports:
 * - URL versioning: /api/v1/...
 * - Header versioning: Accept-Version: v1
 * 
 * Default version: v1
 */

export type ApiVersion = 'v1';

const CURRENT_VERSION: ApiVersion = 'v1';
const SUPPORTED_VERSIONS: ApiVersion[] = ['v1'];

export function extractApiVersion(req: Request): ApiVersion {
  // 1. Check URL path (/api/v1/...)
  const urlMatch = req.path.match(/^\/api\/(v\d+)\//);
  if (urlMatch) {
    const version = urlMatch[1] as ApiVersion;
    if (SUPPORTED_VERSIONS.includes(version)) {
      return version;
    }
  }
  
  // 2. Check Accept-Version header
  const headerVersion = req.get('Accept-Version') as ApiVersion;
  if (headerVersion && SUPPORTED_VERSIONS.includes(headerVersion)) {
    return headerVersion;
  }
  
  // 3. Default to current version
  return CURRENT_VERSION;
}

/**
 * Middleware to add API version to request
 */
export function apiVersionMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract version and attach to request
  (req as any).apiVersion = extractApiVersion(req);
  
  // Add version to response headers
  res.setHeader('API-Version', (req as any).apiVersion);
  
  next();
}

/**
 * Check if client is using deprecated API version
 */
export function checkDeprecatedVersion(req: Request, res: Response, next: NextFunction) {
  // Currently no deprecated versions
  // In future, you can warn clients:
  // if (version === 'v0') {
  //   res.setHeader('Deprecation', 'true');
  //   res.setHeader('Sunset', 'Wed, 11 Nov 2025 11:11:11 GMT');
  // }
  
  next();
}

/**
 * Helper to create versioned route
 */
export function versionedRoute(version: ApiVersion, path: string): string {
  return `/api/${version}${path}`;
}
