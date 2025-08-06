import { 
  User, 
  CreateUserRequest, 
  UpdateUserRequest, 
  LoginRequest, 
  LoginResponse, 
  RefreshTokenRequest, 
  ChangePasswordRequest,
  UserProfile,
  JWTPayload
} from '@pgai/types';
import { databaseService } from './database';
import { 
  hashPassword, 
  comparePassword, 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  validatePasswordStrength 
} from '../utils/auth';
import { 
  ValidationError, 
  AuthenticationError, 
  ConflictError, 
  NotFoundError, 
  createValidationError,
  createNotFoundError 
} from '../utils/errors';
import { createLogger } from '../utils/logger';
import { ROLE_PERMISSIONS } from '@pgai/types';

const logger = createLogger('UserService');

export class UserService {
  private db = databaseService.client;

  async createUser(userData: CreateUserRequest): Promise<Omit<User, 'passwordHash'>> {
    logger.info('Creating new user', { email: userData.email });

    // Validate password strength
    const passwordValidation = validatePasswordStrength(userData.password);
    if (!passwordValidation.isValid) {
      throw new ValidationError(
        'Password does not meet security requirements',
        'password',
        { errors: passwordValidation.errors }
      );
    }

    // Check if user already exists
    const existingUser = await this.db.user.findUnique({
      where: { email: userData.email.toLowerCase() }
    });

    if (existingUser) {
      throw new ConflictError(`User with email ${userData.email} already exists`);
    }

    // Hash password and create user
    const passwordHash = await hashPassword(userData.password);
    
    const user = await this.db.user.create({
      data: {
        email: userData.email.toLowerCase(),
        passwordHash,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        emailVerified: false,
      },
    });

    logger.info('User created successfully', { userId: user.id, email: user.email });

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async authenticateUser(credentials: LoginRequest): Promise<LoginResponse> {
    logger.info('Authenticating user', { email: credentials.email });

    const user = await this.db.user.findUnique({
      where: { email: credentials.email.toLowerCase() },
      include: {
        teamMembers: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    const isPasswordValid = await comparePassword(credentials.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Get user's primary team (first team they're a member of)
    const primaryTeamMembership = user.teamMembers[0];
    if (!primaryTeamMembership) {
      throw new AuthenticationError('User is not a member of any team');
    }

    // Generate tokens
    const tokenPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      teamId: primaryTeamMembership.teamId,
      role: primaryTeamMembership.role,
      permissions: ROLE_PERMISSIONS[primaryTeamMembership.role as keyof typeof ROLE_PERMISSIONS],
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion);

    logger.info('User authenticated successfully', { 
      userId: user.id, 
      teamId: primaryTeamMembership.teamId 
    });

    // Return user data and tokens
    const { passwordHash: _, tokenVersion: __, ...userWithoutSensitiveData } = user;
    
    return {
      user: userWithoutSensitiveData,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  async refreshToken(request: RefreshTokenRequest): Promise<{ accessToken: string }> {
    logger.info('Refreshing access token');

    const { userId, tokenVersion } = verifyRefreshToken(request.refreshToken);

    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        teamMembers: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Check token version for token invalidation
    if (user.tokenVersion !== tokenVersion) {
      throw new AuthenticationError('Refresh token has been invalidated');
    }

    // Get primary team membership
    const primaryTeamMembership = user.teamMembers[0];
    if (!primaryTeamMembership) {
      throw new AuthenticationError('User is not a member of any team');
    }

    // Generate new access token
    const tokenPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      teamId: primaryTeamMembership.teamId,
      role: primaryTeamMembership.role,
      permissions: ROLE_PERMISSIONS[primaryTeamMembership.role as keyof typeof ROLE_PERMISSIONS],
    };

    const accessToken = generateAccessToken(tokenPayload);

    logger.info('Access token refreshed successfully', { userId: user.id });

    return { accessToken };
  }

  async getUserProfile(userId: string): Promise<UserProfile> {
    logger.info('Fetching user profile', { userId });

    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        teamMembers: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw createNotFoundError('User', userId);
    }

    const profile: UserProfile = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      teams: user.teamMembers.map(tm => ({
        id: tm.team.id,
        name: tm.team.name,
        role: tm.role,
        permissions: Array.isArray(tm.permissions) ? tm.permissions as string[] : [],
      }))
    };

    return profile;
  }

  async updateUser(userId: string, updateData: UpdateUserRequest): Promise<Omit<User, 'passwordHash'>> {
    logger.info('Updating user', { userId });

    const user = await this.db.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw createNotFoundError('User', userId);
    }

    // Check if email is being changed and if it already exists
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.db.user.findUnique({
        where: { email: updateData.email.toLowerCase() }
      });

      if (existingUser) {
        throw new ConflictError(`User with email ${updateData.email} already exists`);
      }
    }

    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: {
        email: updateData.email?.toLowerCase(),
        firstName: updateData.firstName,
        lastName: updateData.lastName,
      },
    });

    logger.info('User updated successfully', { userId });

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async changePassword(userId: string, changePasswordData: ChangePasswordRequest): Promise<void> {
    logger.info('Changing user password', { userId });

    const user = await this.db.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw createNotFoundError('User', userId);
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(changePasswordData.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Validate new password
    const passwordValidation = validatePasswordStrength(changePasswordData.newPassword);
    if (!passwordValidation.isValid) {
      throw new ValidationError(
        'New password does not meet security requirements',
        'newPassword',
        { errors: passwordValidation.errors }
      );
    }

    // Hash new password and update user
    const newPasswordHash = await hashPassword(changePasswordData.newPassword);
    
    await this.db.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        tokenVersion: user.tokenVersion + 1, // Invalidate all refresh tokens
      },
    });

    logger.info('Password changed successfully', { userId });
  }

  async invalidateRefreshTokens(userId: string): Promise<void> {
    logger.info('Invalidating refresh tokens for user', { userId });

    const user = await this.db.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw createNotFoundError('User', userId);
    }

    await this.db.user.update({
      where: { id: userId },
      data: {
        tokenVersion: user.tokenVersion + 1,
      },
    });

    logger.info('Refresh tokens invalidated', { userId });
  }

  async deleteUser(userId: string): Promise<void> {
    logger.info('Deleting user', { userId });

    const user = await this.db.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw createNotFoundError('User', userId);
    }

    await this.db.user.delete({
      where: { id: userId }
    });

    logger.info('User deleted successfully', { userId });
  }
}