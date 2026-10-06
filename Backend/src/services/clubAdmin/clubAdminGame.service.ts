import { EntityType, ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { buildClubAdminDmMessage } from '../../utils/clubAdminDmMessage';
import { GameDeleteService } from '../game/delete.service';
import { GameUpdateService } from '../game/update.service';
import { ClubAdminNotificationService } from './clubAdminNotification.service';
import { ClubAdminService } from './clubAdmin.service';
import { applyLegacyHasBookedCourt } from '../gameCourt/courtSlots.tx';
import { clubAdminError, clubAdminNotFound } from './clubAdminErrors';
import { gameBelongsToClubWhere } from './clubAdminGameScope';
import { logClubActivity } from './clubAdminActivity.service';

/** League / tournament fixtures are owned by their competition — the club cannot cancel them. */
export const CLUB_ADMIN_CANCEL_LOCKED_ENTITY_TYPES: ReadonlySet<EntityType> = new Set([
  EntityType.LEAGUE,
  EntityType.LEAGUE_SEASON,
  EntityType.TOURNAMENT,
]);

const GAME_FOR_CLUB_ADMIN_INCLUDE = {
  participants: {
    where: { role: ParticipantRole.OWNER },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  },
} satisfies Prisma.GameInclude;

async function loadClubGame(clubId: string, gameId: string) {
  const game = await prisma.game.findFirst({
    where: { id: gameId, ...gameBelongsToClubWhere(clubId) },
    include: GAME_FOR_CLUB_ADMIN_INCLUDE,
  });
  if (!game) throw clubAdminNotFound('Game');
  if (!game.timeIsSet) throw clubAdminError(400, 'clubAdmin.validation', 'Game has no scheduled court time');
  if (game.startTime <= new Date()) throw clubAdminError(400, 'clubAdmin.validation', 'Cannot change past slots');
  return game;
}

/** Host messages speak for the admin's club, in that club's time zone. */
async function adminClubContext(clubId: string) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true, city: { select: { timezone: true } } },
  });
  return { clubName: club?.name || 'the club', timezone: club?.city?.timezone };
}

export interface ClubAdminGameActionBody {
  reason: string;
  note?: string | null;
  message?: string | null;
  notifyHost?: boolean;
}

function formatClubDateTime(startTime: Date, timezone?: string): { date: string; time: string } {
  const optsDate: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: timezone || 'UTC',
  };
  const optsTime: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone || 'UTC',
  };
  return {
    date: new Intl.DateTimeFormat('en-GB', optsDate).format(startTime),
    time: new Intl.DateTimeFormat('en-GB', optsTime).format(startTime),
  };
}

async function resolveHostUserId(gameId: string): Promise<string | null> {
  const owner = await prisma.gameParticipant.findFirst({
    where: { gameId, role: ParticipantRole.OWNER },
    select: { userId: true },
  });
  if (owner) return owner.userId;
  const admin = await prisma.gameParticipant.findFirst({
    where: { gameId, role: ParticipantRole.ADMIN },
    select: { userId: true },
  });
  return admin?.userId ?? null;
}

async function resolveHostLanguage(hostUserId: string | null): Promise<string | null> {
  if (!hostUserId) return null;
  const user = await prisma.user.findUnique({
    where: { id: hostUserId },
    select: { language: true },
  });
  return user?.language ?? null;
}

