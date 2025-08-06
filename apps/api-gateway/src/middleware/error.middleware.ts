import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@pgai/types';
import { AppError, errorToApiResponse, isOperationalError } from '../utils/errors';
import { logger } from '../utils/logger';

// Global error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.requestId || 'unknown';

  // Log the error
  if (isOperationalError(error)) {
    logger.warn('Operational error occurred', {
      error: error.message,
      stack: error.stack,
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  } else {
    logger.error('Unexpected error occurred', {
      error: error.message,
      stack: error.stack,
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.auth?.userId,
    });
  }

  // Convert error to API response
  const apiResponse = errorToApiResponse(error, requestId);
  
  // Determine status code
  let statusCode = 500;
  if (error instanceof AppError) {
    statusCode = error.statusCode;
  }

  // Send error response
  res.status(statusCode).json(apiResponse);
};

// 404 handler for undefined routes
export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = req.requestId || 'unknown';
  
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  const apiResponse: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
      version: '0.1.0',
    },
  };

  res.status(404).json(apiResponse);
};

// Async error wrapper for route handlers
export const asyncHandler = <T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Timeout middleware
export const timeoutHandler = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      const error = new class extends AppError {
      constructor() {
        super('Request timeout', 408, 'REQUEST_TIMEOUT', true, { timeoutMs });
      }
    }();
      
      logger.warn('Request timeout', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        timeout: timeoutMs,
      });

      const apiResponse = errorToApiResponse(error, req.requestId || 'unknown');
      res.status(408).json(apiResponse);
    }, timeoutMs);

    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

// Request validation error handler
export const validationErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error.status === 400 && error.errors) {
    // OpenAPI validator error
    const validationError = new class extends AppError {
      constructor() {
        super(
          'Request validation failed',
          400,
          'VALIDATION_ERROR',
          true,
          {
            details: error.errors.map((err: any) => ({
              field: err.path,
              message: err.message,
              value: err.errorCode,
            })),
          }
        );
      }
    }();

    const apiResponse = errorToApiResponse(validationError, req.requestId || 'unknown');
    res.status(400).json(apiResponse);
    return;
  }

  next(error);
};

// Rate limit error handler
export const rateLimitErrorHandler = (
  req: Request,
  res: Response
): void => {
  const requestId = req.requestId || 'unknown';
  
  logger.warn('Rate limit exceeded', {
    requestId,
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
  });

  const apiResponse: ApiResponse = {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later',
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
      version: '0.1.0',
    },
  };

  res.status(429).json(apiResponse);
};

// CORS error handler
export const corsErrorHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const origin = req.get('Origin');
  
  logger.warn('CORS error', {
    origin,
    method: req.method,
    url: req.originalUrl,
    requestId: req.requestId,
  });

  const apiResponse: ApiResponse = {
    success: false,
    error: {
      code: 'CORS_ERROR',
      message: 'CORS policy violation',
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.requestId || 'unknown',
      version: '0.1.0',
    },
  };

  res.status(403).json(apiResponse);
};