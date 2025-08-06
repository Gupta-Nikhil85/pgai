import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractTokenFromHeader } from '../utils/auth';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { RequestContext, Permission } from '@pgai/types';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthMiddleware');

// Extend Express Request to include context
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

// Authentication middleware - verifies JWT token and sets context
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    const payload = verifyAccessToken(token);

    // Create request context
    const context: RequestContext = {
      userId: payload.userId,
      teamId: payload.teamId || '',
      role: payload.role,
      permissions: payload.permissions,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      requestId: req.get('x-request-id') || generateRequestId(),
      traceId: req.get('x-trace-id') || generateTraceId(),
    };

    req.context = context;

    logger.debug('User authenticated', {
      userId: context.userId,
      teamId: context.teamId,
      role: context.role,
      requestId: context.requestId,
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    next(error);
  }
};

// Authorization middleware - checks if user has required permissions
export const authorize = (...requiredPermissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.context) {
      throw new AuthenticationError('Authentication required');
    }

    const { userId, permissions } = req.context;

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every(permission =>
      permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      logger.warn('Authorization failed', {
        userId,
        requiredPermissions,
        userPermissions: permissions,
      });
      throw new AuthorizationError('Insufficient permissions');
    }

    logger.debug('User authorized', {
      userId,
      requiredPermissions,
    });

    next();
  };
};

// Resource ownership middleware - ensures user can only access their own resources
export const requireOwnership = (userIdParam: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.context) {
      throw new AuthenticationError('Authentication required');
    }

    const { userId } = req.context;
    const resourceUserId = req.params[userIdParam];

    if (userId !== resourceUserId) {
      logger.warn('Ownership check failed', {
        userId,
        resourceUserId,
        userIdParam,
      });
      throw new AuthorizationError('Access denied: resource ownership required');
    }

    logger.debug('Ownership verified', {
      userId,
      resourceUserId,
    });

    next();
  };
};

// Team membership middleware - ensures user belongs to the specified team
export const requireTeamMembership = (teamIdParam: string = 'teamId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.context) {
      throw new AuthenticationError('Authentication required');
    }

    const { teamId, userId } = req.context;
    const requiredTeamId = req.params[teamIdParam];

    if (teamId !== requiredTeamId) {
      logger.warn('Team membership check failed', {
        userId,
        userTeamId: teamId,
        requiredTeamId,
      });
      throw new AuthorizationError('Access denied: team membership required');
    }

    logger.debug('Team membership verified', {
      userId,
      teamId,
    });

    next();
  };
};

// Role-based middleware - checks if user has required role or higher
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.context) {
      throw new AuthenticationError('Authentication required');
    }

    const { role, userId } = req.context;

    if (!allowedRoles.includes(role)) {
      logger.warn('Role check failed', {
        userId,
        userRole: role,
        allowedRoles,
      });
      throw new AuthorizationError('Access denied: insufficient role');
    }

    logger.debug('Role verified', {
      userId,
      role,
      allowedRoles,
    });

    next();
  };
};

// Optional authentication middleware - sets context if token is provided but doesn't require it
export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }

    const token = extractTokenFromHeader(authHeader);
    const payload = verifyAccessToken(token);

    // Create request context
    const context: RequestContext = {
      userId: payload.userId,
      teamId: payload.teamId || '',
      role: payload.role,
      permissions: payload.permissions,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      requestId: req.get('x-request-id') || generateRequestId(),
      traceId: req.get('x-trace-id') || generateTraceId(),
    };

    req.context = context;

    logger.debug('Optional authentication successful', {
      userId: context.userId,
      teamId: context.teamId,
    });

    next();
  } catch (error) {
    // For optional auth, we continue even if token is invalid
    logger.debug('Optional authentication failed, continuing without context', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next();
  }
};

// Helper functions
const generateRequestId = (): string => {
  return require('crypto').randomBytes(16).toString('hex');
};

const generateTraceId = (): string => {
  return require('crypto').randomBytes(16).toString('hex');
};