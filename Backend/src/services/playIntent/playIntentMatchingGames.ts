import { EntityType } from '@prisma/client';

export const MATCHING_GAMES_VISIBLE_CAP = 4;

export function radarEntityTypes(intentEntityType: EntityType): EntityType[] {
  if (intentEntityType === EntityType.BAR) return [EntityType.BAR];
  return [EntityType.GAME, EntityType.TOURNAMENT];
}

export function hasOpenPlayingSlot(
  playingCount: number,
  maxParticipants: number,
): boolean {
  return Math.max(0, (maxParticipants || 0) - playingCount) > 0;
}

export function mixPairsSeatIsFree(
  genderTeams: string | null | undefined,
  viewerGender: string | null | undefined,
  playingGenders: Array<string | null | undefined>,
  maxParticipants: number,
): boolean {
  if (genderTeams !== 'MIX_PAIRS') return true;
  if (viewerGender !== 'MALE' && viewerGender !== 'FEMALE') return false;
  const maxPerGender = Math.floor(Math.max(0, maxParticipants) / 2);
  const same = playingGenders.filter((gender) => gender === viewerGender).length;
  return same < maxPerGender;
}

export type RankableMatchingGame = {
  id: string;
  allowDirectJoin: boolean;
  startTime: Date;
  openSlots: number;
  matchScore: number;
};

export function rankMatchingGames<T extends RankableMatchingGame>(
  games: T[],
  cap: number = MATCHING_GAMES_VISIBLE_CAP,
): T[] {
  return [...games]
    .sort(
      (a, b) =>
        Number(b.allowDirectJoin) - Number(a.allowDirectJoin) ||
        a.startTime.getTime() - b.startTime.getTime() ||
        b.openSlots - a.openSlots ||
        b.matchScore - a.matchScore ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, cap));
}
