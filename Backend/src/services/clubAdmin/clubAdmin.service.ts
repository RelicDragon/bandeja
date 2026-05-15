import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export interface ClubAdminClubSummary {
  id: string;
  name: string;
  avatar: string | null;
}

export class ClubAdminService {
  static async getAdminClubIds(userId: string): Promise<string[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (user?.isAdmin) {
      const clubs = await prisma.club.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      return clubs.map((c) => c.id);
    }
    const rows = await prisma.clubAdmin.findMany({
      where: { userId },
      select: { clubId: true },
    });
    return rows.map((r) => r.clubId);
  }

  static async getAdminClubSummaries(userId: string): Promise<ClubAdminClubSummary[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (user?.isAdmin) {
      return prisma.club.findMany({
        where: { isActive: true },
        select: { id: true, name: true, avatar: true },
        orderBy: { name: 'asc' },
      });
    }
    const rows = await prisma.clubAdmin.findMany({
      where: { userId },
      select: { club: { select: { id: true, name: true, avatar: true } } },
      orderBy: { club: { name: 'asc' } },
    });
    return rows.map((r) => r.club);
  }

  static async isClubAdmin(userId: string, clubId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (user?.isAdmin) return true;
    const row = await prisma.clubAdmin.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    return !!row;
  }

  static async assertClubAdmin(userId: string, clubId: string): Promise<void> {
    const ok = await this.isClubAdmin(userId, clubId);
    if (!ok) {
      throw new ApiError(403, 'clubAdmin.forbidden', true, { code: 'clubAdmin.forbidden' });
    }
  }
}
