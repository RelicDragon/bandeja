import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { formatSportLabel } from '../shared/notificationSport';
import { getUserDisplayName } from '../../utils/systemMessages';

const GAME_FOR_PHOTO_SELECT = {
  id: true,
  sport: true,
  name: true,
  clubId: true,
  cityId: true,
  club: { select: { name: true } },
  court: { select: { name: true } },
  city: { select: { name: true } },
  outcomes: {
    select: {
      userId: true,
      isWinner: true,
      position: true,
    },
  },
  participants: {
    where: { status: 'PLAYING' as const },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          originalAvatar: true,
        },
      },
    },
  },
} as const;

export type GamePhotoArtifactContext = Awaited<
  ReturnType<typeof loadGameForResultsPhoto>
>;

export async function loadGameForResultsPhoto(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    select: GAME_FOR_PHOTO_SELECT,
  });
}

function toPublicAvatarUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const key = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const domain = config.aws.cloudFrontDomain.replace(/^https?:\/\//, '');
  return `https://${domain}/${key}`;
}

export function collectParticipantAvatarUrls(game: NonNullable<GamePhotoArtifactContext>): string[] {
  const urls: string[] = [];
  for (const p of game.participants) {
    const path = p.user?.originalAvatar || p.user?.avatar;
    const url = toPublicAvatarUrl(path);
    if (url) urls.push(url);
    if (urls.length >= 8) break;
  }
  return urls;
}

export function buildResultsPhotoPrompt(game: NonNullable<GamePhotoArtifactContext>): string {
  const sportLabel = formatSportLabel(game.sport ?? Sport.PADEL, 'en-GB');
  const venue =
    game.club?.name ||
    game.court?.name ||
    game.city?.name ||
    'the venue';
  const gameTitle = game.name?.trim() || `${sportLabel} session`;

  const winners = game.outcomes
    .filter((o) => o.isWinner)
    .map((o) => {
      const participant = game.participants.find((p) => p.userId === o.userId);
      const user = participant?.user;
      return user
        ? getUserDisplayName(user.firstName, user.lastName)
        : null;
    })
    .filter((n): n is string => Boolean(n));

  const winnerLine =
    winners.length > 0
      ? `Celebrate the winners: ${winners.join(', ')}.`
      : 'Friendly group celebrating after the match.';

  return [
    `Candid group photo after a ${sportLabel} game at ${venue} (${gameTitle}).`,
    winnerLine,
    'Natural smiles, casual sportswear, warm daylight, photorealistic, not staged.',
    'No text overlays, no logos, no watermarks.',
  ].join(' ');
}
