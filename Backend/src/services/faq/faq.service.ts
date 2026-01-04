import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';

export class FaqService {
  static async getFaqsByGameId(gameId: string) {
    const faqs = await prisma.gameFaq.findMany({
      where: { gameId },
      orderBy: { order: 'asc' },
    });

    return faqs;
  }

  static async createFaq(gameId: string, userId: string, data: { question: string; answer: string; order?: number }) {
    let order = data.order;
    if (order === undefined) {
      const maxOrder = await prisma.gameFaq.findFirst({
        where: { gameId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      order = maxOrder ? maxOrder.order + 1 : 0;
    }

    const faq = await prisma.gameFaq.create({
      data: {
        gameId,
        question: data.question,
        answer: data.answer,
        order,
      },
    });

    return faq;
  }

  static async updateFaq(faqId: string, userId: string, data: { question?: string; answer?: string; order?: number }, isAdmin: boolean = false) {
    const faq = await prisma.gameFaq.findUnique({
      where: { id: faqId },
      select: { gameId: true },
    });

    if (!faq) {
      throw new ApiError(404, 'FAQ not found');
    }

    const hasPermission = await hasParentGamePermission(faq.gameId, userId, undefined, isAdmin);
    if (!hasPermission) {
      throw new ApiError(403, 'Only owners and admins can update FAQs');
    }

    const updateData: any = {};
    if (data.question !== undefined) {
      updateData.question = data.question;
    }
    if (data.answer !== undefined) {
      updateData.answer = data.answer;
    }
    if (data.order !== undefined) {
      updateData.order = data.order;
    }

    const updatedFaq = await prisma.gameFaq.update({
      where: { id: faqId },
      data: updateData,
    });

    return updatedFaq;
  }

  static async deleteFaq(faqId: string, userId: string, isAdmin: boolean = false) {
    const faq = await prisma.gameFaq.findUnique({
      where: { id: faqId },
      select: { gameId: true },
    });

    if (!faq) {
      throw new ApiError(404, 'FAQ not found');
    }

    const hasPermission = await hasParentGamePermission(faq.gameId, userId, undefined, isAdmin);
    if (!hasPermission) {
      throw new ApiError(403, 'Only owners and admins can delete FAQs');
    }

    await prisma.gameFaq.delete({
      where: { id: faqId },
    });
  }

  static async reorderFaqs(gameId: string, userId: string, faqIds: string[]) {
    const existingFaqs = await prisma.gameFaq.findMany({
      where: { gameId },
      select: { id: true },
    });

    const existingFaqIds = new Set(existingFaqs.map(f => f.id));
    const providedFaqIds = new Set(faqIds);

    if (existingFaqIds.size !== providedFaqIds.size || 
        !Array.from(existingFaqIds).every(id => providedFaqIds.has(id))) {
      throw new ApiError(400, 'All FAQ IDs must be provided for reordering');
    }

    await prisma.$transaction(
      faqIds.map((faqId, index) =>
        prisma.gameFaq.update({
          where: { id: faqId },
          data: { order: index },
        })
      )
    );

    const reorderedFaqs = await prisma.gameFaq.findMany({
      where: { gameId },
      orderBy: { order: 'asc' },
    });

    return reorderedFaqs;
  }
}

