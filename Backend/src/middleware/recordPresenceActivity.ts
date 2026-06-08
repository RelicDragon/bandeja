import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { extractBearerToken } from './authToken';

export function recordPresenceActivity(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    const decoded = verifyToken(token);
    const userId = decoded?.userId;
    if (userId) {
      const socketService = (global as any).socketService;
      if (socketService?.recordActivity) socketService.recordActivity(userId);
    }
  } catch {
    // ignore invalid/expired token
  }
  next();
}
