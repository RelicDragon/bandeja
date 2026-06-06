import { ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { ClubAdminReservationItem, ClubAdminReservationsResponse } from './clubAdmin.types';

const ACTIVE_GAME_STATUSES = ['ANNOUNCED', 'STARTED'] as const;

export class ClubAdminReservationsService {
  static async listReservations(
    clubId: string,
    limit: number,
    offset: number
  ): Promise<ClubAdminReservationsResponse> {
    const now = new Date();
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safeOffset = Math.max(offset, 0);

    const gameWhere: Prisma.GameWhereInput = {
      timeIsSet: true,
      status: { in: [...ACTIVE_GAME_STATUSES] },
      endTime: { gt: now },
      OR: [{ clubId }, { court: { clubId } }],
    };

    const [games, holds] = await Promise.all([
      prisma.game.findMany({
        where: gameWhere,
        include: {
          court: { select: { id: true, name: true } },
          gameCourts: { include: { court: { select: { id: true, name: true } } } },
          participants: {
            where: { role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] } },
            take: 1,
            orderBy: { role: 'asc' },
            include: { user: { select: USER_SELECT_FIELDS } },
          },
          _count: { select: { participants: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      prisma.courtSlotHold.findMany({
        where: { clubId, endTime: { gt: now } },
        include: { court: { select: { id: true, name: true } } },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    const items: ClubAdminReservationItem[] = [];

    for (const game of games) {
      const hostUser = game.participants[0]?.user;
      const host = hostUser
        ? {
            id: hostUser.id,
            firstName: hostUser.firstName,
            lastName: hostUser.lastName,
            avatar: hostUser.avatar,
          }
        : { id: '', firstName: null, lastName: null, avatar: null };

      const base = {
        gameId: game.id,
        startTime: game.startTime.toISOString(),
        endTime: game.endTime.toISOString(),
        hasBookedCourt: game.hasBookedCourt,
        status: game.status,
        name: game.name,
        host,
        participantCount: game._count.participants,
      };

      if (game.gameCourts.length > 0) {
        for (const gc of game.gameCourts) {
          items.push({
            kind: 'game',
            id: `game:${game.id}:${gc.courtId}`,
            courtId: gc.courtId,
            courtName: gc.court.name,
            ...base,
          });
        }
      } else {
        items.push({
          kind: 'game',
          id: `game:${game.id}`,
          courtId: game.courtId,
          courtName: game.court?.name ?? null,
          ...base,
        });
      }
    }

    for (const hold of holds) {
      items.push({
        kind: 'hold',
        id: `hold:${hold.id}`,
        holdId: hold.id,
        courtId: hold.courtId,
        courtName: hold.court.name,
        startTime: hold.startTime.toISOString(),
        endTime: hold.endTime.toISOString(),
        label: hold.label,
        note: hold.note,
      });
    }

    items.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));

    const page = items.slice(safeOffset, safeOffset + safeLimit);
    return {
      items: page,
      hasMore: items.length > safeOffset + safeLimit,
    };
  }
}
