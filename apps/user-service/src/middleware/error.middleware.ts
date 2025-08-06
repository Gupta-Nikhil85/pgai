import { Request, Response, NextFunction } from 'express';
import { ApiResponse, ValidationErrorResponse } from '@pgai/types';
import { BaseError, ValidationError, isOperationalError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const logger = createLogger('ErrorMiddleware');

// Global error handler
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If response is already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  const requestId = req.context?.requestId || req.get('x-request-id') || 'unknown';
  const userId = req.context?.userId;

  // Log the error
  logger.error('Request error', error, {
    requestId,
    userId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Handle validation errors specially
  if (error instanceof ValidationError) {
    const response: ValidationErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details || [],
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: '0.1.0',
      },
    };

    res.status(400).json(response);
    return;
  }

  // Handle Prisma errors
  if (error instanceof PrismaClientKnownRequestError) {
    const { statusCode, code, message } = handlePrismaError(error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: '0.1.0',
      },
    };

    res.status(statusCode).json(response);
    return;
  }

  // Handle operational errors (known business logic errors)
  if (isOperationalError(error)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: '0.1.0',
      },
    };

    res.status(error.statusCode).json(response);
    return;
  }

  // Handle unknown errors (log full details but don't expose to client)
  logger.error('Unhandled error', error, {
    requestId,
    userId,
    stack: error.stack,
  });

  const response: ApiResponse = {
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

  res.status(500).json(response);
};

// Handle 404 errors for undefined routes
export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = req.context?.requestId || req.get('x-request-id') || 'unknown';

  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    requestId,
  });

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
      version: '0.1.0',
    },
  };

  res.status(404).json(response);
};

// Convert Prisma errors to our standard error format
function handlePrismaError(error: PrismaClientKnownRequestError): {
  statusCode: number;
  code: string;
  message: string;
} {
  switch (error.code) {
    case 'P2002':
      // Unique constraint failed
      const target = error.meta?.target as string[] | undefined;
      const field = target ? target[0] : 'field';
      return {
        statusCode: 409,
        code: 'CONFLICT_ERROR',
        message: `${field} already exists`,
      };

    case 'P2025':
      // Record not found
      return {
        statusCode: 404,
        code: 'NOT_FOUND_ERROR',
        message: 'Record not found',
      };

    case 'P2003':
      // Foreign key constraint failed
      return {
        statusCode: 400,
        code: 'REFERENCE_ERROR',
        message: 'Referenced record does not exist',
      };

    case 'P2014':
      // Required relation violation
      return {
        statusCode: 400,
        code: 'RELATION_ERROR',
        message: 'Required relation is missing',
      };

    default:
      logger.error('Unhandled Prisma error', error, {
        code: error.code,
        meta: error.meta,
      });
      
      return {
        statusCode: 500,
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
      };
  }
}

// Async error wrapper - catches async errors and passes them to error handler
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};