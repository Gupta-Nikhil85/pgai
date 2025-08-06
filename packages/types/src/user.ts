import { BaseEntity } from './common';

// User types based on our database schema from engineering.md
export interface User extends BaseEntity {
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  passwordHash?: string; // Optional for security - not returned in responses
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'passwordHash'>;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

// JWT payload structure
export interface JWTPayload {
  userId: string;
  email: string;
  teamId?: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  createdAt: Date;
  teams: {
    id: string;
    name: string;
    role: string;
    permissions: string[];
  }[];
}