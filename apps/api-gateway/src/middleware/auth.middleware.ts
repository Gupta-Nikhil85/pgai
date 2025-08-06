import { Request, Response, NextFunction } from 'express';
import { 
  verifyAccessToken, 
  extractTokenFromHeader, 
  createAuthContext, 
  hasPermission,
  requireTeamMembership,
  AuthContext 
} from '../utils/auth';
import { 
  AuthenticationError, 
  AuthorizationError,
  errorToApiResponse 
} from '../utils/errors';
import { authLogger } from '../utils/logger';
import { recordAuthenticationAttempt, recordAuthorizationCheck } from '../utils/metrics';

// Extend Express Request to include auth context
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}

// Authentication middleware
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const requestId = req.requestId || 'unknown';
    
    // Extract and verify token
    const authHeader = req.get('Authorization');
    const token = extractTokenFromHeader(authHeader);
    const payload = verifyAccessToken(token);
    
    // Create auth context
    req.auth = createAuthContext(payload);
    
    authLogger.debug('Authentication successful', {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      requestId,
    });

    recordAuthenticationAttempt('success', req.method);
    next();
  } catch (error) {
    authLogger.warn('Authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    recordAuthenticationAttempt('failure', req.method);
    
    if (error instanceof AuthenticationError) {
      const apiResponse = errorToApiResponse(error, req.requestId || 'unknown');
      res.status(error.statusCode).json(apiResponse);
      return;
    }

    const authError = new AuthenticationError();
    const apiResponse = errorToApiResponse(authError, req.requestId || 'unknown');
    res.status(authError.statusCode).json(apiResponse);
  }
};

// Optional authentication middleware (doesn't fail if no token provided)
export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.get('Authorization');
    
    if (!authHeader) {
      // No authentication provided, continue without auth context
      return next();
    }

    const token = extractTokenFromHeader(authHeader);
    const payload = verifyAccessToken(token);
    req.auth = createAuthContext(payload);
    
    recordAuthenticationAttempt('success', req.method);
    next();
  } catch (error) {
    authLogger.warn('Optional authentication failed, continuing without auth', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.requestId,
    });

    recordAuthenticationAttempt('failure', req.method);
    // Continue without authentication for optional routes
    next();
  }
};

// Role-based authorization middleware
export const authorize = (requiredRole: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.auth) {
        throw new AuthenticationError('Authentication required');
      }

      if (!hasPermission(req.auth.role, requiredRole)) {
        throw new AuthorizationError(
          `Insufficient permissions. Required: ${requiredRole}, Current: ${req.auth.role}`
        );
      }

      authLogger.debug('Authorization successful', {
        userId: req.auth.userId,
        userRole: req.auth.role,
        requiredRole,
        requestId: req.requestId,
      });

      recordAuthorizationCheck('success', requiredRole);
      next();
    } catch (error) {
      authLogger.warn('Authorization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.auth?.userId,
        userRole: req.auth?.role,
        requiredRole,
        requestId: req.requestId,
      });

      recordAuthorizationCheck('failure', requiredRole);

      if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
        const apiResponse = errorToApiResponse(error, req.requestId || 'unknown');
        res.status(error.statusCode).json(apiResponse);
      return;
      }

      const authError = new AuthorizationError();
      const apiResponse = errorToApiResponse(authError, req.requestId || 'unknown');
      res.status(authError.statusCode).json(apiResponse);
    }
  };
};

