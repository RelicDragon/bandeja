import { format, startOfDay } from 'date-fns';
import { gameStartFallsInTimeRange } from '@/utils/gameListTimeFilter';
import type { FindFilterState, FindFilterViewer } from '@/utils/findFilter';
import { getDisplayLevelForSport } from '@/utils/profileSports';
import { parseGameSport } from '@/utils/gameSport';

/** Light calendar day-index row from available meta (no fat card). */
export type FindDayIndexRow = {
  id: string;
  startTime: string;
  sport?: string;
  entityType: string;
  minLevel: number | null;
  maxLevel: number | null;
  maxParticipants: number;
  genderTeams: string | null;
  trainerId: string | null;
  clubId: string | null;
  isPublic: boolean;
  timeIsSet: boolean;
  /** Present when server index includes rating flag (discovery no-rating parity). */
  affectsRating?: boolean;
  ownerUserId: string | null;
};

/**
 * Count games per local calendar day from the cheap server dayIndex.
 * Structural filters (club / entity / level / hide BAR / open slots / timeIsSet)
 * are already applied server-side — do not re-apply them here.
 * Residual client heuristics only: time-of-day panel, suitable rating,
 * favorite trainer, blocked organizer, gender gate, discovery no-rating.
 *
 * Available-slots MIX_PAIRS gender precision stays on the fat card list only
 * (server open-slot SQL is count-based); badge vs list can differ for MIX.
 */
export function countFindDayIndexByDay(
  rows: FindDayIndexRow[],
  viewer: FindFilterViewer,
  state: FindFilterState,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.timeIsSet) continue;

    if (!(state.panel.filterTimeStart === '00:00' && state.panel.filterTimeEnd === '24:00')) {
      if (
        !gameStartFallsInTimeRange(
          row.startTime,
          state.panel.filterTimeStart,
          state.panel.filterTimeEnd,
        )
      ) {
        continue;
      }
    }

    if (state.trainingFilter) {
      const favoriteTrainerId =
        state.favoriteTrainerId !== undefined
          ? state.favoriteTrainerId
          : viewer?.favoriteTrainerId;
      if (favoriteTrainerId && row.trainerId !== favoriteTrainerId) continue;
    }

    if (row.ownerUserId && viewer?.blockedUserIds?.includes(row.ownerUserId)) continue;

    const genderTeams = row.genderTeams ?? 'ANY';
    if (genderTeams !== 'ANY' && viewer?.gender === 'PREFER_NOT_TO_SAY') continue;

    if (state.findDiscoveryEnabled && state.filterNoRating) {
      if (row.affectsRating !== false) continue;
    }

    if (state.filterSuitableRating && viewer) {
      const gameSport = parseGameSport(row.sport ?? 'PADEL');
      const userLevel = getDisplayLevelForSport(viewer as never, gameSport);
      const minLevel = row.minLevel ?? 0;
      const maxLevel = row.maxLevel ?? 10;
      if (userLevel < minLevel || userLevel > maxLevel) continue;
    }

    const key = format(startOfDay(new Date(row.startTime)), 'yyyy-MM-dd');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}
