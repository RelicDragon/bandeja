import { ClubAdminRole } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';

export class ClubAdminAssignmentService {
  static async listClubAdmins(clubId: string) {
    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new ApiError(404, 'Club not found');

    return prisma.clubAdmin.findMany({
      where: { clubId },
      include: {
        user: { select: USER_SELECT_FIELDS },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  static async assignClubAdmin(clubId: string, userId: string, role?: ClubAdminRole) {
    const [club, user] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } }),
    ]);
    if (!club) throw new ApiError(404, 'Club not found');
    if (!user?.isActive) throw new ApiError(404, 'User not found');

    return prisma.clubAdmin.upsert({
      where: { userId_clubId: { userId, clubId } },
      create: { userId, clubId, role: role ?? ClubAdminRole.ADMIN },
      update: { role: role ?? ClubAdminRole.ADMIN },
      include: { user: { select: USER_SELECT_FIELDS } },
    });
  }

  static async removeClubAdmin(clubId: string, userId: string) {
    const row = await prisma.clubAdmin.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!row) throw new ApiError(404, 'Club admin assignment not found');
    await prisma.clubAdmin.delete({ where: { userId_clubId: { userId, clubId } } });
  }
}
