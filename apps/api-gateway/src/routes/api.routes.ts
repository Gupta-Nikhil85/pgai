import express, { Router } from 'express';
import { authenticate, authorize, requireOwnership, optionalAuthenticate } from '../middleware/auth.middleware';
import { userRateLimiter, authRateLimiter } from '../middleware/security.middleware';
import { proxyService } from '../services/proxy.service';

const router: express.Router = Router();

// ==========================================
// Authentication Routes (User Service)
// ==========================================

/**
 * Authentication endpoints - proxied to user-service
 * These endpoints handle user registration, login, token refresh, etc.
 */
router.use('/auth', 
  authRateLimiter,
  proxyService.createProxy('user-service', {
    // No pathRewrite needed - Express router already handles the path stripping
  })
);

// ==========================================
// User Management Routes (User Service)
// ==========================================

/**
 * User profile endpoints - proxied to user-service
 * Requires authentication for all endpoints
 */
router.use('/users',
  authenticate,
  userRateLimiter,
  proxyService.createProxy('user-service', {
    '^/users': '/users'  // Pass through user routes directly
  })
);

// ==========================================
// Connection Management Routes
// ==========================================

/**
 * Database connection endpoints - proxied to connection-service
 * Requires authentication and proper permissions
 */
if (proxyService.getService('connection-service')) {
  router.use('/connections',
    authenticate,
    userRateLimiter,
    proxyService.createProxy('connection-service', {
      '^/connections': '/connections'
    })
  );
}

// ==========================================
// Schema Management Routes
// ==========================================

/**
 * Database schema endpoints - proxied to schema-service
 * Requires authentication and proper permissions
 */
if (proxyService.getService('schema-service')) {
  router.use('/schemas',
    authenticate,
    userRateLimiter,
    proxyService.createProxy('schema-service', {
      '^/schemas': '/schemas'
    })
  );
}

// ==========================================
// View Management Routes
// ==========================================

/**
 * Database view endpoints - proxied to view-service
 * Requires authentication and proper permissions
 */
if (proxyService.getService('view-service')) {
  router.use('/views',
    authenticate,
    userRateLimiter,
    proxyService.createProxy('view-service', {
      '^/views': '/views'
    })
  );
}

// ==========================================
// Version Management Routes
// ==========================================

/**
 * Schema versioning endpoints - proxied to versioning-service
 * Requires authentication and proper permissions
 */
if (proxyService.getService('versioning-service')) {
  router.use('/versions',
    authenticate,
    userRateLimiter,
    proxyService.createProxy('versioning-service', {
      '^/versions': '/versions'
    })
  );
}

// ==========================================
// Documentation Routes
// ==========================================

/**
 * API documentation endpoints - proxied to documentation-service
 * Some endpoints may be public, others require authentication
 */
if (proxyService.getService('documentation-service')) {
  // Public documentation endpoints
  router.use('/docs/public',
    proxyService.createProxy('documentation-service', {
      '^/docs/public': '/public'
    })
  );

  // Authenticated documentation endpoints
  router.use('/docs',
    authenticate,
    userRateLimiter,
    proxyService.createProxy('documentation-service', {
      '^/docs': '/docs'
    })
  );
}

// ==========================================
// Admin Routes (Restricted Access)
// ==========================================

/**
 * Admin endpoints across all services
 * Requires admin role
 */
router.use('/admin/users',
  authenticate,
  authorize('admin'),
  proxyService.createProxy('user-service', {
    '^/admin/users': '/admin/users'
  })
);

if (proxyService.getService('connection-service')) {
  router.use('/admin/connections',
    authenticate,
    authorize('admin'),
    proxyService.createProxy('connection-service', {
      '^/admin/connections': '/admin/connections'
    })
  );
}

if (proxyService.getService('schema-service')) {
  router.use('/admin/schemas',
    authenticate,
    authorize('admin'),
    proxyService.createProxy('schema-service', {
      '^/admin/schemas': '/admin/schemas'
    })
  );
}

// ==========================================
// Public API Routes (Optional Auth)
// ==========================================

/**
 * Public API endpoints that may benefit from optional authentication
 * These endpoints work without authentication but provide enhanced features when authenticated
 */

// Public schema browsing (with optional auth for enhanced features)
if (proxyService.getService('schema-service')) {
  router.use('/public/schemas',
    optionalAuthenticate,
    proxyService.createProxy('schema-service', {
      '^/public/schemas': '/public/schemas'
    })
  );
}

// Public documentation
if (proxyService.getService('documentation-service')) {
  router.use('/public/docs',
    proxyService.createProxy('documentation-service', {
      '^/public/docs': '/public/docs'
    })
  );
}

// ==========================================
// Team-Specific Routes
// ==========================================

/**
 * Team-scoped resource endpoints
 * These routes include team ID in the path and enforce team membership
 */

// Team connections
if (proxyService.getService('connection-service')) {
  router.use('/teams/:teamId/connections',
    authenticate,
    // requireTeamAccess('teamId'), // Uncomment when team validation is implemented
    proxyService.createProxy('connection-service', {
      '^/teams/([^/]+)/connections': '/teams/$1/connections'
    })
  );
}

// Team schemas
if (proxyService.getService('schema-service')) {
  router.use('/teams/:teamId/schemas',
    authenticate,
    // requireTeamAccess('teamId'),
    proxyService.createProxy('schema-service', {
      '^/teams/([^/]+)/schemas': '/teams/$1/schemas'
    })
  );
}

// Team views
if (proxyService.getService('view-service')) {
  router.use('/teams/:teamId/views',
    authenticate,
    // requireTeamAccess('teamId'),
    proxyService.createProxy('view-service', {
      '^/teams/([^/]+)/views': '/teams/$1/views'
    })
  );
}

// ==========================================
// User-Specific Routes
// ==========================================

/**
 * User-scoped resource endpoints
 * These routes include user ID in the path and enforce ownership
 */

// User-specific connections
if (proxyService.getService('connection-service')) {
  router.use('/users/:userId/connections',
    authenticate,
    requireOwnership('userId'),
    proxyService.createProxy('connection-service', {
      '^/users/([^/]+)/connections': '/users/$1/connections'
    })
  );
}

// User-specific schemas
if (proxyService.getService('schema-service')) {
  router.use('/users/:userId/schemas',
    authenticate,
    requireOwnership('userId'),
    proxyService.createProxy('schema-service', {
      '^/users/([^/]+)/schemas': '/users/$1/schemas'
    })
  );
}

export { router as apiRoutes };