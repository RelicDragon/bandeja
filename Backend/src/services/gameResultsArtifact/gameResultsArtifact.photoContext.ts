import { Gender, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { formatSportLabel } from '../shared/notificationSport';
import {
  resolveParticipantAvatarSources,
  toPublicAvatarUrl,
  type ParticipantAvatarSources,
} from './gameResultsArtifact.avatarInput';
import type { ResultsPhotoStyle } from './gameResultsArtifact.photoStyles';

export { toPublicAvatarUrl };
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
          gender: true,
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

export type { ParticipantAvatarSources };

export const PHOTO_PARTICIPANT_MAX = 8;

export type PhotoParticipantSlot = {
  position: number;
  userId: string;
  displayName: string;
  initials: string;
  gender: Gender;
  avatarSources: ParticipantAvatarSources | null;
};

export function getUserInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  const a = firstName?.trim()?.[0] ?? '';
  const b = lastName?.trim()?.[0] ?? '';
  const initials = `${a}${b}`.toUpperCase();
  return initials || '?';
}

export function genderLabelForPhotoPrompt(gender: Gender): string {
  switch (gender) {
    case Gender.MALE:
      return 'male';
    case Gender.FEMALE:
      return 'female';
    default:
      return 'person';
  }
}

function outcomePositionByUserId(
  outcomes: NonNullable<GamePhotoArtifactContext>['outcomes']
): Map<string, number> {
  const map = new Map<string, number>();
  for (const outcome of outcomes) {
    if (
      outcome.position == null ||
      outcome.position < 1 ||
      outcome.position > PHOTO_PARTICIPANT_MAX ||
      map.has(outcome.userId)
    ) {
      continue;
    }
    map.set(outcome.userId, outcome.position);
  }
  return map;
}

