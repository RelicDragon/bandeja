import prisma from '../config/database';

export async function refreshClubCourtsCount(clubId: string): Promise<void> {
  const count = await prisma.court.count({ where: { clubId } });
  await prisma.club.update({
    where: { id: clubId },
    data: { courtsNumber: count },
  });
}
