// Common API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

// Request context passed through middleware
export interface RequestContext {
  userId: string;
  teamId?: string;
  role: string;
  permissions: string[];
  ipAddress: string;
  userAgent: string;
  requestId: string;
  traceId: string;
}

// Validation error response
export interface ValidationErrorResponse extends ApiResponse {
  success: false;
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: ValidationFieldError[];
  };
}

export interface ValidationFieldError {
  field: string;
  message: string;
  code: string;
  value?: any;
}