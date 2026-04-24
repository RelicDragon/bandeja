import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { LegacyJwtVerifyRejectedError, verifyToken } from '../utils/jwt';
import { config } from '../config/env';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { canModifyResults, hasParentGamePermission } from '../utils/parentGamePermissions';
import { ParticipantRole } from '@prisma/client';
import { getClientIp, updateUserIpLocation } from '../services/ipLocation.service';

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
      throw new ApiError(401, 'No token provided', true, { code: 'auth.noToken' });
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
        lastUserIP: true,
      },
    });

    if (!user) {
      throw new ApiError(401, 'User not found or inactive', true, { code: 'auth.userNotFound' });
    }
    if (!user.isActive) {
      throw new ApiError(401, 'User not found or inactive', true, { code: 'auth.userInactive' });
    }

    req.userId = user.id;
    req.user = user;

    getClientIp(req).then((clientIp) => {
      if (clientIp && user.lastUserIP !== clientIp) updateUserIpLocation(user.id, clientIp).catch((err) => console.error('IP location update failed', err));
    }).catch(() => {});

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else if (error instanceof LegacyJwtVerifyRejectedError) {
      const endedAt = config.legacyJwtIssuanceEndAt;
      next(
        new ApiError(401, 'auth.clientUpgradeRequired', true, {
          code: 'auth.clientUpgradeRequired',
          minClientVersion: config.minClientVersionForRefresh,
          ...(endedAt && { legacyJwtIssuanceEndedAt: endedAt.toISOString() }),
        })
      );
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new ApiError(401, 'auth.accessExpired', true, { code: 'auth.accessExpired' }));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new ApiError(401, 'auth.invalidToken', true, { code: 'auth.invalidToken' }));
    } else {
      next(new ApiError(401, 'auth.invalidToken', true, { code: 'auth.invalidToken' }));
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
      throw new ApiError(401, 'No token provided', true, { code: 'auth.noToken' });
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

    if (!user) {
      throw new ApiError(401, 'User not found or inactive', true, { code: 'auth.userNotFound' });
    }
    if (!user.isActive) {
      throw new ApiError(401, 'User not found or inactive', true, { code: 'auth.userInactive' });
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
    } else if (error instanceof LegacyJwtVerifyRejectedError) {
      const endedAt = config.legacyJwtIssuanceEndAt;
      next(
        new ApiError(401, 'auth.clientUpgradeRequired', true, {
          code: 'auth.clientUpgradeRequired',
          minClientVersion: config.minClientVersionForRefresh,
          ...(endedAt && { legacyJwtIssuanceEndedAt: endedAt.toISOString() }),
        })
      );
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new ApiError(401, 'auth.accessExpired', true, { code: 'auth.accessExpired' }));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new ApiError(401, 'auth.invalidToken', true, { code: 'auth.invalidToken' }));
    } else {
      next(new ApiError(401, 'auth.invalidToken', true, { code: 'auth.invalidToken' }));
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
      throw new ApiError(401, 'User not authenticated', true, { code: 'auth.notAuthenticated' });
    }

    await canModifyResults(gameId, req.userId, req.user?.isAdmin || false);
    next();
  } catch (error) {
    next(error);
  }
};

export type RequireGamePermissionOptions = {
  allowArchived?: boolean;
};

/**
 * Middleware factory to check if user has permission on a game with specified roles
 * Requires authenticate middleware to be called first
 * Checks for gameId in req.params (gameId, id, or leagueSeasonId) or req.body.gameId
 */
export const requireGamePermission = (
  allowedRoles: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN],
  options: RequireGamePermissionOptions = {}
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new ApiError(401, 'User not authenticated', true, { code: 'auth.notAuthenticated' });
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

      if (!options.allowArchived && game.status === 'ARCHIVED') {
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

/** Same as canAccessGame but allows read-style access when the game is ARCHIVED (e.g. listing invites). */
export const canAccessGameIncludingArchived = requireGamePermission(
  [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT],
  { allowArchived: true }
);

