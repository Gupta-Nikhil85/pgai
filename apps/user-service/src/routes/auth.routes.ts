import express, { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { UserService } from '../services/user.service';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

// Create router and dependencies
const router: express.Router = Router();
const userService = new UserService();
const userController = new UserController(userService);

/**
 * @route   POST /auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', asyncHandler(userController.register));

/**
 * @route   POST /auth/login
 * @desc    Authenticate user and get tokens
 * @access  Public
 */
router.post('/login', asyncHandler(userController.login));

/**
 * @route   POST /auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', asyncHandler(userController.refreshToken));

/**
 * @route   POST /auth/logout
 * @desc    Logout user and invalidate refresh tokens
 * @access  Private
 */
router.post('/logout', authenticate, asyncHandler(userController.logout));

export { router as authRoutes };