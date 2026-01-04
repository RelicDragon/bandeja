import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { FaqService } from '../services/faq/faq.service';

export const getGameFaqs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const faqs = await FaqService.getFaqsByGameId(gameId);

  res.json({
    success: true,
    data: faqs,
  });
});

export const createFaq = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, question, answer, order } = req.body;
  const userId = req.userId!;

  if (!gameId || !question || !answer) {
    return res.status(400).json({
      success: false,
      message: 'Game ID, question, and answer are required',
    });
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
    return res.status(400).json({
      success: false,
      message: 'faqIds must be an array',
    });
  }

  const faqs = await FaqService.reorderFaqs(gameId, userId, faqIds);

  res.json({
    success: true,
    data: faqs,
  });
});

