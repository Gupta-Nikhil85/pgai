import { BaseEntity, ID } from './common';

// Team and organization types
export interface Organization extends BaseEntity {
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  settings: Record<string, any>;
}

export interface Team extends BaseEntity {
  organizationId: string;
  name: string;
  settings: Record<string, any>;
}

export interface TeamMember extends BaseEntity {
  teamId: string;
  userId: string;
  role: TeamRole;
  permissions: string[];
  joinedAt: Date;
}

export type TeamRole = 'owner' | 'admin' | 'developer' | 'viewer';

export interface CreateTeamRequest {
  name: string;
  organizationId?: string;
}

export interface UpdateTeamRequest {
  name?: string;
  settings?: Record<string, any>;
}

export interface InviteTeamMemberRequest {
  email: string;
  role: TeamRole;
  permissions?: string[];
}

export interface UpdateTeamMemberRequest {
  role?: TeamRole;
  permissions?: string[];
}

export interface TeamWithMembers extends Team {
  members: (TeamMember & {
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    };
  })[];
  memberCount: number;
}

// Permission system
export const PERMISSIONS = {
  // Connection permissions
  'connection.create': 'Create database connections',
  'connection.read': 'View database connections',
  'connection.update': 'Update database connections',
  'connection.delete': 'Delete database connections',
  
  // Schema permissions
  'schema.read': 'View database schemas',
  'schema.refresh': 'Refresh schema information',
  
  // View permissions
  'view.create': 'Create database views',
  'view.read': 'View database views',
  'view.update': 'Update database views',
  'view.delete': 'Delete database views',
  
  // Endpoint permissions
  'endpoint.create': 'Create API endpoints',
  'endpoint.read': 'View API endpoints',
  'endpoint.update': 'Update API endpoints',
  'endpoint.delete': 'Delete API endpoints',
  
  // Version permissions
  'version.create': 'Create new versions',
  'version.read': 'View version information',
  'version.update': 'Update versions',
  'version.delete': 'Delete versions',
  
  // Team permissions
  'team.manage': 'Manage team settings',
  'user.manage': 'Manage team members',
  'audit.read': 'View audit logs',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<TeamRole, Permission[]> = {
  owner: Object.keys(PERMISSIONS) as Permission[],
  admin: [
    'connection.create', 'connection.read', 'connection.update', 'connection.delete',
    'schema.read', 'schema.refresh',
    'view.create', 'view.read', 'view.update', 'view.delete',
    'endpoint.create', 'endpoint.read', 'endpoint.update', 'endpoint.delete',
    'version.create', 'version.read', 'version.update', 'version.delete',
    'user.manage', 'audit.read'
  ],
  developer: [
    'connection.read',
    'schema.read', 'schema.refresh',
    'view.create', 'view.read', 'view.update', 'view.delete',
    'endpoint.create', 'endpoint.read', 'endpoint.update', 'endpoint.delete',
    'version.create', 'version.read', 'version.update', 'version.delete'
  ],
  viewer: [
    'connection.read',
    'schema.read',
    'view.read',
    'endpoint.read',
    'version.read'
  ]
};