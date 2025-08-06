import express, { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { UserService } from '../services/user.service';
import { authenticate, authorize, requireOwnership } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

// Create router and dependencies
const router: express.Router = Router();
const userService = new UserService();
const userController = new UserController(userService);

/**
 * @route   GET /users/profile
 * @desc    Get current user's profile
 * @access  Private
 */
router.get('/profile', authenticate, asyncHandler(userController.getProfile));

/**
 * @route   PUT /users/profile
 * @desc    Update current user's profile
 * @access  Private
 */
router.put('/profile', authenticate, asyncHandler(userController.updateProfile));

/**
 * @route   PUT /users/change-password
 * @desc    Change current user's password
 * @access  Private
 */
router.put('/change-password', authenticate, asyncHandler(userController.changePassword));

/**
 * @route   DELETE /users/account
 * @desc    Delete current user's account
 * @access  Private
 */
router.delete('/account', authenticate, asyncHandler(userController.deleteAccount));

/**
 * @route   GET /users/:userId
 * @desc    Get user by ID (admin access or own profile)
 * @access  Private
 */
router.get(
  '/:userId',
  authenticate,
  // User can access their own profile or admins can access any profile
  (req, res, next) => {
    const userId = req.params.userId;
    const requestingUserId = req.context?.userId;
    const userRole = req.context?.role;

    // Allow access if user is requesting their own profile or if user is admin/owner
    if (userId === requestingUserId || userRole === 'admin' || userRole === 'owner') {
      return next();
    }

    // Otherwise use authorization middleware
    return authorize('user.manage')(req, res, next);
  },
  asyncHandler(userController.getUserById)
);

/**
 * @route   DELETE /users/:userId
 * @desc    Delete user by ID (admin only)
 * @access  Private (admin/owner only)
 */
router.delete(
  '/:userId',
  authenticate,
  authorize('user.manage'),
  asyncHandler(userController.deleteUserById)
);

export { router as userRoutes };