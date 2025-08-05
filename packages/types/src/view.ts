import { BaseEntity, ID } from './common';

// Database view types
export interface DatabaseView extends BaseEntity {
  connectionId: string;
  name: string;
  schema: string;
  description: string | null;
  sqlDefinition: string;
  queryBuilderConfig: QueryBuilderConfig | null;
  dependencies: string[];
  performanceMetrics: PerformanceMetrics | null;
  createdBy: string;
}

export interface QueryBuilderConfig {
  tables: SelectedTable[];
  joins: JoinDefinition[];
  columns: SelectedColumn[];
  filters: FilterCondition[];
  grouping: GroupingConfig | null;
  ordering: OrderingConfig | null;
}

export interface SelectedTable {
  schema: string;
  name: string;
  alias: string | null;
}

export interface JoinDefinition {
  type: 'inner' | 'left' | 'right' | 'full';
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
}

export interface SelectedColumn {
  table: string;
  column: string;
  alias: string | null;
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max' | null;
  expression: string | null;
}

export interface FilterCondition {
  column: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'not_in' | 'is_null' | 'is_not_null';
  value: any;
  logicalOperator: 'and' | 'or';
}

export interface GroupingConfig {
  columns: string[];
  having: FilterCondition[];
}

export interface OrderingConfig {
  columns: {
    column: string;
    direction: 'asc' | 'desc';
  }[];
}

export interface PerformanceMetrics {
  executionTime: number;
  planningTime: number;
  rowCount: number;
  cost: number;
  lastAnalyzed: Date;
}

export interface ViewVersion extends BaseEntity {
  viewId: string;
  version: string;
  sqlDefinition: string;
  changeNotes: string | null;
  createdBy: string;
}

export interface ViewDependency {
  viewId: string;
  dependsOnTable: string | null;
  dependsOnView: string | null;
  dependencyType: 'table' | 'view' | 'function';
}

export interface CreateViewRequest {
  name: string;
  schema: string;
  description?: string;
  sqlDefinition: string;
  queryBuilderConfig?: QueryBuilderConfig;
}

export interface UpdateViewRequest {
  name?: string;
  description?: string;
  sqlDefinition?: string;
  queryBuilderConfig?: QueryBuilderConfig;
  changeNotes?: string;
}

export interface ViewPreviewRequest {
  sqlDefinition: string;
  limit?: number;
}

export interface ViewPreviewResult {
  columns: {
    name: string;
    type: string;
  }[];
  rows: Record<string, any>[];
  executionTime: number;
  rowCount: number;
}