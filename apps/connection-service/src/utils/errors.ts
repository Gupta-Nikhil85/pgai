/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: any,
    isOperational = true
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Ensure the stack trace points to where the error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - Client error
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', details?: any) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', details?: any) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

/**
 * 403 Forbidden - Access denied
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', details?: any) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

/**
 * 409 Conflict - Resource conflict
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * 422 Unprocessable Entity - Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details, false);
  }
}

/**
 * 502 Bad Gateway - External service error
 */
export class BadGatewayError extends AppError {
  constructor(message: string = 'Bad gateway', details?: any) {
    super(message, 502, 'BAD_GATEWAY', details);
  }
}

/**
 * 503 Service Unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable', details?: any) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

/**
 * 504 Gateway Timeout - External service timeout
 */
export class GatewayTimeoutError extends AppError {
  constructor(message: string = 'Gateway timeout', details?: any) {
    super(message, 504, 'GATEWAY_TIMEOUT', details);
  }
}

// Connection-specific errors

/**
 * Connection-related errors
 */
export class ConnectionError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'CONNECTION_ERROR', details);
  }
}

/**
 * Connection test failed
 */
export class ConnectionTestError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'CONNECTION_TEST_FAILED', details);
  }
}

/**
 * Connection pool error
 */
export class PoolError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'POOL_ERROR', details);
  }
}

/**
 * Database operation error
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * Encryption/decryption error
 */
export class EncryptionError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'ENCRYPTION_ERROR', details);
  }
}

/**
 * SSH tunnel error
 */
export class SSHTunnelError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'SSH_TUNNEL_ERROR', details);
  }
}

/**
 * Connection limit exceeded
 */
export class ConnectionLimitError extends AppError {
  constructor(message: string = 'Connection limit exceeded', details?: any) {
    super(message, 429, 'CONNECTION_LIMIT_EXCEEDED', details);
  }
}

/**
 * Invalid connection configuration
 */
export class InvalidConnectionError extends AppError {
  constructor(message: string = 'Invalid connection configuration', details?: any) {
    super(message, 400, 'INVALID_CONNECTION_CONFIG', details);
  }
}

/**
 * Connection already exists
 */
export class ConnectionExistsError extends ConflictError {
  constructor(message: string = 'Connection already exists', details?: any) {
    super(message, details);
    Object.defineProperty(this, 'code', {
      value: 'CONNECTION_EXISTS',
      writable: false,
      enumerable: true,
      configurable: false
    });
  }
}

/**
 * Connection not found
 */
export class ConnectionNotFoundError extends NotFoundError {
  constructor(message: string = 'Connection not found', details?: any) {
    super(message, details);
    Object.defineProperty(this, 'code', {
      value: 'CONNECTION_NOT_FOUND',
      writable: false,
      enumerable: true,
      configurable: false
    });
  }
}

/**
 * Check if error is operational (safe to expose to client)
 */
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};

/**
 * Create error response object
 */
export const createErrorResponse = (error: Error, requestId: string = 'unknown') => {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: '0.1.0',
      },
    };
  }

  // For non-AppError instances, return generic error
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