// Team membership authorization middleware
export const requireTeamAccess = (teamIdParam: string = 'teamId', minimumRole?: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.auth) {
        throw new AuthenticationError('Authentication required');
      }

      const requiredTeamId = req.params[teamIdParam];
      if (!requiredTeamId) {
        throw new AuthorizationError(`Missing team ID parameter: ${teamIdParam}`);
      }

      // Admins can access any team
      if (hasPermission(req.auth.role, 'admin')) {
        authLogger.debug('Team access granted (admin privileges)', {
          userId: req.auth.userId,
          userRole: req.auth.role,
          teamId: requiredTeamId,
          requestId: req.requestId,
        });
        return next();
      }

      // Check team membership (this would typically come from the JWT payload)
      // For now, we'll assume team membership is included in the auth context
      const userTeams = req.auth.permissions || []; // This should be team memberships
      
      if (!userTeams.length && req.auth.teamId !== requiredTeamId) {
        throw new AuthorizationError('Access denied: Not a member of the required team');
      }

      authLogger.debug('Team access granted', {
        userId: req.auth.userId,
        teamId: requiredTeamId,
        requestId: req.requestId,
      });

      recordAuthorizationCheck('success', `team_${minimumRole || 'member'}`);
      next();
    } catch (error) {
      authLogger.warn('Team authorization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.auth?.userId,
        teamId: req.params[teamIdParam],
        requestId: req.requestId,
      });

      recordAuthorizationCheck('failure', `team_${minimumRole || 'member'}`);

      if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
        const apiResponse = errorToApiResponse(error, req.requestId || 'unknown');
        res.status(error.statusCode).json(apiResponse);
      return;
      }

      const authError = new AuthorizationError();
      const apiResponse = errorToApiResponse(authError, req.requestId || 'unknown');
      res.status(authError.statusCode).json(apiResponse);
    }
  };
};

// Resource ownership middleware (for user-specific resources)
export const requireOwnership = (userIdParam: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.auth) {
        throw new AuthenticationError('Authentication required');
      }

      const resourceUserId = req.params[userIdParam];
      if (!resourceUserId) {
        throw new AuthorizationError(`Missing user ID parameter: ${userIdParam}`);
      }

      // Admins can access any user's resources
      if (hasPermission(req.auth.role, 'admin')) {
        authLogger.debug('Resource access granted (admin privileges)', {
          userId: req.auth.userId,
          resourceUserId,
          requestId: req.requestId,
        });
        return next();
      }

      // Users can only access their own resources
      if (req.auth.userId !== resourceUserId) {
        throw new AuthorizationError('Access denied: You can only access your own resources');
      }

      authLogger.debug('Resource ownership verified', {
        userId: req.auth.userId,
        resourceUserId,
        requestId: req.requestId,
      });

      recordAuthorizationCheck('success', 'ownership');
      next();
    } catch (error) {
      authLogger.warn('Ownership authorization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.auth?.userId,
        resourceUserId: req.params[userIdParam],
        requestId: req.requestId,
      });

      recordAuthorizationCheck('failure', 'ownership');

      if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
        const apiResponse = errorToApiResponse(error, req.requestId || 'unknown');
        res.status(error.statusCode).json(apiResponse);
      return;
      }

      const authError = new AuthorizationError();
      const apiResponse = errorToApiResponse(authError, req.requestId || 'unknown');
      res.status(authError.statusCode).json(apiResponse);
    }
  };
};

// API key authentication middleware (for service-to-service communication)
export const authenticateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const apiKey = req.get('x-api-key');
    
    if (!apiKey) {
      throw new AuthenticationError('Missing API key');
    }

    // This would typically validate against a database of API keys
    // For now, we'll implement a simple validation
    if (!apiKey.startsWith('gw_') || apiKey.length < 20) {
      throw new AuthenticationError('Invalid API key format');
    }

    // Create a service auth context
    req.auth = {
      userId: 'service',
      email: 'service@system',
      role: 'service',
      permissions: ['service'],
      isAuthenticated: true,
    };

    authLogger.debug('API key authentication successful', {
      requestId: req.requestId,
    });

    recordAuthenticationAttempt('success', 'api_key');
    next();
  } catch (error) {
    authLogger.warn('API key authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.requestId,
      ip: req.ip,
    });

    recordAuthenticationAttempt('failure', 'api_key');

    if (error instanceof AuthenticationError) {
      const apiResponse = errorToApiResponse(error, req.requestId || 'unknown');
      res.status(error.statusCode).json(apiResponse);
      return;
    }

    const authError = new AuthenticationError();
    const apiResponse = errorToApiResponse(authError, req.requestId || 'unknown');
    res.status(authError.statusCode).json(apiResponse);
  }
};