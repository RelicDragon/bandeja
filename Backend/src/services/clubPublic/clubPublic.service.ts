/**
 * PRD 354 — public club page read model.
 *
 * Everything here is read-only and guest-safe. Nothing in this module may return
 * a raw `Club` row: the only way out is `projectPublicClub`.
 */
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { parseClubPhotosJson } from '../../utils/clubPhotosJson';
import { getReviewPhotosFlattenedForCarousel } from '../clubReview.service';
import {
  PUBLIC_CLUB_SELECT,
  projectPublicClub,
  type PublicClubPayload,
} from './clubPublic.projection';

export type PublicClubViewer = {
  userId?: string | null;
};

/**
 * `GET /clubs/:id/public`.
 *
 * Inactive clubs are treated as missing: the page is shareable, and a delisted
 * venue should read as "not available" rather than render a stale landing page.
 */
export async function getPublicClub(
  clubId: string,
  viewer: PublicClubViewer,
): Promise<PublicClubPayload> {
  const club = await prisma.club.findFirst({
    where: { id: clubId, isActive: true },
    select: PUBLIC_CLUB_SELECT,
  });

  if (!club) {
    throw new ApiError(404, 'errors.clubs.notFound', true, { code: 'clubs.notFound' });
  }

  const viewerId = viewer.userId?.trim() || null;

  const [reviewPhotos, favorite, adminRow] = await Promise.all([
    getReviewPhotosFlattenedForCarousel(clubId).catch(() => []),
    viewerId
      ? prisma.userFavoriteClub.findUnique({
          where: { userId_clubId: { userId: viewerId, clubId } },
          select: { id: true },
        })
      : Promise.resolve(null),
    viewerId
      ? prisma.clubAdmin.findUnique({
          where: { userId_clubId: { userId: viewerId, clubId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const photos = parseClubPhotosJson(club.photos);
  const systemUrls = new Set(photos.map((p) => p.originalUrl));
  const carouselPhotos = [
    ...photos,
    ...reviewPhotos.filter((p) => !systemUrls.has(p.originalUrl)),
  ];

  return projectPublicClub(club, {
    photos,
    carouselPhotos,
    isFavorite: favorite != null,
    isAdmin: adminRow != null,
  });
}
