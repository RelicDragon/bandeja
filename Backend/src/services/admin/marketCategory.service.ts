import { Sport } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';

function parseOptionalSport(sport: unknown): Sport | null | undefined {
  if (sport === undefined) {
    return undefined;
  }
  if (sport === null) {
    return null;
  }
  if (typeof sport === 'string' && Object.values(Sport).includes(sport as Sport)) {
    return sport as Sport;
  }
  throw new ApiError(400, 'Invalid sport');
}

export class AdminMarketCategoryService {
  static async getAll() {
    return prisma.marketItemCategory.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { items: true } },
      },
    });
  }

  static async listActive(sport?: Sport) {
    return prisma.marketItemCategory.findMany({
      where: {
        isActive: true,
        ...(sport ? { OR: [{ sport: null }, { sport }] } : {}),
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, order: true, sport: true },
    });
  }

  static async create(data: {
    name: string;
    order?: number;
    isActive?: boolean;
    sport?: Sport | null;
  }) {
    const { name, order = 0, isActive = true } = data;
    if (!name?.trim()) {
      throw new ApiError(400, 'Name is required');
    }
    const sport = parseOptionalSport(data.sport);
    return prisma.marketItemCategory.create({
      data: {
        name: name.trim(),
        order,
        isActive,
        ...(sport !== undefined && { sport }),
      },
    });
  }

  static async update(
    id: string,
    data: { name?: string; order?: number; isActive?: boolean; sport?: Sport | null }
  ) {
    const existing = await prisma.marketItemCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, 'Category not found');
    }
    const sport = parseOptionalSport(data.sport);
    return prisma.marketItemCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(sport !== undefined && { sport }),
      },
    });
  }

  static async delete(id: string) {
    const existing = await prisma.marketItemCategory.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!existing) {
      throw new ApiError(404, 'Category not found');
    }
    if (existing._count.items > 0) {
      throw new ApiError(400, 'Cannot delete category with items');
    }
    await prisma.marketItemCategory.delete({ where: { id } });
    return { message: 'Category deleted' };
  }
}
