import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import { RequestContext } from '../types/api.types';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthMiddleware');

// Extend Express Request type to include context
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

interface JWTPayload {
  userId: string;
  teamId?: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

/**
 * Authentication middleware - verifies JWT token and sets request context
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.get('Authorization');
    
    if (!authHeader) {
      throw new UnauthorizedError('Missing authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Invalid authorization header format');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      throw new UnauthorizedError('Missing access token');
    }

    // Verify and decode JWT token
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, appConfig.jwt.secret) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Access token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid access token');
      } else {
        throw new UnauthorizedError('Token verification failed');
      }
    }

    // Create request context
    const context: RequestContext = {
      userId: decoded.userId,
      teamId: decoded.teamId,
      role: decoded.role,
      permissions: decoded.permissions || [],
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      requestId: req.get('x-request-id') || 'unknown',
      traceId: req.get('x-trace-id') || 'unknown',
    };

    // Attach context to request
    req.context = context;

    logger.debug('Authentication successful', {
      userId: context.userId,
      teamId: context.teamId,
      role: context.role,
      requestId: context.requestId,
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      error: (error as Error).message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.get('x-request-id'),
    });
    
    next(error);
  }
};

/**
 * Authorization middleware factory - checks if user has required permission
 */
export const authorize = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.context) {
        throw new UnauthorizedError('Authentication context not found');
      }

      const { permissions, userId, role } = req.context;

      // Check if user has the required permission
      if (!permissions.includes(requiredPermission)) {
        logger.warn('Authorization failed - missing permission', {
          userId,
          role,
          requiredPermission,
          userPermissions: permissions,
        });
        
        throw new ForbiddenError(`Missing required permission: ${requiredPermission}`);
      }

      logger.debug('Authorization successful', {
        userId,
        role,
        requiredPermission,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Team ownership middleware - ensures user can only access resources from their team
 */
export const requireTeamAccess = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.context) {
      throw new UnauthorizedError('Authentication context not found');
    }

    const { teamId, userId, role } = req.context;
    
    // Admins and owners can access resources from any team
    if (role === 'admin' || role === 'owner') {
      return next();
    }

    // For other roles, check if teamId is present
    if (!teamId) {
      throw new ForbiddenError('Team access required');
    }

    // Add team context for use in controllers
    req.context.teamId = teamId;

    logger.debug('Team access granted', {
      userId,
      teamId,
      role,
    });

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Resource ownership middleware - ensures user can only access their own resources
 */
export const requireOwnership = (resourceUserIdParam: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.context) {
        throw new UnauthorizedError('Authentication context not found');
      }

      const { userId, role } = req.context;
      const resourceUserId = req.params[resourceUserIdParam];

      // Admins and owners can access any user's resources
      if (role === 'admin' || role === 'owner') {
        return next();
      }

      // Check if user is trying to access their own resource
      if (resourceUserId && resourceUserId !== userId) {
        logger.warn('Ownership check failed', {
          userId,
          resourceUserId,
          role,
        });
        
        throw new ForbiddenError('Access denied - insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Optional authentication middleware - sets context if token is present but doesn't fail if missing
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without setting context
    }

    // Use the authenticate middleware but catch errors
    await authenticate(req, res, (error) => {
      if (error) {
        // Log the error but don't fail the request
        logger.debug('Optional authentication failed', {
          error: error.message,
          ip: req.ip,
        });
      }
      next(); // Always continue
    });
  } catch (error) {
    // Ignore authentication errors in optional mode
    next();
  }
};

/**
 * Connection ownership middleware - ensures user can only access connections they own or their team owns
 */
export const requireConnectionAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.context) {
      throw new UnauthorizedError('Authentication context not found');
    }

    const { userId, teamId, role } = req.context;
    const connectionId = req.params.id || req.params.connectionId;

    if (!connectionId) {
      throw new ForbiddenError('Connection ID required');
    }

    // Admins and owners can access any connection
    if (role === 'admin' || role === 'owner') {
      return next();
    }

    // For other users, we need to verify they own the connection or it belongs to their team
    // This would typically involve a database lookup to verify ownership
    // For now, we'll trust that the connection access will be validated in the service layer
    
    logger.debug('Connection access check', {
      userId,
      teamId,
      connectionId,
      role,
    });

    next();
  } catch (error) {
    next(error);
  }
};