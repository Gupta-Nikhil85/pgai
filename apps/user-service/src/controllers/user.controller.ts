import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { 
  createUserSchema, 
  updateUserSchema, 
  loginSchema, 
  changePasswordSchema, 
  refreshTokenSchema,
  uuidSchema,
  validateSchema,
  validateValue 
} from '../utils/validation';
import { ApiResponse } from '@pgai/types';
import { createLogger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';

const logger = createLogger('UserController');

export class UserController {
  constructor(private userService: UserService) {}

  // POST /auth/register
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = validateSchema(createUserSchema)(req.body);
      
      logger.info('User registration attempt', { 
        email: validatedData.email,
        ip: req.ip 
      });

      const user = await this.userService.createUser(validatedData);

      const response: ApiResponse = {
        success: true,
        data: user,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context?.requestId || 'unknown',
          version: '0.1.0',
        },
      };

      logger.info('User registered successfully', { 
        userId: user.id, 
        email: user.email 
      });

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  // POST /auth/login
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = validateSchema(loginSchema)(req.body);
      
      logger.info('User login attempt', { 
        email: validatedData.email,
        ip: req.ip 
      });

      const loginResult = await this.userService.authenticateUser(validatedData);

      const response: ApiResponse = {
        success: true,
        data: loginResult,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context?.requestId || 'unknown',
          version: '0.1.0',
        },
      };

      logger.info('User login successful', { 
        userId: loginResult.user.id,
        email: loginResult.user.email 
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // POST /auth/refresh
  refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = validateSchema(refreshTokenSchema)(req.body);
      
      logger.info('Token refresh attempt', { ip: req.ip });

      const result = await this.userService.refreshToken(validatedData);

      const response: ApiResponse = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context?.requestId || 'unknown',
          version: '0.1.0',
        },
      };

      logger.info('Token refresh successful');

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // POST /auth/logout
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new NotFoundError('Authentication context not found');
      }

      const { userId } = req.context;

      logger.info('User logout attempt', { userId });

      await this.userService.invalidateRefreshTokens(userId);

      const response: ApiResponse = {
        success: true,
        data: { message: 'Logged out successfully' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('User logout successful', { userId });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // GET /users/profile
  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new NotFoundError('Authentication context not found');
      }

      const { userId } = req.context;

      logger.info('Fetching user profile', { userId });

      const profile = await this.userService.getUserProfile(userId);

      const response: ApiResponse = {
        success: true,
        data: profile,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('User profile fetched successfully', { userId });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // PUT /users/profile
  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new NotFoundError('Authentication context not found');
      }

      const { userId } = req.context;
      const validatedData = validateSchema(updateUserSchema)(req.body);

      logger.info('Updating user profile', { userId });

      const updatedUser = await this.userService.updateUser(userId, validatedData);

      const response: ApiResponse = {
        success: true,
        data: updatedUser,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('User profile updated successfully', { userId });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // PUT /users/change-password
  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new NotFoundError('Authentication context not found');
      }

      const { userId } = req.context;
      const validatedData = validateSchema(changePasswordSchema)(req.body);

      logger.info('Password change attempt', { userId });

      await this.userService.changePassword(userId, validatedData);

      const response: ApiResponse = {
        success: true,
        data: { message: 'Password changed successfully' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Password changed successfully', { userId });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // GET /users/:userId (for admin access)
  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = validateValue(uuidSchema)(req.params.userId);

      logger.info('Fetching user by ID', { 
        userId, 
        requestedBy: req.context?.userId 
      });

      const profile = await this.userService.getUserProfile(userId);

      const response: ApiResponse = {
        success: true,
        data: profile,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context?.requestId || 'unknown',
          version: '0.1.0',
        },
      };

      logger.info('User fetched successfully', { userId });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // DELETE /users/account
  deleteAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) {
        throw new NotFoundError('Authentication context not found');
      }

      const { userId } = req.context;

      logger.info('Account deletion attempt', { userId });

      await this.userService.deleteUser(userId);

      const response: ApiResponse = {
        success: true,
        data: { message: 'Account deleted successfully' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context.requestId,
          version: '0.1.0',
        },
      };

      logger.info('Account deleted successfully', { userId });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // DELETE /users/:userId (for admin access)
  deleteUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = validateValue(uuidSchema)(req.params.userId);

      logger.info('User deletion attempt', { 
        userId, 
        deletedBy: req.context?.userId 
      });

      await this.userService.deleteUser(userId);

      const response: ApiResponse = {
        success: true,
        data: { message: 'User deleted successfully' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.context?.requestId || 'unknown',
          version: '0.1.0',
        },
      };

      logger.info('User deleted successfully', { userId });

      res.json(response);
    } catch (error) {
      next(error);
    }
  };
}