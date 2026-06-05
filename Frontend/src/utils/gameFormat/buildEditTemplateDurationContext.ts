import type { CreateTemplateDurationContext } from '@/components/createGame/createTemplateDurationLabels';
import type { CreateTemplateId } from '@/sport/createFlow';
import type { UseGameFormatResult } from '@/hooks/useGameFormat';
import type { Game } from '@/types';
import type { Sport } from '@shared/sport';
import { getDisplayLevelForSport } from '@/utils/profileSports';
import type { User } from '@/types';

export function buildEditTemplateDurationContext(
  game: Game,
  sport: Sport,
  formatMaxParticipants: number,
  playersPerMatch: 2 | 4,
  gameFormat: UseGameFormatResult,
  selectedTemplateId: CreateTemplateId | null,
  user: User | null,
): CreateTemplateDurationContext {
  const participantLevels = (game.participants ?? [])
    .map((p) => getDisplayLevelForSport(p.user, sport))
    .filter((l): l is number => typeof l === 'number' && !Number.isNaN(l));

  return {
    sport,
    maxParticipants: formatMaxParticipants,
    playersPerMatch,
    selectedCourtCount: game.gameCourts?.length ?? 0,
    creatorLevel: user ? getDisplayLevelForSport(user, sport) : 2,
    playerLevelRange: [game.minLevel ?? 1, game.maxLevel ?? 7],
    invitedLevels: participantLevels,
    selectedTemplateId,
    liveScoringPreset: gameFormat.scoringPreset,
    liveMatchTimedCapMinutes: gameFormat.matchTimedCapMinutes,
    liveMatchTimerEnabled: gameFormat.matchTimerEnabled,
    liveCustomPointsTotal: gameFormat.customPointsTotal,
  };
}
