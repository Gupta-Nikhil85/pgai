import * as crypto from 'crypto';
import { appConfig } from '../config';

const ENCRYPTION_KEY = appConfig.encryption.key;
const ALGORITHM = appConfig.encryption.algorithm;

export interface EncryptedData {
  encryptedData: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypt sensitive data like passwords and certificates
 */
export function encrypt(text: string): EncryptedData {
  try {
    // Generate a random initialization vector
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
    cipher.setAAD(Buffer.from('connection-service', 'utf8'));
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedData: EncryptedData): string {
  try {
    const { encryptedData: encrypted, iv, authTag } = encryptedData;
    
    // Create decipher
    const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
    decipher.setAAD(Buffer.from('connection-service', 'utf8'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Hash passwords with salt
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const saltToUse = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, saltToUse, 10000, 64, 'sha512').toString('hex');
  
  return {
    hash,
    salt: saltToUse,
  };
}

/**
 * Verify password against hash
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const hashToVerify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashToVerify, 'hex'));
}

/**
 * Generate secure random string for connection IDs, tokens, etc.
 */
export function generateSecureId(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate API key for external access
 */
export function generateApiKey(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(24).toString('base64url');
  return `pgai_${timestamp}_${randomPart}`;
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) {
    return '*'.repeat(data.length);
  }
  
  const start = data.substring(0, visibleChars);
  const end = data.substring(data.length - visibleChars);
  const masked = '*'.repeat(data.length - (visibleChars * 2));
  
  return `${start}${masked}${end}`;
}

/**
 * Create HMAC signature for webhook verification
 */
export function createHmacSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifyHmacSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = createHmacSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

/**
 * Encrypt connection string for secure storage
 */
export function encryptConnectionString(connectionString: string): string {
  const encrypted = encrypt(connectionString);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt connection string
 */
export function decryptConnectionString(encryptedConnectionString: string): string {
  const encryptedData = JSON.parse(encryptedConnectionString) as EncryptedData;
  return decrypt(encryptedData);
}

/**
 * Securely wipe sensitive data from memory
 */
export function secureWipe(buffer: Buffer): void {
  if (buffer && buffer.length > 0) {
    crypto.randomFillSync(buffer);
    buffer.fill(0);
  }
}

/**
 * Generate connection-specific encryption key
 */
export function generateConnectionKey(connectionId: string, userId: string): string {
  const baseKey = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const connectionData = `${connectionId}:${userId}`;
  const connectionHash = crypto.createHash('sha256').update(connectionData).digest();
  
  const derivedKey = crypto.createHash('sha256')
    .update(Buffer.concat([baseKey, connectionHash]))
    .digest('hex');
    
  return derivedKey;
}