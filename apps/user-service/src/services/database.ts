import { PrismaClient } from '@prisma/client';
import { createLogger } from '../utils/logger';
import { DatabaseError } from '../utils/errors';

const logger = createLogger('DatabaseService');

class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient({
      log: ['error', 'warn'],
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public get client(): PrismaClient {
    return this.prisma;
  }

  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Failed to connect to database', error as Error);
      throw new DatabaseError('Database connection failed', error as Error);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect from database', error as Error);
      throw new DatabaseError('Database disconnection failed', error as Error);
    }
  }

  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: any }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy' };
    } catch (error) {
      logger.error('Database health check failed', error as Error);
      return { 
        status: 'unhealthy', 
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        } 
      };
    }
  }

  // Transaction wrapper with proper error handling
  public async transaction<T>(
    fn: (prisma: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (error) {
      logger.error('Database transaction failed', error as Error);
      throw new DatabaseError('Transaction failed', error as Error);
    }
  }

  // Graceful shutdown
  public async gracefulShutdown(): Promise<void> {
    logger.info('Initiating database graceful shutdown...');
    await this.disconnect();
  }
}

export const databaseService = DatabaseService.getInstance();
export { DatabaseService };