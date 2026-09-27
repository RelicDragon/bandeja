import prisma from '../../config/database';
import { ParticipantRole } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';
import { FAQ_TRANSLATION_POLICY_VERSION } from './faqTranslator.service';
import { lockFaqGame } from './faqGameLock';

export class FaqService {
  static async getFaqsByGameId(gameId: string, locale?: string) {
    const [faqs, preference] = await Promise.all([prisma.gameFaq.findMany({
      where: { gameId },
      orderBy: { order: 'asc' },
      include: { translations: locale ? { where: { locale } } : false },
    }), prisma.gameFaqTranslationPreference.findUnique({ where: { gameId } })]);

    return faqs.map(({ translations, ...faq }) => {
      if (!locale) return faq;
      const translation = translations.find(t => t.sourceRevision === faq.sourceRevision && t.policyVersion === FAQ_TRANSLATION_POLICY_VERSION && t.sourceLocaleOverride === (preference?.sourceLocaleOverride ?? null));
      return { ...faq, localizedText: translation
        ? { locale, question: translation.noChange ? faq.question : translation.question, answer: translation.noChange ? faq.answer : translation.answer, state: translation.noChange ? 'original' : 'translated' }
        : { locale, question: faq.question, answer: faq.answer, state: 'original' } };
    });
  }

  static async createFaq(gameId: string, userId: string, data: { question: string; answer: string; order?: number }) {
    return prisma.$transaction(async tx => {
      await lockFaqGame(tx, gameId);
      const game = await tx.game.findUnique({ where: { id: gameId }, select: { status: true } });
      if (!game) throw new ApiError(404, 'Game not found');
      if (game.status === 'ARCHIVED') throw new ApiError(400, 'Cannot modify archived games');
      let order = data.order;
      if (order === undefined) {
      const maxOrder = await tx.gameFaq.findFirst({
        where: { gameId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      order = maxOrder ? maxOrder.order + 1 : 0;
    }

      const faq = await tx.gameFaq.create({
      data: {
        gameId,
        question: data.question,
        answer: data.answer,
        order,
      },
    });

      return faq;
    }, { isolationLevel: 'Serializable' });
  }

  static async updateFaq(faqId: string, userId: string, data: { question?: string; answer?: string; order?: number }, isAdmin: boolean = false) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const faq = await prisma.gameFaq.findUnique({ where: { id: faqId } });
      if (!faq) throw new ApiError(404, 'FAQ not found');
      const game = await prisma.game.findUnique({ where: { id: faq.gameId }, select: { status: true } });
      if (!game || game.status === 'ARCHIVED') throw new ApiError(400, 'Cannot modify archived games');
      if (!await hasParentGamePermission(faq.gameId, userId, [ParticipantRole.OWNER, ParticipantRole.ADMIN], isAdmin)) throw new ApiError(403, 'Only owners and admins can update FAQs');
      const changed = (data.question !== undefined && data.question !== faq.question) || (data.answer !== undefined && data.answer !== faq.answer);
      try {
        const result = await prisma.$transaction(async tx => {
          await lockFaqGame(tx, faq.gameId);
          const updated = await tx.gameFaq.updateMany({
            where: { id: faqId, sourceRevision: faq.sourceRevision, question: faq.question, answer: faq.answer },
            data: { question: data.question, answer: data.answer, order: data.order, ...(changed ? { sourceRevision: { increment: 1 } } : {}) },
          });
          if (updated.count !== 1) return null;
          if (changed) await tx.gameFaqTranslationJob.updateMany({ where: { faqId, status: { in: ['pending', 'running'] } }, data: { status: 'superseded', leaseOwner: null, leaseExpiresAt: null } });
          return tx.gameFaq.findUniqueOrThrow({ where: { id: faqId } });
        }, { isolationLevel: 'Serializable' });
        if (result) return result;
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'P2034' && attempt < 3) continue;
        throw error;
      }
    }
    throw new ApiError(409, 'FAQ changed. Refresh and try again');
  }

  static async deleteFaq(faqId: string, userId: string, isAdmin: boolean = false) {
    const faq = await prisma.gameFaq.findUnique({
      where: { id: faqId },
      select: { gameId: true },
    });

    if (!faq) {
      throw new ApiError(404, 'FAQ not found');
    }

    const game = await prisma.game.findUnique({ where: { id: faq.gameId }, select: { status: true } });
    if (!game || game.status === 'ARCHIVED') throw new ApiError(400, 'Cannot modify archived games');

    const hasPermission = await hasParentGamePermission(faq.gameId, userId, [ParticipantRole.OWNER, ParticipantRole.ADMIN], isAdmin);
    if (!hasPermission) {
      throw new ApiError(403, 'Only owners and admins can delete FAQs');
    }

    await prisma.$transaction(async tx => {
      await lockFaqGame(tx, faq.gameId);
      await tx.gameFaq.delete({ where: { id: faqId } });
    }, { isolationLevel: 'Serializable' });
  }

  static async reorderFaqs(gameId: string, userId: string, faqIds: string[]) {
    return prisma.$transaction(async tx => {
    await lockFaqGame(tx, gameId);
    const existingFaqs = await tx.gameFaq.findMany({
      where: { gameId },
      select: { id: true },
    });

    const existingFaqIds = new Set(existingFaqs.map(f => f.id));
    const providedFaqIds = new Set(faqIds);

    if (existingFaqIds.size !== providedFaqIds.size || 
        !Array.from(existingFaqIds).every(id => providedFaqIds.has(id))) {
      throw new ApiError(400, 'All FAQ IDs must be provided for reordering');
    }

    for (const [index, faqId] of faqIds.entries()) await tx.gameFaq.update({ where: { id: faqId }, data: { order: index } });

    const reorderedFaqs = await tx.gameFaq.findMany({
      where: { gameId },
      orderBy: { order: 'asc' },
    });

    return reorderedFaqs;
    }, { isolationLevel: 'Serializable' });
  }
}
