import jwt from 'jsonwebtoken';
import { JWTPayload } from '@pgai/types';
import { gatewayConfig } from '../config';
import { AuthenticationError, AuthorizationError } from './errors';
import { authLogger } from './logger';

// JWT token verification
export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    const payload = jwt.verify(token, gatewayConfig.jwt.secret) as JWTPayload;
    
    // Validate payload structure
    if (!payload.userId || !payload.email || !payload.role) {
      throw new AuthenticationError('Invalid token payload');
    }

    authLogger.debug('Token verified successfully', {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    });

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired');
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }

    if (error instanceof AuthenticationError) {
      throw error;
    }

    authLogger.error('Token verification failed', error);
    throw new AuthenticationError('Token verification failed');
  }
};

// Extract token from Authorization header
export const extractTokenFromHeader = (authHeader: string | undefined): string => {
  if (!authHeader) {
    throw new AuthenticationError('Missing Authorization header');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthenticationError('Invalid Authorization header format. Expected: Bearer <token>');
  }

  return parts[1];
};

// Role-based authorization checker
export const hasPermission = (userRole: string, requiredRole: string): boolean => {
  const roleHierarchy: Record<string, number> = {
    viewer: 1,
    user: 2,
    admin: 3,
    super_admin: 4,
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
};

// Permission validation
export const requirePermission = (userRole: string, requiredRole: string): void => {
  if (!hasPermission(userRole, requiredRole)) {
    throw new AuthorizationError(
      `Insufficient permissions. Required: ${requiredRole}, Current: ${userRole}`
    );
  }
};

// Team membership validation
export const requireTeamMembership = (
  userTeams: Array<{ teamId: string; role: string }>,
  requiredTeamId: string,
  minimumRole?: string
): void => {
  const membership = userTeams.find(team => team.teamId === requiredTeamId);
  
  if (!membership) {
    throw new AuthorizationError('Access denied: Not a member of the required team');
  }

  if (minimumRole && !hasPermission(membership.role, minimumRole)) {
    throw new AuthorizationError(
      `Insufficient team permissions. Required: ${minimumRole}, Current: ${membership.role}`
    );
  }
};

// Resource ownership validation
export const requireResourceOwnership = (
  resourceUserId: string,
  currentUserId: string,
  userRole: string
): void => {
  // Admins can access any resource
  if (hasPermission(userRole, 'admin')) {
    return;
  }

  // Users can only access their own resources
  if (resourceUserId !== currentUserId) {
    throw new AuthorizationError('Access denied: You can only access your own resources');
  }
};

// Generate API key (for service-to-service communication)
export const generateApiKey = (): string => {
  const timestamp = Date.now().toString();
  const randomBytes = Math.random().toString(36).substring(2);
  return `gw_${timestamp}_${randomBytes}`;
};

// Validate API key format
export const isValidApiKeyFormat = (apiKey: string): boolean => {
  return /^gw_\d+_[a-z0-9]+$/.test(apiKey);
};

// Create authentication context for downstream services
export interface AuthContext {
  userId: string;
  email: string;
  role: string;
  teamId?: string;
  permissions: string[];
  isAuthenticated: boolean;
}

export const createAuthContext = (payload: JWTPayload): AuthContext => {
  return {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    teamId: payload.teamId,
    permissions: payload.permissions || [],
    isAuthenticated: true,
  };
};

// Create headers for downstream service requests
export const createDownstreamHeaders = (authContext: AuthContext, requestId: string): Record<string, string> => {
  return {
    'x-user-id': authContext.userId,
    'x-user-email': authContext.email,
    'x-user-role': authContext.role,
    'x-request-id': requestId,
    'x-authenticated': authContext.isAuthenticated.toString(),
    ...(authContext.teamId && { 'x-team-id': authContext.teamId }),
    ...(authContext.permissions.length > 0 && {
      'x-user-permissions': authContext.permissions.join(','),
    }),
  };
};