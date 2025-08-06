import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { gatewayConfig } from '../config';
import { securityLogger } from '../utils/logger';
import { recordRateLimitHit } from '../utils/metrics';
import { rateLimitErrorHandler } from './error.middleware';

// Request ID middleware
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const existingId = req.get('x-request-id');
  const requestId = existingId || 
    `gw_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  req.requestId = requestId;
  res.set('x-request-id', requestId);
  
  // Add start time for duration tracking
  (req as any).startTime = Date.now();
  
  next();
};

// Basic rate limiting
export const createRateLimiter = (options?: {
  windowMs?: number;
  maxRequests?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}) => {
  const config = {
    windowMs: options?.windowMs || gatewayConfig.security.rateLimit.windowMs,
    max: options?.maxRequests || gatewayConfig.security.rateLimit.maxRequests,
    skipSuccessfulRequests: options?.skipSuccessfulRequests || false,
    skipFailedRequests: options?.skipFailedRequests || false,
    keyGenerator: options?.keyGenerator || ((req: Request) => {
      // Use user ID if authenticated, otherwise IP
      return req.auth?.userId || req.ip || 'anonymous';
    }),
    handler: rateLimitErrorHandler,
    onLimitReached: (req: Request) => {
      const key = options?.keyGenerator ? options.keyGenerator(req) : (req.auth?.userId || req.ip);
      
      securityLogger.warn('Rate limit exceeded', {
        key,
        ip: req.ip,
        userId: req.auth?.userId,
        method: req.method,
        path: req.path,
        requestId: req.requestId,
      });

      recordRateLimitHit('general', key || 'unknown');
    },
  };

  return rateLimit(config);
};

// Stricter rate limiting for authentication endpoints
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per window
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => `auth_${req.ip}`,
});

// API rate limiting per user
export const userRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute per user
  keyGenerator: (req: Request) => `user_${req.auth?.userId || req.ip}`,
});

// Rate limiting for public endpoints
export const publicRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000, // 1000 requests per 15 minutes per IP
  keyGenerator: (req: Request) => `public_${req.ip}`,
});

// IP-based rate limiting
export const ipRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 500, // 500 requests per 15 minutes per IP
  keyGenerator: (req: Request) => req.ip || 'unknown',
});

// Security headers middleware
export const securityHeadersMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Remove sensitive server information
  res.removeHeader('x-powered-by');
  res.removeHeader('server');

  // Security headers
  res.set({
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-xss-protection': '1; mode=block',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'geolocation=(), microphone=(), camera=()',
  });

  // Add gateway version
  res.set('x-gateway-version', gatewayConfig.api.version);

  next();
};

// Request size limiting middleware
export const requestSizeLimiter = (maxSize: string = gatewayConfig.request.maxSize) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('content-length');
    
    if (contentLength) {
      const sizeBytes = parseInt(contentLength, 10);
      const maxBytes = parseMaxSize(maxSize);
      
      if (sizeBytes > maxBytes) {
        securityLogger.warn('Request size limit exceeded', {
          requestSize: sizeBytes,
          maxSize: maxBytes,
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          ip: req.ip,
        });

        res.status(413).json({
          success: false,
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: `Request size ${sizeBytes} bytes exceeds maximum allowed size ${maxBytes} bytes`,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.requestId || 'unknown',
            version: '0.1.0',
          },
        });
        return;
      }
    }
    
    next();
  };
};

// Parse size string (e.g., "10mb", "1gb") to bytes
const parseMaxSize = (size: string): number => {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/);
  if (!match) {
    return 10 * 1024 * 1024; // Default to 10MB
  }

  const value = parseFloat(match[1]);
  const unit = match[2];
  
  return Math.floor(value * units[unit]);
};

// Request method validation
export const allowedMethodsMiddleware = (allowedMethods: string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!allowedMethods.includes(req.method.toUpperCase())) {
      securityLogger.warn('Method not allowed', {
        method: req.method,
        allowedMethods,
        requestId: req.requestId,
        path: req.path,
        ip: req.ip,
      });

      res.status(405).json({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method} is not allowed`,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.requestId || 'unknown',
          version: '0.1.0',
        },
      });
    }
    
    next();
  };
};

// Content-Type validation for POST/PUT/PATCH requests
export const contentTypeValidation = (allowedTypes: string[] = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data']) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const bodyMethods = ['POST', 'PUT', 'PATCH'];
    
    if (bodyMethods.includes(req.method.toUpperCase())) {
      const contentType = req.get('content-type');
      
      if (!contentType) {
        securityLogger.warn('Missing content-type header', {
          method: req.method,
          requestId: req.requestId,
          path: req.path,
          ip: req.ip,
        });

        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CONTENT_TYPE',
            message: 'Content-Type header is required for this method',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.requestId || 'unknown',
            version: '0.1.0',
          },
        });
      }

      const mainType = contentType!.split(';')[0].trim().toLowerCase();
      
      if (!allowedTypes.some(type => mainType === type.toLowerCase())) {
        securityLogger.warn('Invalid content-type', {
          contentType: mainType,
          allowedTypes,
          method: req.method,
          requestId: req.requestId,
          path: req.path,
          ip: req.ip,
        });

        res.status(415).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: `Content-Type ${mainType} is not supported`,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.requestId || 'unknown',
            version: '0.1.0',
          },
        });
        return;
      }
    }
    
    next();
  };
};

// IP whitelist/blacklist middleware
export const ipFilterMiddleware = (options: {
  whitelist?: string[];
  blacklist?: string[];
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || 'unknown';
    
    // Check blacklist first
    if (options.blacklist && options.blacklist.includes(clientIp)) {
      securityLogger.warn('IP address blocked (blacklist)', {
        ip: clientIp,
        requestId: req.requestId,
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'IP_BLOCKED',
          message: 'Access denied from this IP address',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.requestId || 'unknown',
          version: '0.1.0',
        },
      });
    }

    // Check whitelist if specified
    if (options.whitelist && !options.whitelist.includes(clientIp)) {
      securityLogger.warn('IP address not in whitelist', {
        ip: clientIp,
        requestId: req.requestId,
        path: req.path,
        whitelist: options.whitelist,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'IP_NOT_WHITELISTED',
          message: 'Access denied: IP address not whitelisted',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.requestId || 'unknown',
          version: '0.1.0',
        },
      });
    }
    
    next();
  };
};

// Request logging for security monitoring
export const securityLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./,                    // Directory traversal
    /<script/i,               // XSS attempts
    /union\s+select/i,        // SQL injection
    /drop\s+table/i,          // SQL injection
    /exec\s*\(/i,             // Code injection
    /eval\s*\(/i,             // Code injection
  ];

  const url = req.originalUrl;
  const userAgent = req.get('User-Agent') || '';
  const suspicious = suspiciousPatterns.some(pattern => 
    pattern.test(url) || pattern.test(userAgent)
  );

  if (suspicious) {
    securityLogger.warn('Suspicious request detected', {
      method: req.method,
      url,
      userAgent,
      ip: req.ip,
      requestId: req.requestId,
      userId: req.auth?.userId,
    });
  }

  // Log authentication attempts
  if (req.path.includes('/auth/')) {
    securityLogger.info('Authentication endpoint access', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent,
      requestId: req.requestId,
    });
  }

  next();
};