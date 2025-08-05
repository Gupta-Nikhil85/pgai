// Common types used across the platform

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface SystemHealth {
  status: 'healthy' | 'unhealthy';
  checks: Record<string, HealthCheckResult>;
  uptime: number;
  version: string;
}

// Error types
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface BusinessError {
  code: string;
  message: string;
  details?: any;
}

// Result pattern for operations that can fail
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Environment types
export type Environment = 'development' | 'staging' | 'production' | 'test';

// Log levels
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// HTTP methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Generic ID type
export type ID = string;

// Generic JSON type
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };