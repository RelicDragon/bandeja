import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ClubAdminService } from './clubAdmin.service';
import { ClubAdminClubsListResponse } from './clubAdmin.types';
import { parseClubSportsInput, assertClubSportsCoverCourtSports } from '../../shared/clubSports';

const CLUB_ADMIN_PATCH_KEYS = [
  'name',
  'description',
  'phone',
  'email',
  'website',
  'address',
  'openingTime',
  'closingTime',
  'amenities',
  'latitude',
  'longitude',
  'defaultSlotMinutes',
  'cancellationNoticeHours',
  'policyText',
  'photos',
  'sports',
] as const;

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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

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

    const pageClubIds = clubs.map((c) => c.id);
    const bookingsToday =
      pageClubIds.length === 0
        ? []
        : await prisma.game.groupBy({
            by: ['clubId'],
            where: {
              clubId: { in: pageClubIds },
              timeIsSet: true,
              status: { in: ['ANNOUNCED', 'STARTED'] },
              startTime: { gte: todayStart, lt: todayEnd },
            },
            _count: { id: true },
          });
    const countByClub = new Map(bookingsToday.map((b) => [b.clubId!, b._count.id]));

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
        integrationScriptName: c.integrationScriptName,
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
      integrationActive: !!club.integrationScriptName,
    };
  }

  static async patchClub(userId: string, clubId: string, body: Record<string, unknown>) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const data: Record<string, unknown> = {};
    for (const key of CLUB_ADMIN_PATCH_KEYS) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (Object.keys(data).length === 0) {
      throw new ApiError(400, 'No valid fields to update');
    }

    if (data.sports !== undefined) {
      const sports = parseClubSportsInput(data.sports);
      const courts = await prisma.court.findMany({
        where: { clubId },
        select: { sport: true },
      });
      assertClubSportsCoverCourtSports(
        sports,
        courts.map((c) => c.sport),
      );
      data.sports = sports;
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
