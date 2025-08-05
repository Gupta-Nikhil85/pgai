import { BaseEntity, ID } from './common';

// Version management types
export interface EndpointVersion extends BaseEntity {
  endpointId: string;
  version: string;
  status: VersionStatus;
  changes: VersionChange[];
  backwardCompatible: boolean;
  deprecationDate: Date | null;
  sunsetDate: Date | null;
  migrationGuide: string | null;
  usageMetrics: UsageMetrics | null;
  createdBy: string;
}

export type VersionStatus = 'active' | 'deprecated' | 'retired' | 'draft';

export interface VersionChange {
  type: 'addition' | 'modification' | 'removal';
  category: 'schema' | 'endpoint' | 'security' | 'performance';
  description: string;
  breaking: boolean;
  migrationRequired: boolean;
  details: Record<string, any>;
}

export interface UsageMetrics {
  totalRequests: number;
  uniqueUsers: number;
  averageResponseTime: number;
  errorRate: number;
  lastUsed: Date;
  dailyUsage: DailyUsage[];
}

export interface DailyUsage {
  date: Date;
  requests: number;
  uniqueUsers: number;
  errors: number;
}

export interface CreateVersionRequest {
  version: string;
  changes: Omit<VersionChange, 'details'>[];
  migrationGuide?: string;
  deprecationDate?: Date;
  sunsetDate?: Date;
}

export interface UpdateVersionRequest {
  status?: VersionStatus;
  deprecationDate?: Date;
  sunsetDate?: Date;
  migrationGuide?: string;
}

export interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  changes: VersionChange[];
  breakingChanges: VersionChange[];
  migrationSteps: MigrationStep[];
  compatibility: CompatibilityReport;
}

export interface MigrationStep {
  order: number;
  type: 'code_change' | 'configuration' | 'data_migration';
  description: string;
  automated: boolean;
  script?: string;
  validation?: string;
}

export interface CompatibilityReport {
  compatible: boolean;
  issues: CompatibilityIssue[];
  recommendations: string[];
}

export interface CompatibilityIssue {
  severity: 'error' | 'warning' | 'info';
  type: string;
  description: string;
  affectedEndpoints: string[];
  suggestedAction: string;
}

export interface VersionDeployment extends BaseEntity {
  versionId: string;
  environment: 'development' | 'staging' | 'production';
  status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'rolled_back';
  deployedBy: string;
  deploymentNotes: string | null;
  rollbackReason: string | null;
}