import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { FaqService } from '../services/faq/faq.service';
import { ApiError } from '../utils/ApiError';
import { resolveRequestAppUiLocale } from '../services/gameText/gameTextRequestLocale';
import { FaqTranslationService } from '../services/faq/faqTranslation.service';
import { FaqTranslationQueueService } from '../services/faq/faqTranslationQueue.service';

export const getGameFaqs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const faqs = await FaqService.getFaqsByGameId(gameId, resolveRequestAppUiLocale(req));

  res.json({
    success: true,
    data: faqs,
  });
});

export const getFaqTranslationStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await FaqTranslationService.status(req.params.gameId) });
});

export const submitFaqTranslations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await FaqTranslationService.submit(req.params.gameId, req.userId!, req.user?.isAdmin || false, req.body, false);
  FaqTranslationQueueService.wake();
  res.status(202).json({ success: true, data });
});

export const retryFaqTranslations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await FaqTranslationService.submit(req.params.gameId, req.userId!, req.user?.isAdmin || false, req.body, true);
  FaqTranslationQueueService.wake();
  res.status(202).json({ success: true, data });
});

export const requestReaderFaqTranslation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await FaqTranslationService.requestReaderLocale(req.params.gameId, req.userId!, req.user?.isAdmin || false, req.body);
  if (data.queued > 0) FaqTranslationQueueService.wake();
  res.status(202).json({ success: true, data });
});

export const createFaq = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, question, answer, order } = req.body;
  const userId = req.userId!;

  if (!gameId || !question || !answer) {
    throw new ApiError(400, 'Game ID, question, and answer are required');
  }

  const faq = await FaqService.createFaq(gameId, userId, { question, answer, order });

  res.status(201).json({
    success: true,
    data: faq,
  });
});

export const updateFaq = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { question, answer, order } = req.body;
  const userId = req.userId!;

  const faq = await FaqService.updateFaq(id, userId, { question, answer, order }, req.user?.isAdmin || false);

  res.json({
    success: true,
    data: faq,
  });
});

export const deleteFaq = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  await FaqService.deleteFaq(id, userId, req.user?.isAdmin || false);

  res.json({
    success: true,
    message: 'FAQ deleted successfully',
  });
});

export const reorderFaqs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { faqIds } = req.body;
  const userId = req.userId!;

  if (!Array.isArray(faqIds)) {
    throw new ApiError(400, 'faqIds must be an array');
  }

  const faqs = await FaqService.reorderFaqs(gameId, userId, faqIds);

  res.json({
    success: true,
    data: faqs,
  });
});
