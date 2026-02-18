import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export function recordPresenceActivity(req: Request, _res: Response, next: NextFunction): void {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }
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
