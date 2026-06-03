import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { refreshClubCourtsCount } from '../../utils/refreshClubCourtsCount';
import { ClubAdminService } from './clubAdmin.service';
import { assertCourtSportInClub } from '../../shared/clubSports';

export class ClubAdminCourtService {
  static async listCourts(userId: string, clubId: string) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    return prisma.court.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });
  }

  static async createCourt(
    userId: string,
    clubId: string,
    data: {
      name: string;
      courtType?: string;
      isIndoor?: boolean;
      surfaceType?: string;
      pricePerHour?: number;
      sport?: Sport | null;
    }
  ) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { sports: true },
    });
    if (!club) throw new ApiError(404, 'Club not found');
    assertCourtSportInClub(club.sports, data.sport ?? null);

    const court = await prisma.court.create({
      data: {
        name: data.name,
        clubId,
        courtType: data.courtType,
        isIndoor: data.isIndoor ?? false,
        surfaceType: data.surfaceType,
        pricePerHour: data.pricePerHour,
        sport: data.sport ?? null,
      },
    });
    await refreshClubCourtsCount(clubId);
    return court;
  }

  static async patchCourt(userId: string, courtId: string, data: Record<string, unknown>) {
    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court) throw new ApiError(404, 'Court not found');
    await ClubAdminService.assertClubAdmin(userId, court.clubId);

    const club = await prisma.club.findUnique({
      where: { id: court.clubId },
      select: { sports: true },
    });
    if (!club) throw new ApiError(404, 'Club not found');

    const allowed = ['name', 'courtType', 'isIndoor', 'surfaceType', 'pricePerHour', 'isActive', 'sport'];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    if (update.sport !== undefined) {
      const raw = update.sport;
      const courtSport =
        raw == null || raw === ''
          ? null
          : Object.values(Sport).includes(raw as Sport)
            ? (raw as Sport)
            : null;
      if (raw != null && raw !== '' && courtSport == null) {
        throw new ApiError(400, 'Invalid sport');
      }
      assertCourtSportInClub(club.sports, courtSport);
      update.sport = courtSport;
    }
    const updated = await prisma.court.update({ where: { id: courtId }, data: update });
    await refreshClubCourtsCount(court.clubId);
    return updated;
  }

  static async deactivateCourt(userId: string, courtId: string) {
    return this.patchCourt(userId, courtId, { isActive: false });
  }
}
