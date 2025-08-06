import Joi from 'joi';
import { 
  CreateUserRequest, 
  UpdateUserRequest, 
  LoginRequest, 
  ChangePasswordRequest, 
  RefreshTokenRequest 
} from '@pgai/types';

// User validation schemas
export const createUserSchema = Joi.object<CreateUserRequest>({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)',
      'any.required': 'Password is required',
    }),
  firstName: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .messages({
      'string.min': 'First name cannot be empty',
      'string.max': 'First name cannot exceed 100 characters',
    }),
  lastName: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Last name cannot be empty',
      'string.max': 'Last name cannot exceed 100 characters',
    }),
});

export const updateUserSchema = Joi.object<UpdateUserRequest>({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .optional()
    .messages({
      'string.email': 'Please provide a valid email address',
    }),
  firstName: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .allow('')
    .messages({
      'string.max': 'First name cannot exceed 100 characters',
    }),
  lastName: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Last name cannot exceed 100 characters',
    }),
}).min(1); // At least one field must be provided

export const loginSchema = Joi.object<LoginRequest>({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required',
    }),
});

export const changePasswordSchema = Joi.object<ChangePasswordRequest>({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required',
    }),
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/)
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters long',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)',
      'any.required': 'New password is required',
    }),
});

export const refreshTokenSchema = Joi.object<RefreshTokenRequest>({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required',
    }),
});

// Common validation schemas
export const uuidSchema = Joi.string()
  .guid({ version: 'uuidv4' })
  .required()
  .messages({
    'string.guid': 'Invalid UUID format',
    'any.required': 'ID is required',
  });

export const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.integer': 'Page must be a whole number',
      'number.min': 'Page must be at least 1',
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .messages({
      'number.integer': 'Limit must be a whole number',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100',
    }),
  sortBy: Joi.string()
    .valid('createdAt', 'updatedAt', 'email', 'firstName', 'lastName')
    .default('createdAt')
    .messages({
      'any.only': 'Sort field must be one of: createdAt, updatedAt, email, firstName, lastName',
    }),
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .messages({
      'any.only': 'Sort order must be either asc or desc',
    }),
});

// Validation middleware helper
export const validateSchema = (schema: Joi.ObjectSchema) => {
  return (data: any) => {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        code: detail.type,
        value: detail.context?.value,
      }));

      throw new (require('./errors').ValidationError)(
        'Validation failed',
        undefined,
        details
      );
    }

    return value;
  };
};

// Simple value validation helper
export const validateValue = (schema: Joi.Schema) => {
  return (data: any) => {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        code: detail.type,
        value: detail.context?.value,
      }));

      throw new (require('./errors').ValidationError)(
        'Validation failed',
        undefined,
        details
      );
    }

    return value;
  };
};