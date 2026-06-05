import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { adSponsorWriteSchema } from '../ads/ad.schemas';

export class AdminAdSponsorService {
  static async list() {
    return prisma.adSponsor.findMany({
      orderBy: { name: 'asc' },
      include: {
        club: { select: { id: true, name: true } },
        _count: { select: { campaigns: true } },
      },
    });
  }

  static async getById(id: string) {
    const sponsor = await prisma.adSponsor.findUnique({
      where: { id },
      include: {
        club: { select: { id: true, name: true } },
        campaigns: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!sponsor) throw new ApiError(404, 'Sponsor not found');
    return sponsor;
  }

  static async create(body: unknown) {
    const parsed = adSponsorWriteSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.message);

    if (parsed.data.clubId) {
      const club = await prisma.club.findUnique({ where: { id: parsed.data.clubId } });
      if (!club) throw new ApiError(400, 'Club not found');
    }

    return prisma.adSponsor.create({ data: parsed.data });
  }

  static async update(id: string, body: unknown) {
    const existing = await prisma.adSponsor.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, 'Sponsor not found');

    const parsed = adSponsorWriteSchema.partial().safeParse(body);
    if (!parsed.success) throw new ApiError(400, parsed.error.message);

    if (parsed.data.clubId) {
      const club = await prisma.club.findUnique({ where: { id: parsed.data.clubId } });
      if (!club) throw new ApiError(400, 'Club not found');
    }

    return prisma.adSponsor.update({ where: { id }, data: parsed.data });
  }

  static async delete(id: string) {
    const existing = await prisma.adSponsor.findUnique({
      where: { id },
      include: { _count: { select: { campaigns: true } } },
    });
    if (!existing) throw new ApiError(404, 'Sponsor not found');
    if (existing._count.campaigns > 0) {
      throw new ApiError(400, 'Cannot delete sponsor with campaigns');
    }
    await prisma.adSponsor.delete({ where: { id } });
    return { message: 'Sponsor deleted' };
  }
}
