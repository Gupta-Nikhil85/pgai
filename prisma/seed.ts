import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create a default organization
  const organization = await prisma.organization.create({
    data: {
      name: 'Default Organization',
      plan: 'free',
      settings: {
        defaultPermissions: ['connection.read', 'schema.read', 'view.read'],
        maxTeams: 5,
        maxConnectionsPerTeam: 10,
      },
    },
  });

  console.log('✅ Created organization:', organization.name);

  // Create a development team
  const team = await prisma.team.create({
    data: {
      organizationId: organization.id,
      name: 'Development Team',
      settings: {
        allowPublicEndpoints: true,
        maxViewsPerConnection: 50,
        defaultCacheTtl: 300,
      },
    },
  });

  console.log('✅ Created team:', team.name);

  // Create admin user
  const adminPasswordHash = await bcrypt.hash('admin123!', 12);
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@pgai.local',
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'User',
      emailVerified: true,
    },
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create developer user
  const devPasswordHash = await bcrypt.hash('dev123!', 12);
  const devUser = await prisma.user.create({
    data: {
      email: 'developer@pgai.local',
      passwordHash: devPasswordHash,
      firstName: 'Developer',
      lastName: 'User',
      emailVerified: true,
    },
  });

  console.log('✅ Created developer user:', devUser.email);

  // Create viewer user
  const viewerPasswordHash = await bcrypt.hash('viewer123!', 12);
  const viewerUser = await prisma.user.create({
    data: {
      email: 'viewer@pgai.local',
      passwordHash: viewerPasswordHash,
      firstName: 'Viewer',
      lastName: 'User',
      emailVerified: true,
    },
  });

  console.log('✅ Created viewer user:', viewerUser.email);

  // Add users to team with different roles
  await prisma.teamMember.create({
    data: {
      teamId: team.id,
      userId: adminUser.id,
      role: 'owner',
      permissions: [
        'connection.create',
        'connection.read',
        'connection.update',
        'connection.delete',
        'schema.read',
        'schema.refresh',
        'view.create',
        'view.read',
        'view.update',
        'view.delete',
        'endpoint.create',
        'endpoint.read',
        'endpoint.update',
        'endpoint.delete',
        'version.create',
        'version.read',
        'version.update',
        'version.delete',
        'team.manage',
        'user.manage',
        'audit.read',
      ],
    },
  });

  await prisma.teamMember.create({
    data: {
      teamId: team.id,
      userId: devUser.id,
      role: 'developer',
      permissions: [
        'connection.read',
        'schema.read',
        'schema.refresh',
        'view.create',
        'view.read',
        'view.update',
        'view.delete',
        'endpoint.create',
        'endpoint.read',
        'endpoint.update',
        'endpoint.delete',
        'version.create',
        'version.read',
        'version.update',
        'version.delete',
      ],
    },
  });

  await prisma.teamMember.create({
    data: {
      teamId: team.id,
      userId: viewerUser.id,
      role: 'viewer',
      permissions: ['connection.read', 'schema.read', 'view.read', 'endpoint.read', 'version.read'],
    },
  });

  console.log('✅ Added users to team with roles');

  // Create a sample database connection (encrypted config)
  const connectionConfig = {
    host: 'localhost',
    port: 5432,
    database: 'sample_db',
    username: 'sample_user',
    password: 'sample_pass',
    ssl: {
      enabled: false,
    },
    pooling: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,
    },
  };

  // Simple encryption for development (in production, use proper key management)
  const encryptionKey = 'dev-key-32-characters-long-12345';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
  let encryptedConfig = cipher.update(JSON.stringify(connectionConfig), 'utf8', 'hex');
  encryptedConfig += cipher.final('hex');
  const finalEncrypted = iv.toString('hex') + ':' + encryptedConfig;

  const connection = await prisma.connection.create({
    data: {
      teamId: team.id,
      name: 'Sample PostgreSQL DB',
      type: 'postgresql',
      configEncrypted: finalEncrypted,
      status: 'pending',
      createdBy: adminUser.id,
    },
  });

  console.log('✅ Created sample connection:', connection.name);

  // Create sample API key for the team
  const apiKeyValue = 'pgai_' + crypto.randomBytes(32).toString('hex');
  const apiKeyHash = crypto.createHash('sha256').update(apiKeyValue).digest('hex');

  await prisma.apiKey.create({
    data: {
      teamId: team.id,
      name: 'Development API Key',
      keyHash: apiKeyHash,
      permissions: ['connection.read', 'schema.read', 'view.read', 'endpoint.read'],
      active: true,
      createdBy: adminUser.id,
    },
  });

  console.log('✅ Created API key (save this for testing):', apiKeyValue);

  // Create sample audit logs
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      teamId: team.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: adminUser.id,
      ipAddress: '127.0.0.1',
      userAgent: 'pgai-seed-script/1.0',
      success: true,
      metadata: {
        loginMethod: 'password',
        timestamp: new Date().toISOString(),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      teamId: team.id,
      action: 'connection.create',
      resourceType: 'connection',
      resourceId: connection.id,
      changes: {
        name: 'Sample PostgreSQL DB',
        type: 'postgresql',
        status: 'pending',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'pgai-seed-script/1.0',
      success: true,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    },
  });

  console.log('✅ Created sample audit logs');

  // Create a webhook endpoint
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  await prisma.webhookEndpoint.create({
    data: {
      teamId: team.id,
      url: 'https://api.example.com/webhooks/pgai',
      events: ['connection.created', 'view.created', 'endpoint.created'],
      secret: webhookSecret,
      active: true,
    },
  });

  console.log('✅ Created webhook endpoint');

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📋 Test Users Created:');
  console.log('   Admin: admin@pgai.local / admin123!');
  console.log('   Developer: developer@pgai.local / dev123!');
  console.log('   Viewer: viewer@pgai.local / viewer123!');
  console.log(`\n🔑 API Key: ${apiKeyValue}`);
  console.log(`\n🪝 Webhook Secret: ${webhookSecret}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });