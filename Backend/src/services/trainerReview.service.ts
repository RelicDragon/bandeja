import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { EntityType } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../utils/constants';

const MAX_REVIEW_TEXT_LENGTH = 1000;

export async function createOrUpdateReview(
  gameId: string,
  reviewerId: string,
  stars: number,
  text?: string | null
) {
  if (stars < 1 || stars > 5 || !Number.isInteger(stars)) {
    throw new ApiError(400, 'Stars must be an integer between 1 and 5');
  }
  const trimmedText = text?.trim();
  if (trimmedText && trimmedText.length > MAX_REVIEW_TEXT_LENGTH) {
    throw new ApiError(400, `Review text must be at most ${MAX_REVIEW_TEXT_LENGTH} characters`);
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, entityType: true, status: true, resultsStatus: true, trainerId: true, participants: true },
  });

  if (!game) throw new ApiError(404, 'Game not found');
  if (game.entityType !== EntityType.TRAINING) throw new ApiError(400, 'Only training games can be reviewed');
  if (game.status !== 'FINISHED' || game.resultsStatus !== 'FINAL') {
    throw new ApiError(400, 'Training must be finished before leaving a review');
  }
  if (!game.trainerId) throw new ApiError(400, 'This training has no trainer');

  const participant = game.participants.find((p) => p.userId === reviewerId && p.status === 'PLAYING');
  if (!participant) throw new ApiError(403, 'Only playing participants can review this training');
  if (game.trainerId === reviewerId) throw new ApiError(400, 'Trainer cannot review themselves');

  const trainerId = game.trainerId;

  const { review, summary } = await prisma.$transaction(async (tx) => {
    const review = await tx.trainerReview.upsert({
      where: {
        trainerId_reviewerId_gameId: { trainerId, reviewerId, gameId },
      },
      create: { trainerId, reviewerId, gameId, stars, text: trimmedText || null },
      update: { stars, text: trimmedText || null },
    });

    const agg = await tx.trainerReview.groupBy({
      by: ['trainerId'],
      where: { trainerId },
      _count: { id: true },
      _sum: { stars: true },
    });

    const total = agg[0]?._count?.id ?? 0;
    const sum = agg[0]?._sum?.stars ?? 0;
    const rating = total > 0 ? sum / total : null;

    await tx.user.update({
      where: { id: trainerId },
      data: {
        trainerRating: rating,
        trainerReviewCount: total,
      },
    });

    const summary = { rating, reviewCount: total };
    return { review, summary };
  });

  return { review, summary };
}

export async function recomputeTrainerRating(trainerId: string) {
  const agg = await prisma.trainerReview.groupBy({
    by: ['trainerId'],
    where: { trainerId },
    _count: { id: true },
    _sum: { stars: true },
  });

  const total = agg[0]?._count?.id ?? 0;
  const sum = agg[0]?._sum?.stars ?? 0;
  const rating = total > 0 ? sum / total : null;

  await prisma.user.update({
    where: { id: trainerId },
    data: {
      trainerRating: rating,
      trainerReviewCount: total,
    },
  });
}

export async function getTrainerReviewSummary(trainerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: trainerId },
    select: { trainerRating: true, trainerReviewCount: true },
  });
  if (!user) return null;
  return { rating: user.trainerRating, reviewCount: user.trainerReviewCount };
}

export async function getTrainerReviews(
  trainerId: string,
  options: { page?: number; limit?: number; withTextOnly?: boolean } = {}
) {
  const { page = 1, limit = 20, withTextOnly = false } = options;
  const skip = (page - 1) * limit;

  const where: { trainerId: string; AND?: Array<Record<string, unknown>> } = { trainerId };
  if (withTextOnly) {
    where.AND = [{ text: { not: null } }, { text: { not: '' } }];
  }

  const summary = await getTrainerReviewSummary(trainerId);
  if (summary === null) {
    throw new ApiError(404, 'Trainer not found');
  }

  const [reviews, total] = await Promise.all([
    prisma.trainerReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        reviewer: { select: USER_SELECT_FIELDS },
      },
    }),
    prisma.trainerReview.count({ where }),
  ]);

  return { summary, reviews, total, page, limit };
}

export async function getMyReviewForGame(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { trainerId: true, entityType: true },
  });
  if (!game?.trainerId || game.entityType !== EntityType.TRAINING) return null;
  return prisma.trainerReview.findUnique({
    where: {
      trainerId_reviewerId_gameId: { trainerId: game.trainerId, reviewerId: userId, gameId },
    },
  });
}
