import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import * as clubReviewService from '../services/clubReview.service';

export const getClubReviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: clubId } = req.params;
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const withTextOnly = req.query.withTextOnly === '1' || req.query.withTextOnly === 'true';

  const result = await clubReviewService.getClubReviews(clubId, { page, limit, withTextOnly });
  res.json({ success: true, data: result });
});

export const submitClubReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: clubId } = req.params;
  const userId = req.userId!;
  const { gameId, stars, text, photos } = req.body;

  const { review, summary } = await clubReviewService.createOrUpdateReview(
    clubId,
    gameId,
    userId,
    Number(stars),
    text,
    photos
  );

  res.json({ success: true, data: { review, summary } });
});

export const getMyClubReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: clubId } = req.params;
  const userId = req.userId!;
  const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : '';
  if (!gameId) {
    throw new ApiError(400, 'gameId query parameter is required');
  }
  const review = await clubReviewService.getMyReviewForClubGame(clubId, gameId, userId);
  res.json({ success: true, data: review });
});

export const getEligibleGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: clubId } = req.params;
  const userId = req.userId!;
  const games = await clubReviewService.listEligibleGamesForClubReview(userId, clubId);
  res.json({ success: true, data: games });
});
