import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { canModifyResults, hasParentGamePermission } from '../utils/parentGamePermissions';
import { ParticipantRole } from '@prisma/client';
import { getClientIp, updateUserIpLocation } from '../services/ipLocation.service';
import prisma from '../config/database';
import {
  extractBearerToken,
  extractBearerTokenFromHeader,
  loadActiveUser,
  mapJwtError,
} from './authToken';

export type AuthRequest = Request & {
  userId?: string;
  user?: any;
  /** Route params coerced to single strings (Express 5 types them as string | string[]). */
  params: Record<string, string>;
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new ApiError(401, 'No token provided', true, { code: 'auth.noToken' });
    }

    const user = await loadActiveUser(token);
    req.userId = user.id;
    req.user = user;

    getClientIp(req).then((clientIp) => {
      if (clientIp && user.lastUserIP !== clientIp) updateUserIpLocation(user.id, clientIp).catch((err) => console.error('IP location update failed', err));
    }).catch(() => {});

    next();
  } catch (error) {
    next(mapJwtError(error));
  }
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractBearerTokenFromHeader(req);
    if (!token) {
      next();
      return;
    }

    const user = await loadActiveUser(token, { select: 'full' });
    req.userId = user.id;
    req.user = user;
    next();
  } catch {
    next();
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new ApiError(401, 'No token provided', true, { code: 'auth.noToken' });
    }

    const user = await loadActiveUser(token);
    if (!user.isAdmin) {
      throw new ApiError(403, 'Admin access required');
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (error) {
    next(mapJwtError(error));
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

/** Same as canEditGame but allows owner/admin actions when the game is ARCHIVED (e.g. Telegram results). */
export const canEditGameIncludingArchived = requireGamePermission(
  [ParticipantRole.OWNER, ParticipantRole.ADMIN],
  { allowArchived: true }
);

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

export const requireClubAdmin = (paramKey = 'clubId') => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new ApiError(401, 'User not authenticated', true, { code: 'auth.notAuthenticated' });
      }
      const clubId = req.params[paramKey] as string | undefined;
      if (!clubId) {
        throw new ApiError(400, 'Club ID is required');
      }
      const { ClubAdminService } = await import('../services/clubAdmin/clubAdmin.service');
      await ClubAdminService.assertClubAdmin(req.userId, clubId);
      next();
    } catch (error) {
      next(error);
    }
  };
};
