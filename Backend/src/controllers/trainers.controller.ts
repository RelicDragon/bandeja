import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import * as trainerReviewService from '../services/trainerReview.service';

export const getTrainerReviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { trainerId } = req.params;
  const page = parseInt(String(req.query.page), 10) || 1;
  const limit = Math.min(parseInt(String(req.query.limit), 10) || 20, 50);
  const withTextOnly = req.query.withTextOnly === 'true';

  const result = await trainerReviewService.getTrainerReviews(trainerId, {
    page,
    limit,
    withTextOnly,
  });

  res.json({
    success: true,
    data: result,
  });
});
