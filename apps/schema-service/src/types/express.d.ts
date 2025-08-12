import 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: {
        userId: string;
        teamId: string;
      };
    }
  }
}