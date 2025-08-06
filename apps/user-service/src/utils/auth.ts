import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import { JWTPayload } from '@pgai/types';
import { AuthenticationError } from './errors';

// Password hashing utilities
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, appConfig.security.bcryptRounds);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// JWT token utilities
export const generateAccessToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(
    payload,
    appConfig.jwt.secret,
    { 
      expiresIn: appConfig.jwt.expiresIn,
      issuer: 'pgai-user-service',
      audience: 'pgai-platform'
    }
  );
};

export const generateRefreshToken = (userId: string, tokenVersion: number): string => {
  return jwt.sign(
    { userId, tokenVersion },
    appConfig.jwt.refreshSecret,
    { 
      expiresIn: appConfig.jwt.refreshExpiresIn,
      issuer: 'pgai-user-service',
      audience: 'pgai-platform'
    }
  );
};

export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, appConfig.jwt.secret, {
      issuer: 'pgai-user-service',
      audience: 'pgai-platform'
    }) as JWTPayload;
  } catch (error) {
    throw new AuthenticationError('Invalid or expired token');
  }
};

export const verifyRefreshToken = (token: string): { userId: string; tokenVersion: number } => {
  try {
    return jwt.verify(token, appConfig.jwt.refreshSecret, {
      issuer: 'pgai-user-service',
      audience: 'pgai-platform'
    }) as { userId: string; tokenVersion: number };
  } catch (error) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }
};

export const extractTokenFromHeader = (authHeader: string | undefined): string => {
  if (!authHeader) {
    throw new AuthenticationError('Authorization header required');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthenticationError('Invalid authorization header format');
  }

  return parts[1];
};

// Password validation
export const validatePasswordStrength = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Generate secure random token for password reset, email verification, etc.
export const generateSecureToken = (): string => {
  return require('crypto').randomBytes(32).toString('hex');
};