function ordinalPlace(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : mod10 === 1
        ? 'st'
        : mod10 === 2
          ? 'nd'
          : mod10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

/** PLAYING participants only, ordered by outcome rank when present (max 8). */
export function getRankedPhotoParticipants(
  game: NonNullable<GamePhotoArtifactContext>
): PhotoParticipantSlot[] {
  const rankByUserId = outcomePositionByUserId(game.outcomes);

  type PlayingEntry = {
    userId: string;
    user: NonNullable<(typeof game.participants)[number]['user']>;
    sortRank: number;
    joinIndex: number;
  };

  const playing: PlayingEntry[] = [];
  let joinIndex = 0;
  for (const participant of game.participants) {
    const user = participant.user;
    if (!user) continue;
    const outcomeRank = rankByUserId.get(participant.userId);
    playing.push({
      userId: participant.userId,
      user,
      sortRank: outcomeRank ?? PHOTO_PARTICIPANT_MAX + joinIndex,
      joinIndex: joinIndex++,
    });
  }

  playing.sort((a, b) => a.sortRank - b.sortRank || a.joinIndex - b.joinIndex);

  return playing.slice(0, PHOTO_PARTICIPANT_MAX).map((entry, index) => ({
    position: index + 1,
    userId: entry.userId,
    displayName: getUserDisplayName(entry.user.firstName, entry.user.lastName),
    initials: getUserInitials(entry.user.firstName, entry.user.lastName),
    gender: entry.user.gender ?? Gender.PREFER_NOT_TO_SAY,
    avatarSources: resolveParticipantAvatarSources(entry.user),
  }));
}

export function collectParticipantAvatarSources(
  game: NonNullable<GamePhotoArtifactContext>
): ParticipantAvatarSources[] {
  return getRankedPhotoParticipants(game)
    .map((slot) => slot.avatarSources)
    .filter((s): s is ParticipantAvatarSources => s !== null);
}

export function buildParticipantReferenceOrderBlock(
  slots: PhotoParticipantSlot[],
  loadedBySlotIndex: boolean[]
): string {
  if (slots.length === 0) return '';

  let refNum = 0;
  const lines = slots.map((slot, index) => {
    if (loadedBySlotIndex[index]) {
      refNum += 1;
      return `Position ${slot.position} (${slot.displayName}): use attached reference image ${refNum}.`;
    }
    const gender = genderLabelForPhotoPrompt(slot.gender);
    return `Position ${slot.position} (${slot.displayName}): no reference image; invent a stylized ${gender} character whose face is a round balloon displaying the initials "${slot.initials}".`;
  });

  const n = slots.length;
  const lastPlace = ordinalPlace(n);
  return [
    `Exactly ${n} distinct people in the image — no additional characters, no crowd, no spectators, no duplicate faces.`,
    `Participants are arranged in strict finishing-order (1st place first through ${lastPlace}).`,
    'Attached portrait references follow that same order — do not swap, reorder, or mix faces between positions.',
    ...lines,
  ].join(' ');
}

function resolveVenue(game: NonNullable<GamePhotoArtifactContext>): string {
  return (
    game.club?.name ||
    game.court?.name ||
    game.city?.name ||
    'the venue'
  );
}

function buildWinnerLine(game: NonNullable<GamePhotoArtifactContext>): string {
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

  return winners.length > 0
    ? `Celebrate the winners: ${winners.join(', ')}.`
    : 'Friendly group celebrating after the match.';
}

export function buildResultsPhotoScene(
  game: NonNullable<GamePhotoArtifactContext>,
  style: ResultsPhotoStyle
): string {
  const sportLabel = formatSportLabel(game.sport ?? Sport.PADEL, 'en-GB');
  const venue = resolveVenue(game);
  const gameTitle = game.name?.trim() || `${sportLabel} session`;
  const winnerLine = buildWinnerLine(game);

  if (style.fantasySetting) {
    return [
      `Celebratory group portrait after a ${sportLabel} match.`,
      winnerLine,
      `Celebrating a win they earned at ${venue}.`,
    ].join(' ');
  }

  return [
    `Celebratory group portrait after a ${sportLabel} game at ${venue} (${gameTitle}).`,
    winnerLine,
  ].join(' ');
}

export function buildResultsPhotoGuardrails(
  style: ResultsPhotoStyle,
  sportLabel: string
): string {
  if (style.family === 'illustration') {
    return [
      'Stylized illustrated group portrait celebrating after the match — not a photograph.',
      'No photorealism, no DSLR or phone-camera look, no film grain, no realistic skin pores.',
      "Use the attached portrait references for each person's face, hair, and skin tone;",
      'render everyone in the same illustration style.',
      `Cheerful mood, casual sportswear appropriate for ${sportLabel}.`,
      'No text overlays, no logos, no watermarks, no copyrighted characters.',
    ].join(' ');
  }

  return [
    'Stylized cinematic concept-art group portrait — dramatized movie-poster energy, not documentary sports photography.',
    'Not a candid phone photo from a real padel court, not stock-photo realism, not news photography.',
    "Keep each person's face recognizable from the attached portrait references (likeness, hair, skin tone).",
    'Costumes and environment may be sci-fi, retro, or historical; faces stay consistent with references.',
    'Outfits may be spacesuits, retro fashion, or sci-fi gear; open visors or no helmets when suits are used.',
    'No text overlays, no logos, no watermarks, no copyrighted characters or franchise names.',
  ].join(' ');
}

export function buildResultsPhotoPrompt(
  game: NonNullable<GamePhotoArtifactContext>,
  style: ResultsPhotoStyle,
  slots: PhotoParticipantSlot[],
  loadedBySlotIndex: boolean[]
): string {
  const sportLabel = formatSportLabel(game.sport ?? Sport.PADEL, 'en-GB');
  const participantOrder = buildParticipantReferenceOrderBlock(slots, loadedBySlotIndex);
  return [
    buildResultsPhotoScene(game, style),
    style.prompt,
    participantOrder,
    buildResultsPhotoGuardrails(style, sportLabel),
  ]
    .filter(Boolean)
    .join(' ');
}
