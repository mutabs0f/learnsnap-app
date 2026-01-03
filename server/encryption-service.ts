import CryptoJS from 'crypto-js';
import logger from './logger.js';

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!key) {
    if (isProduction) {
      console.error('FATAL: ENCRYPTION_KEY or SESSION_SECRET is required in production');
      console.error('Set ENCRYPTION_KEY to a random 32+ character string');
      process.exit(1);
    }
    logger.warn('No encryption key configured - using dev fallback (NOT SECURE)');
    return 'dev-insecure-key-for-local-development-only';
  }

  return key;
}

export function encrypt(text: string): string {
  try {
    const key = getEncryptionKey();
    const encrypted = CryptoJS.AES.encrypt(text, key).toString();
    return encrypted;
  } catch (error) {
    logger.error('Encryption failed', { error: (error as Error).message });
    throw new Error('Encryption failed');
  }
}

export function decrypt(encryptedText: string): string {
  try {
    const key = getEncryptionKey();
    const decrypted = CryptoJS.AES.decrypt(encryptedText, key);
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    logger.error('Decryption failed', { error: (error as Error).message });
    throw new Error('Decryption failed');
  }
}

export function encryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const encrypted = { ...obj };
  
  for (const field of fields) {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      encrypted[field] = encrypt(encrypted[field] as string) as any;
    }
  }

  return encrypted;
}

export function decryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const decrypted = { ...obj };
  
  for (const field of fields) {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      try {
        decrypted[field] = decrypt(decrypted[field] as string) as any;
      } catch (error) {
        logger.warn(`Failed to decrypt field ${String(field)}`, {
          error: (error as Error).message,
        });
      }
    }
  }

  return decrypted;
}
