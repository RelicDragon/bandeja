import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { refreshClubCourtsCount } from '../../utils/refreshClubCourtsCount';
import { ClubAdminService } from './clubAdmin.service';

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
    }
  ) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const court = await prisma.court.create({
      data: {
        name: data.name,
        clubId,
        courtType: data.courtType,
        isIndoor: data.isIndoor ?? false,
        surfaceType: data.surfaceType,
        pricePerHour: data.pricePerHour,
      },
    });
    await refreshClubCourtsCount(clubId);
    return court;
  }

  static async patchCourt(userId: string, courtId: string, data: Record<string, unknown>) {
    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court) throw new ApiError(404, 'Court not found');
    await ClubAdminService.assertClubAdmin(userId, court.clubId);

    const allowed = ['name', 'courtType', 'isIndoor', 'surfaceType', 'pricePerHour', 'isActive'];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    const updated = await prisma.court.update({ where: { id: courtId }, data: update });
    await refreshClubCourtsCount(court.clubId);
    return updated;
  }

  static async deactivateCourt(userId: string, courtId: string) {
    return this.patchCourt(userId, courtId, { isActive: false });
  }
}
