import { ApiResponse } from '@pgai/types';

// Base error class
export abstract class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
    details?: any,
    stack = ''
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Specific error types
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: any) {
    super(message, 401, 'AUTHENTICATION_ERROR', true, details);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: any) {
    super(message, 403, 'AUTHORIZATION_ERROR', true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, 'NOT_FOUND_ERROR', true, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT_ERROR', true, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(message, 429, 'RATE_LIMIT_ERROR', true, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', details?: any) {
    super(message, 503, 'SERVICE_UNAVAILABLE_ERROR', true, details);
  }
}

export class GatewayTimeoutError extends AppError {
  constructor(message: string = 'Gateway timeout', details?: any) {
    super(message, 504, 'GATEWAY_TIMEOUT_ERROR', true, details);
  }
}

export class ServiceError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 502, 'SERVICE_ERROR', true, details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: any, isOperational = false) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', isOperational, details);
  }
}

// Error factory functions
export const createValidationError = (message: string, details?: any): ValidationError => {
  return new ValidationError(message, details);
};

export const createAuthenticationError = (message?: string, details?: any): AuthenticationError => {
  return new AuthenticationError(message, details);
};

export const createAuthorizationError = (message?: string, details?: any): AuthorizationError => {
  return new AuthorizationError(message, details);
};

export const createNotFoundError = (message?: string, details?: any): NotFoundError => {
  return new NotFoundError(message, details);
};

export const createServiceError = (message: string, details?: any): ServiceError => {
  return new ServiceError(message, details);
};

export const createGatewayTimeoutError = (message?: string, details?: any): GatewayTimeoutError => {
  return new GatewayTimeoutError(message, details);
};

// Convert error to API response format
export const errorToApiResponse = (error: Error, requestId: string): ApiResponse => {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: '0.1.0',
      },
    };
  }

  // Handle unknown errors
  return {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
      version: '0.1.0',
    },
  };
};

// Check if error is operational
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};