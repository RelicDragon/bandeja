import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ClubAdminService } from './clubAdmin.service';
import { ClubAdminClubsListResponse } from './clubAdmin.types';
import { buildClubPatchData } from './clubAdminClubPatch';
import { clubAdminValidation } from './clubAdminErrors';
import { clubDayWindowUtc, clubLocalDate } from '@bandeja/shared/clubAdmin/clubTime';
import { gameBelongsToClubWhere } from './clubAdminGameScope';

export class ClubAdminClubService {
  static async listClubs(
    userId: string,
    limit: number,
    offset: number,
    search?: string
  ): Promise<ClubAdminClubsListResponse> {
    const clubIds = await ClubAdminService.getAdminClubIds(userId);
    if (clubIds.length === 0) return { items: [], hasMore: false, total: 0 };

    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safeOffset = Math.max(offset, 0);
    const q = search?.trim();

    const where = {
      id: { in: clubIds },
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [total, clubs] = await Promise.all([
      prisma.club.count({ where }),
      prisma.club.findMany({
        where,
        include: {
          city: { select: { id: true, name: true, timezone: true } },
          _count: { select: { courts: { where: { isActive: true } } } },
        },
        orderBy: { name: 'asc' },
        skip: safeOffset,
        take: safeLimit,
      }),
    ]);

    // "Today" is each club's own local day; every non-archived game at the club counts.
    const now = new Date();
    const counts = await Promise.all(
      clubs.map((c) => {
        const { start, end } = clubDayWindowUtc(clubLocalDate(now, c.city.timezone), c.city.timezone);
        return prisma.game.count({
          where: {
            ...gameBelongsToClubWhere(c.id),
            timeIsSet: true,
            status: { not: 'ARCHIVED' },
            startTime: { gte: start, lt: end },
          },
        });
      })
    );
    const countByClub = new Map(clubs.map((c, i) => [c.id, counts[i]]));

    return {
      items: clubs.map((c) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        address: c.address,
        openingTime: c.openingTime,
        closingTime: c.closingTime,
        city: c.city,
        courtsCount: c._count.courts,
        bookingsToday: countByClub.get(c.id) ?? 0,
        integrationType: c.integrationType,
      })),
      hasMore: safeOffset + clubs.length < total,
      total,
    };
  }

  static async getClub(userId: string, clubId: string) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        city: { select: { id: true, name: true, timezone: true } },
        courts: { orderBy: { name: 'asc' } },
      },
    });
    if (!club) throw new ApiError(404, 'Club not found');
    return {
      ...club,
      integrationActive: club.integrationType != null,
    };
  }

  static async patchClub(userId: string, clubId: string, body: Record<string, unknown>) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const data = await buildClubPatchData(clubId, body ?? {});
    if (Object.keys(data).length === 0) {
      throw clubAdminValidation('body', 'No valid fields to update');
    }

    return prisma.club.update({
      where: { id: clubId },
      data,
      include: {
        city: { select: { id: true, name: true, timezone: true } },
      },
    });
  }
}
