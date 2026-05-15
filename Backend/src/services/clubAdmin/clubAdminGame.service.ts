import { ParticipantRole } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { buildClubAdminDmMessage } from '../../utils/clubAdminDmMessage';
import { GameDeleteService } from '../game/delete.service';
import { GameUpdateService } from '../game/update.service';
import { ClubAdminNotificationService } from './clubAdminNotification.service';
import { ClubAdminService } from './clubAdmin.service';

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
    body: { reason: string; note?: string; message?: string }
  ) {
    await ClubAdminService.assertClubAdmin(adminUserId, clubId);
    const game = await prisma.game.findFirst({
      where: {
        id: gameId,
        OR: [{ clubId }, { court: { clubId } }],
      },
      include: {
        club: { select: { name: true, city: { select: { timezone: true } } } },
        participants: {
          where: { role: ParticipantRole.OWNER },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!game) throw new ApiError(404, 'Game not found');
    if (!game.timeIsSet) throw new ApiError(400, 'Game has no scheduled court time');
    if (game.startTime <= new Date()) throw new ApiError(400, 'Cannot cancel past slots');
    if (game.resultsStatus !== 'NONE') {
      throw new ApiError(400, 'Cannot cancel a game that has results');
    }

    const hostId = await resolveHostUserId(gameId);
    const host = game.participants[0]?.user;
    const hostName = host?.firstName || 'there';
    const tz = game.club?.city?.timezone;
    const { date, time } = formatClubDateTime(game.startTime, tz);
    const hostLang = await resolveHostLanguage(hostId);
    const customMessage =
      body.message?.trim() ||
      buildClubAdminDmMessage({
        mode: 'cancel',
        lang: hostLang,
        hostName,
        clubName: game.club?.name || 'the club',
        date,
        time,
        reason: body.reason,
        note: body.note,
      });

    await GameDeleteService.deleteGame(gameId, adminUserId);

    if (hostId) {
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
    body: { reason: string; note?: string; message?: string }
  ) {
    await ClubAdminService.assertClubAdmin(adminUserId, clubId);
    const game = await prisma.game.findFirst({
      where: {
        id: gameId,
        OR: [{ clubId }, { court: { clubId } }],
      },
      include: {
        club: { select: { name: true, city: { select: { timezone: true } } } },
        participants: {
          where: { role: ParticipantRole.OWNER },
          include: { user: { select: { id: true, firstName: true } } },
        },
      },
    });
    if (!game) throw new ApiError(404, 'Game not found');
    if (!game.timeIsSet) throw new ApiError(400, 'Game has no scheduled court time');
    if (game.startTime <= new Date()) throw new ApiError(400, 'Cannot clear past slots');

    const hostId = await resolveHostUserId(gameId);
    const host = game.participants[0]?.user;
    const hostName = host?.firstName || 'there';
    const tz = game.club?.city?.timezone;
    const { date, time } = formatClubDateTime(game.startTime, tz);
    const hostLang = await resolveHostLanguage(hostId);
    const customMessage =
      body.message?.trim() ||
      buildClubAdminDmMessage({
        mode: 'clear',
        lang: hostLang,
        hostName,
        clubName: game.club?.name || 'the club',
        date,
        time,
        reason: body.reason,
        note: body.note,
      });

    await GameUpdateService.updateGame(
      gameId,
      {
        courtId: null,
        timeIsSet: false,
        hasBookedCourt: false,
      },
      adminUserId,
      true
    );

    if (hostId) {
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
