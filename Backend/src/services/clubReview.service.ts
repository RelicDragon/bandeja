import type { Prisma } from '@prisma/client';
import { GameStatus, ParticipantStatus, ResultsStatus } from '@prisma/client';
import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { USER_SELECT_FIELDS } from '../utils/constants';
import {
  parseClubPhotosJson,
  isOurClubReviewPhotoPair,
  type ClubPhotoStored,
} from '../utils/clubPhotosJson';

const MAX_REVIEW_TEXT_LENGTH = 1000;
export const MAX_PHOTOS_PER_CLUB_REVIEW = 6;
/** Cap rows scanned for club detail carousel (most recent photo-bearing reviews first). */
const MAX_CLUB_REVIEW_ROWS_FOR_CAROUSEL = 800;
const CAROUSEL_FETCH_BATCH = 200;

export async function recomputeClubRating(clubId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? prisma;
  const agg = await db.clubReview.groupBy({
    by: ['clubId'],
    where: { clubId },
    _count: { id: true },
    _sum: { stars: true },
  });
  const total = agg[0]?._count?.id ?? 0;
  const sum = agg[0]?._sum?.stars ?? 0;
  const rating = total > 0 ? sum / total : null;
  await db.club.update({
    where: { id: clubId },
    data: { clubRating: rating, clubReviewCount: total },
  });
}

export async function assertEligibleForClubReview(reviewerId: string, clubId: string, gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      clubId: true,
      status: true,
      resultsStatus: true,
      participants: { where: { userId: reviewerId }, select: { status: true } },
    },
  });
  if (!game) throw new ApiError(404, 'Game not found');
  if (game.clubId !== clubId) throw new ApiError(400, 'This game is not at this club');
  if (game.status !== GameStatus.FINISHED || game.resultsStatus !== ResultsStatus.FINAL) {
    throw new ApiError(400, 'You can only review after the game is finished with final results');
  }
  const p = game.participants[0];
  if (!p || p.status !== ParticipantStatus.PLAYING) {
    throw new ApiError(403, 'Only playing participants can leave a club review for this game');
  }
}

export async function listEligibleGamesForClubReview(reviewerId: string, clubId: string) {
  return prisma.game.findMany({
    where: {
      clubId,
      status: GameStatus.FINISHED,
      resultsStatus: ResultsStatus.FINAL,
      participants: {
        some: { userId: reviewerId, status: ParticipantStatus.PLAYING },
      },
    },
    select: {
      id: true,
      name: true,
      startTime: true,
      entityType: true,
    },
    orderBy: { startTime: 'desc' },
    take: 50,
  });
}

function normalizeReviewPhotos(value: unknown): ClubPhotoStored[] {
  const parsed = parseClubPhotosJson(value);
  if (parsed.length > MAX_PHOTOS_PER_CLUB_REVIEW) {
    throw new ApiError(400, `At most ${MAX_PHOTOS_PER_CLUB_REVIEW} photos per review`);
  }
  for (const p of parsed) {
    if (!isOurClubReviewPhotoPair(p.originalUrl, p.thumbnailUrl)) {
      throw new ApiError(400, 'Invalid review photo URL');
    }
  }
  return parsed;
}

export async function createOrUpdateReview(
  clubId: string,
  gameId: string,
  reviewerId: string,
  stars: number,
  text?: string | null,
  photos?: unknown
) {
  if (stars < 1 || stars > 5 || !Number.isInteger(stars)) {
    throw new ApiError(400, 'Stars must be an integer between 1 and 5');
  }
  const trimmedText = text?.trim();
  if (trimmedText && trimmedText.length > MAX_REVIEW_TEXT_LENGTH) {
    throw new ApiError(400, `Review text must be at most ${MAX_REVIEW_TEXT_LENGTH} characters`);
  }

  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
  if (!club) throw new ApiError(404, 'Club not found');

  await assertEligibleForClubReview(reviewerId, clubId, gameId);

  const photosJson = normalizeReviewPhotos(photos ?? []);

  await prisma.$transaction(async (tx) => {
    await tx.clubReview.upsert({
      where: { reviewerId_gameId: { reviewerId, gameId } },
      create: {
        clubId,
        reviewerId,
        gameId,
        stars,
        text: trimmedText || null,
        photos: photosJson as unknown as Prisma.InputJsonValue,
      },
      update: {
        stars,
        text: trimmedText || null,
        photos: photosJson as unknown as Prisma.InputJsonValue,
        clubId,
      },
    });
    await recomputeClubRating(clubId, tx);
  });

  const review = await prisma.clubReview.findUnique({
    where: { reviewerId_gameId: { reviewerId, gameId } },
    include: { reviewer: { select: USER_SELECT_FIELDS } },
  });
  const clubRow = await prisma.club.findUnique({
    where: { id: clubId },
    select: { clubRating: true, clubReviewCount: true },
  });
  return {
    review,
    summary: {
      rating: clubRow?.clubRating ?? null,
      reviewCount: clubRow?.clubReviewCount ?? 0,
    },
  };
}

export async function getClubReviews(
  clubId: string,
  options: { page?: number; limit?: number; withTextOnly?: boolean } = {}
) {
  const { page = 1, limit = 20, withTextOnly = false } = options;
  const skip = (page - 1) * limit;

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, clubRating: true, clubReviewCount: true },
  });
  if (!club) throw new ApiError(404, 'Club not found');

  const where: { clubId: string; AND?: Array<Record<string, unknown>> } = { clubId };
  if (withTextOnly) {
    where.AND = [{ text: { not: null } }, { text: { not: '' } }];
  }

  const summary = { rating: club.clubRating, reviewCount: club.clubReviewCount };

  const [reviews, total] = await Promise.all([
    prisma.clubReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        reviewer: { select: USER_SELECT_FIELDS },
      },
    }),
    prisma.clubReview.count({ where }),
  ]);

  return { summary, reviews, total, page, limit };
}

export async function getMyReviewForClubGame(clubId: string, gameId: string, userId: string) {
  return prisma.clubReview.findFirst({
    where: { clubId, gameId, reviewerId: userId },
  });
}

export async function countReviewPhotosForUserGame(reviewerId: string, gameId: string) {
  const row = await prisma.clubReview.findUnique({
    where: { reviewerId_gameId: { reviewerId, gameId } },
    select: { photos: true },
  });
  if (!row) return 0;
  return parseClubPhotosJson(row.photos).length;
}

export async function getReviewPhotosFlattenedForCarousel(clubId: string): Promise<ClubPhotoStored[]> {
  const emptyJson = [] as unknown as Prisma.InputJsonValue;
  const seen = new Set<string>();
  const out: ClubPhotoStored[] = [];
  let skip = 0;
  while (skip < MAX_CLUB_REVIEW_ROWS_FOR_CAROUSEL) {
    const take = Math.min(CAROUSEL_FETCH_BATCH, MAX_CLUB_REVIEW_ROWS_FOR_CAROUSEL - skip);
    const rows = await prisma.clubReview.findMany({
      where: {
        clubId,
        NOT: { photos: { equals: emptyJson } },
      },
      select: { photos: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      for (const ph of parseClubPhotosJson(row.photos)) {
        if (!isOurClubReviewPhotoPair(ph.originalUrl, ph.thumbnailUrl)) continue;
        if (!seen.has(ph.originalUrl)) {
          seen.add(ph.originalUrl);
          out.push(ph);
        }
      }
    }
    skip += rows.length;
    if (rows.length < take) break;
  }
  return out;
}
