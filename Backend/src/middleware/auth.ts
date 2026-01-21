import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { canModifyResults, hasParentGamePermission } from '../utils/parentGamePermissions';
import { ParticipantRole } from '@prisma/client';

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
        googleId: true,
        appleSub: true,
        isActive: true,
        isAdmin: true,
        isTrainer: true,
        currentCityId: true,
        authProvider: true,
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

/**
 * Middleware to check if user can modify game results
 * Requires authenticate middleware to be called first
 * Expects gameId in req.params.gameId
 */
export const requireCanModifyResults = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;
    
    if (!gameId) {
      throw new ApiError(400, 'Game ID is required');
    }

    if (!req.userId) {
      throw new ApiError(401, 'User not authenticated');
    }

    await canModifyResults(gameId, req.userId, req.user?.isAdmin || false);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware factory to check if user has permission on a game with specified roles
 * Requires authenticate middleware to be called first
 * Checks for gameId in req.params (gameId, id, or leagueSeasonId) or req.body.gameId
 */
export const requireGamePermission = (allowedRoles: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new ApiError(401, 'User not authenticated');
      }

      const gameId = req.params.gameId || req.params.id || req.params.leagueSeasonId || req.body.gameId;
      
      if (!gameId) {
        throw new ApiError(400, 'Game ID is required');
      }

      // Check if game exists first
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { id: true, status: true },
      });

      if (!game) {
        throw new ApiError(404, 'Game not found');
      }

      if (game.status === 'ARCHIVED') {
        throw new ApiError(400, 'Cannot modify archived games');
      }

      const hasPermission = await hasParentGamePermission(
        gameId,
        req.userId,
        allowedRoles,
        req.user?.isAdmin || false
      );

      if (!hasPermission) {
        const roleNames = allowedRoles.join(' or ');
        throw new ApiError(403, `Only game ${roleNames.toLowerCase()}s can perform this action`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user can edit a game (admin/owner of game or parent game)
 * Requires authenticate middleware to be called first
 * Checks for gameId in req.params (gameId, id, or leagueSeasonId) or req.body.gameId
 */
export const canEditGame = requireGamePermission([ParticipantRole.OWNER, ParticipantRole.ADMIN]);

/**
 * Middleware to check if user can access a game (admin/owner/participant of game or parent game)
 * Requires authenticate middleware to be called first
 * Checks for gameId in req.params (gameId, id, or leagueSeasonId) or req.body.gameId
 */
export const canAccessGame = requireGamePermission([ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT]);

