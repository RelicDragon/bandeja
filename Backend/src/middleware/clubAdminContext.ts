import { NextFunction, Response } from 'express';
import type { ClubAdminCapability, ClubAdminRole } from '@bandeja/shared/clubAdmin/contract';
import { CLUB_ADMIN_ROLE_CAPABILITIES, clubAdminCan } from '@bandeja/shared/clubAdmin/contract';
import prisma from '../config/database';
import type { AuthRequest } from './auth';
import { clubAdminError, clubAdminForbidden, clubAdminNotFound } from '../services/clubAdmin/clubAdminErrors';

/**
 * Club admin console request context (docs/domains/club-admin.md "Roles"). Resolved once per
 * request: the caller's role at the club (a platform admin acts as ADMIN), the club's time zone
 * and currency. Every `/club-admin` route that touches a club runs this and then
 * `requireCapability` — STAFF limits are enforced here, server-side, on legacy routes too.
 */
export interface ClubAdminRequestContext {
  clubId: string;
  role: ClubAdminRole;
  isPlatformAdmin: boolean;
  capabilities: readonly ClubAdminCapability[];
  timezone: string;
  currency: string;
  club: {
    id: string;
    name: string;
    avatar: string | null;
    isActive: boolean;
    integrationType: string | null;
    cityName: string;
    defaultSlotMinutes: number | null;
  };
}

export type ClubAdminRequest = AuthRequest & { clubAdmin?: ClubAdminRequestContext };

export async function resolveClubAdminContext(
  userId: string,
  clubId: string,
  userIsPlatformAdmin?: boolean
): Promise<ClubAdminRequestContext> {
  const [club, membership, user] = await Promise.all([
    prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        avatar: true,
        isActive: true,
        integrationType: true,
        currency: true,
        defaultSlotMinutes: true,
        city: { select: { name: true, timezone: true } },
      },
    }),
    prisma.clubAdmin.findUnique({ where: { userId_clubId: { userId, clubId } }, select: { role: true } }),
    userIsPlatformAdmin === undefined
      ? prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
      : Promise.resolve({ isAdmin: userIsPlatformAdmin }),
  ]);
  const isPlatformAdmin = user?.isAdmin === true;
  // Non-members get the same 403 whether or not the club exists (no existence oracle).
  if (!membership && !isPlatformAdmin) throw clubAdminForbidden();
  if (!club) throw clubAdminNotFound('Club');
  const role: ClubAdminRole = isPlatformAdmin ? 'ADMIN' : (membership!.role as ClubAdminRole);
  return {
    clubId,
    role,
    isPlatformAdmin,
    capabilities: CLUB_ADMIN_ROLE_CAPABILITIES[role],
    timezone: club.city.timezone,
    currency: club.currency,
    club: {
      id: club.id,
      name: club.name,
      avatar: club.avatar,
      isActive: club.isActive,
      integrationType: club.integrationType,
      cityName: club.city.name,
      defaultSlotMinutes: club.defaultSlotMinutes,
    },
  };
}

async function attach(req: ClubAdminRequest, clubId: string | null | undefined): Promise<void> {
  if (!req.userId) throw clubAdminError(401, 'clubAdmin.forbidden', 'User not authenticated');
  if (!clubId) throw clubAdminNotFound('Club');
  req.clubAdmin = await resolveClubAdminContext(req.userId, clubId, req.user?.isAdmin === true);
}

/** Context from `req.params[paramKey]` (default `clubId`). */
export function clubAdminContext(paramKey = 'clubId') {
  return async (req: ClubAdminRequest, _res: Response, next: NextFunction) => {
    try {
      await attach(req, req.params[paramKey]);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Context for legacy routes keyed by a court / hold id: resolve the club from the row. */
export function clubAdminContextFrom(resolveClubId: (req: ClubAdminRequest) => Promise<string | null>) {
  return async (req: ClubAdminRequest, _res: Response, next: NextFunction) => {
    try {
      await attach(req, await resolveClubId(req));
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireCapability(capability: ClubAdminCapability) {
  return (req: ClubAdminRequest, _res: Response, next: NextFunction) => {
    const ctx = req.clubAdmin;
    if (!ctx) {
      next(clubAdminForbidden());
      return;
    }
    if (!clubAdminCan(ctx.role, capability)) {
      next(clubAdminError(403, 'clubAdmin.capability', `Your club role cannot ${capability}`, { capability }));
      return;
    }
    next();
  };
}

export function getClubAdminContext(req: ClubAdminRequest): ClubAdminRequestContext {
  if (!req.clubAdmin) throw clubAdminForbidden();
  return req.clubAdmin;
}
