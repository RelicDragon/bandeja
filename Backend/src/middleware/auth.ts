import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { USER_SELECT_FIELDS } from '../utils/constants';

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
  params: any;
  body: any;
  query: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query.token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      throw new ApiError(401, 'No token provided');
    }

    const decoded = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        ...USER_SELECT_FIELDS,
        phone: true,
        email: true,
        telegramId: true,
        isActive: true,
        isAdmin: true,
        isTrainer: true,
        currentCityId: true,
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError(401, 'User not found or inactive');
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(401, 'Invalid token'));
    }
  }
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (user && user.isActive) {
        req.userId = user.id;
        req.user = user;
      }
    }

    next();
  } catch {
    next();
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query.token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      throw new ApiError(401, 'No token provided');
    }

    const decoded = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        ...USER_SELECT_FIELDS,
        phone: true,
        email: true,
        isActive: true,
        isAdmin: true,
        isTrainer: true,
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError(401, 'User not found or inactive');
    }

    if (!user.isAdmin) {
      throw new ApiError(403, 'Admin access required');
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(401, 'Invalid token'));
    }
  }
};

