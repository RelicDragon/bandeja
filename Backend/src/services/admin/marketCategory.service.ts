import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';

export class AdminMarketCategoryService {
  static async getAll() {
    return prisma.marketItemCategory.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { items: true } },
      },
    });
  }

  static async create(data: { name: string; order?: number; isActive?: boolean }) {
    const { name, order = 0, isActive = true } = data;
    if (!name?.trim()) {
      throw new ApiError(400, 'Name is required');
    }
    return prisma.marketItemCategory.create({
      data: { name: name.trim(), order, isActive },
    });
  }

  static async update(
    id: string,
    data: { name?: string; order?: number; isActive?: boolean }
  ) {
    const existing = await prisma.marketItemCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, 'Category not found');
    }
    return prisma.marketItemCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
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
