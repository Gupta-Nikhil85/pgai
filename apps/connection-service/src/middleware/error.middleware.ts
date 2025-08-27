import { Request, Response, NextFunction } from 'express';
import { ApiResponse, ValidationFieldError } from '../types/api.types';
import { 
  AppError, 
  ValidationError, 
  NotFoundError, 
  UnauthorizedError, 
  ForbiddenError,
  ConflictError,
  RateLimitError 
} from '../utils/errors';
import { createLogger } from '../utils/logger';
import { appConfig } from '../config';

const logger = createLogger('ErrorMiddleware');

/**
 * Async error handler wrapper
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global error handler middleware
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let errorResponse: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.context?.requestId || req.get('x-request-id') || 'unknown',
      version: '0.1.0',
    },
  };

  // Handle different types of errors
  if (error instanceof ValidationError) {
    statusCode = 400;
    errorResponse.error = {
      code: 'VALIDATION_ERROR',
      message: error.message,
      details: error.details || [],
    };
  } else if (error instanceof NotFoundError) {
    statusCode = 404;
    errorResponse.error = {
      code: 'NOT_FOUND',
      message: error.message,
    };
  } else if (error instanceof UnauthorizedError) {
    statusCode = 401;
    errorResponse.error = {
      code: 'UNAUTHORIZED',
      message: error.message,
    };
  } else if (error instanceof ForbiddenError) {
    statusCode = 403;
    errorResponse.error = {
      code: 'FORBIDDEN',
      message: error.message,
    };
  } else if (error instanceof ConflictError) {
    statusCode = 409;
    errorResponse.error = {
      code: 'CONFLICT',
      message: error.message,
    };
  } else if (error instanceof RateLimitError) {
    statusCode = 429;
    errorResponse.error = {
      code: 'RATE_LIMIT_EXCEEDED',
      message: error.message,
    };
  } else if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorResponse.error = {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  } else if (error.name === 'ValidationError') {
    // Handle Joi validation errors
    statusCode = 400;
    const validationErrors: ValidationFieldError[] = [];
    
    if ((error as any).details) {
      (error as any).details.forEach((detail: any) => {
        validationErrors.push({
          field: detail.path?.join('.') || 'unknown',
          message: detail.message,
          code: detail.type,
          value: detail.context?.value,
        });
      });
    }

    errorResponse.error = {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: validationErrors,
    };
  } else if (error.name === 'SyntaxError') {
    // Handle JSON parsing errors
    statusCode = 400;
    errorResponse.error = {
      code: 'INVALID_JSON',
      message: 'Invalid JSON in request body',
    };
  } else if (error.name === 'MulterError') {
    // Handle file upload errors
    statusCode = 400;
    errorResponse.error = {
      code: 'FILE_UPLOAD_ERROR',
      message: error.message,
    };
  }

  // Log the error
  const logData = {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.get('User-Agent'),
        'x-request-id': req.get('x-request-id'),
        'x-trace-id': req.get('x-trace-id'),
      },
      ip: req.ip,
      userId: req.context?.userId,
      teamId: req.context?.teamId,
    },
    response: {
      statusCode,
      errorCode: errorResponse.error.code,
    },
  };

  if (statusCode >= 500) {
    logger.error('Internal server error', logData);
  } else if (statusCode >= 400) {
    logger.warn('Client error', logData);
  }

  // Don't expose stack traces in production
  if (appConfig.isProduction && statusCode >= 500) {
    delete errorResponse.error.details;
  } else if (!appConfig.isProduction && statusCode >= 500) {
    errorResponse.error.details = {
      stack: error.stack,
      ...errorResponse.error.details,
    };
  }

  // Set security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  });

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.context?.requestId || req.get('x-request-id') || 'unknown',
      version: '0.1.0',
    },
  };

  logger.warn('Route not found', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.status(404).json(errorResponse);
};

/**
 * Handle uncaught errors in async middleware
 */
export const handleAsyncError = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = fn(req, res, next);
    
    if (result && typeof result.catch === 'function') {
      result.catch(next);
    }
    
    return result;
  };
};

/**
 * Timeout middleware
 */
export const timeoutMiddleware = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Set timeout for the request
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const errorResponse: ApiResponse = {
          success: false,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: 'Request timeout',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.context?.requestId || req.get('x-request-id') || 'unknown',
            version: '0.1.0',
          },
        };

        logger.warn('Request timeout', {
          method: req.method,
          path: req.path,
          ip: req.ip,
          timeoutMs,
        });

        res.status(408).json(errorResponse);
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    // Clear timeout when connection is closed
    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};