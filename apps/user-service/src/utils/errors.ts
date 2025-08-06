// Custom error classes following our engineering practices

export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends BaseError {
  public readonly field?: string;
  public readonly details?: any;

  constructor(message: string, field?: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.details = details;
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR');
  }
}

export class ConflictError extends BaseError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends BaseError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class InternalServerError extends BaseError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_SERVER_ERROR', false);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string = 'Database operation failed', originalError?: Error) {
    super(message, 500, 'DATABASE_ERROR', false);
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

// Error factory for common patterns
export const createValidationError = (field: string, message: string, value?: any): ValidationError => {
  return new ValidationError(message, field, { value });
};

export const createNotFoundError = (resource: string, id?: string): NotFoundError => {
  const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
  return new NotFoundError(message);
};

// Type guard to check if error is operational
export const isOperationalError = (error: Error): error is BaseError => {
  return error instanceof BaseError && error.isOperational;
};