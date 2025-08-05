import { BaseEntity, ID } from './common';

// Audit logging types
export interface AuditLog extends BaseEntity {
  userId: string;
  teamId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  changes: Record<string, any> | null;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorMessage: string | null;
  metadata: Record<string, any>;
}

export interface CreateAuditLogRequest {
  action: string;
  resourceType: string;
  resourceId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AuditLogFilter {
  userId?: string;
  teamId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
}

export interface AuditLogSummary {
  totalLogs: number;
  successfulActions: number;
  failedActions: number;
  uniqueUsers: number;
  topActions: ActionCount[];
  topResources: ResourceCount[];
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface ActionCount {
  action: string;
  count: number;
  percentage: number;
}

export interface ResourceCount {
  resourceType: string;
  count: number;
  percentage: number;
}

// Security event types
export interface SecurityEvent extends BaseEntity {
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId: string | null;
  ipAddress: string;
  userAgent: string;
  description: string;
  details: Record<string, any>;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
}

export type SecurityEventType = 
  | 'failed_login'
  | 'suspicious_activity'
  | 'unauthorized_access'
  | 'data_breach'
  | 'privilege_escalation'
  | 'brute_force'
  | 'account_lockout'
  | 'password_reset'
  | 'api_abuse';

export interface CreateSecurityEventRequest {
  type: SecurityEventType;
  severity: SecurityEvent['severity'];
  userId?: string;
  description: string;
  details?: Record<string, any>;
}

export interface UpdateSecurityEventRequest {
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
}