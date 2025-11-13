import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';

export class GoodsService {
  static async createGoods(name: string, price: number) {
    if (price < 0) {
      throw new ApiError(400, 'Price must be non-negative');
    }

    const goods = await prisma.goods.create({
      data: {
        name,
        price,
      },
    });

    return goods;
  }

  static async getAllGoods() {
    const goods = await prisma.goods.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return goods;
  }

  static async getGoodsById(id: string) {
    const goods = await prisma.goods.findUnique({
      where: { id },
    });

    if (!goods) {
      throw new ApiError(404, 'Goods not found');
    }

    return goods;
  }

  static async updateGoods(id: string, name?: string, price?: number) {
    if (price !== undefined && price < 0) {
      throw new ApiError(400, 'Price must be non-negative');
    }

    const goods = await prisma.goods.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(price !== undefined && { price }),
      },
    });

    return goods;
  }

  static async deleteGoods(id: string) {
    const goods = await prisma.goods.findUnique({
      where: { id },
      include: {
        transactionRows: true,
      },
    });

    if (!goods) {
      throw new ApiError(404, 'Goods not found');
    }

    if (goods.transactionRows.length > 0) {
      throw new ApiError(400, 'Cannot delete goods that have been used in transactions');
    }

    await prisma.goods.delete({
      where: { id },
    });

    return { success: true };
  }
}