export class ClubAdminGameService {
  static async cancelGame(
    adminUserId: string,
    clubId: string,
    gameId: string,
    body: ClubAdminGameActionBody
  ) {
    await ClubAdminService.assertClubAdmin(adminUserId, clubId);
    const game = await loadClubGame(clubId, gameId);
    if (game.resultsStatus !== 'NONE') {
      throw clubAdminError(400, 'clubAdmin.resultsEntered', 'Cannot cancel a game that has results');
    }
    if (CLUB_ADMIN_CANCEL_LOCKED_ENTITY_TYPES.has(game.entityType)) {
      throw clubAdminError(400, 'clubAdmin.entityTypeLocked', 'League and tournament fixtures cannot be cancelled by the club', {
        entityType: game.entityType,
      });
    }

    const hostId = await resolveHostUserId(gameId);
    const host = game.participants[0]?.user;
    const hostName = host?.firstName || 'there';
    const { clubName, timezone: tz } = await adminClubContext(clubId);
    const { date, time } = formatClubDateTime(game.startTime, tz);
    const hostLang = await resolveHostLanguage(hostId);
    const customMessage =
      body.message?.trim() ||
      buildClubAdminDmMessage({
        mode: 'cancel',
        lang: hostLang,
        hostName,
        clubName,
        date,
        time,
        reason: body.reason,
        note: body.note ?? undefined,
      });

    await GameDeleteService.deleteGame(gameId, adminUserId);
    await logClubActivity(clubId, adminUserId, 'GAME_CANCELLED', {
      game: game.name,
      startTime: game.startTime.toISOString(),
      reason: body.reason,
    });

    if (hostId && body.notifyHost !== false) {
      try {
        await ClubAdminNotificationService.sendCourtCancellationDm(
          adminUserId,
          hostId,
          customMessage
        );
      } catch (err) {
        console.error('Club admin cancel DM failed', err);
      }
    }

    return { success: true };
  }

  static async clearCourtSlot(
    adminUserId: string,
    clubId: string,
    gameId: string,
    body: ClubAdminGameActionBody
  ) {
    await ClubAdminService.assertClubAdmin(adminUserId, clubId);
    const game = await loadClubGame(clubId, gameId);

    const hostId = await resolveHostUserId(gameId);
    const host = game.participants[0]?.user;
    const hostName = host?.firstName || 'there';
    const { clubName, timezone: tz } = await adminClubContext(clubId);
    const { date, time } = formatClubDateTime(game.startTime, tz);
    const hostLang = await resolveHostLanguage(hostId);
    const customMessage =
      body.message?.trim() ||
      buildClubAdminDmMessage({
        mode: 'clear',
        lang: hostLang,
        hostName,
        clubName,
        date,
        time,
        reason: body.reason,
        note: body.note ?? undefined,
      });

    // Shared update path (time-change rules, booking sync, bracket slots) with a narrow
    // club-admin authorisation — never the platform-admin bypass.
    await GameUpdateService.updateGame(
      gameId,
      { courtId: null, timeIsSet: false },
      adminUserId,
      false,
      {
        clubAdminScope: { clubId },
        timePolicy: 'explicit',
        clashGuard: false,
        slotsAuthoritative: true,
        inTx: { beforeSync: (tx) => releaseClubCourtsInTx(tx, gameId, clubId, adminUserId) },
      }
    );
    await logClubActivity(clubId, adminUserId, 'COURT_CLEARED', {
      game: game.name,
      startTime: game.startTime.toISOString(),
      reason: body.reason,
    });

    if (hostId && body.notifyHost !== false) {
      try {
        await ClubAdminNotificationService.sendCourtCancellationDm(
          adminUserId,
          hostId,
          customMessage
        );
      } catch (err) {
        console.error('Club admin clear-court DM failed', err);
      }
    }

    return { success: true };
  }
}

/**
 * Drop this club's court slots and the app's links to bookings on this club's courts.
 * Upstream reservations are never cancelled — only the game ↔ booking link goes.
 */
export async function releaseClubCourtsInTx(
  tx: Prisma.TransactionClient,
  gameId: string,
  clubId: string,
  actorUserId: string
): Promise<void> {
  const game = await tx.game.findUnique({ where: { id: gameId }, select: { clubId: true } });
  await tx.gameExternalBooking.deleteMany({
    where: {
      gameId,
      OR: [{ court: { clubId } }, ...(game?.clubId === clubId ? [{ courtId: null }] : [])],
    },
  });
  await tx.gameCourt.deleteMany({ where: { gameId, court: { clubId } } });
  await applyLegacyHasBookedCourt(tx, gameId, false, actorUserId);
}
