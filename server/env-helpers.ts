/**
 * Environment variable helpers
 * Centralizes common env var patterns to reduce duplication
 */

/**
 * Get the device token secret for HMAC signing.
 * Falls back to SESSION_SECRET if DEVICE_TOKEN_SECRET is not set.
 * @returns The secret string, or undefined if neither is configured
 */
export function getDeviceTokenSecret(): string | undefined {
  return process.env.DEVICE_TOKEN_SECRET || process.env.SESSION_SECRET;
}

/**
 * Check if we're running in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
