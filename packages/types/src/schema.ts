import { BaseEntity, ID } from './common';

// Database schema types
export interface DatabaseSchema {
  connectionId: string;
  schemas: SchemaObject[];
  relationships: Relationship[];
  lastUpdated: Date;
  versionHash: string;
}

export interface SchemaObject {
  type: 'table' | 'view' | 'function' | 'type';
  schema: string;
  name: string;
  columns: Column[];
  constraints: Constraint[];
  indexes: Index[];
  metadata: ObjectMetadata;
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  description: string | null;
  ordinalPosition: number;
}

export interface Constraint {
  name: string;
  type: 'primary_key' | 'foreign_key' | 'unique' | 'check';
  columns: string[];
  referencedTable?: string;
  referencedColumns?: string[];
  definition?: string;
}

export interface Index {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  method: string;
}

export interface Relationship {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  constraintName: string;
  onUpdate: string;
  onDelete: string;
}

export interface ObjectMetadata {
  owner: string;
  createdAt: Date | null;
  lastModified: Date | null;
  rowCount: number | null;
  size: number | null;
  description: string | null;
}

export interface SchemaChange extends BaseEntity {
  connectionId: string;
  changeType: 'added' | 'modified' | 'removed';
  objectType: 'table' | 'view' | 'function' | 'column' | 'constraint';
  objectName: string;
  details: Record<string, any>;
  detectedAt: Date;
}

export interface SchemaDiscoveryResult {
  schema: DatabaseSchema;
  changes: SchemaChange[];
  discoveryTime: number;
  errors: string[];
}

export interface SchemaSearchParams {
  query?: string;
  type?: SchemaObject['type'];
  schema?: string;
  limit?: number;
  offset?: number;
}