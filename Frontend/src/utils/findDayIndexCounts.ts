import { format, startOfDay } from 'date-fns';
import { gameStartFallsInTimeRange } from '@/utils/gameListTimeFilter';
import type {
  FindDayAggregate,
  FindDisplayEntityType,
  FindFilterState,
  FindFilterViewer,
} from '@/utils/findFilter';
import { toFindDisplayEntityType } from '@/utils/findFilter';
import { getDisplayLevelForSport } from '@/utils/profileSports';
import { parseGameSport } from '@/utils/gameSport';
import { dateKeyInTimezone } from '@/utils/weatherDayGroups';

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

export type FindDayIndexDayAgg = {
  gameCount: number;
  entityTypes: Set<FindDisplayEntityType>;
  hasLeagueTournament: boolean;
  hasTraining: boolean;
};

function emptyIndexDayAgg(): FindDayIndexDayAgg {
  return {
    gameCount: 0,
    entityTypes: new Set(),
    hasLeagueTournament: false,
    hasTraining: false,
  };
}

function passesDayIndexResidualFilters(
  row: FindDayIndexRow,
  viewer: FindFilterViewer,
  state: FindFilterState,
  cityTimezone?: string | null,
): boolean {
  if (!row.timeIsSet) return false;

  if (!(state.panel.filterTimeStart === '00:00' && state.panel.filterTimeEnd === '24:00')) {
    if (
      !gameStartFallsInTimeRange(
        row.startTime,
        state.panel.filterTimeStart,
        state.panel.filterTimeEnd,
        cityTimezone,
      )
    ) {
      return false;
    }
  }

  if (state.trainingFilter) {
    const favoriteTrainerId =
      state.favoriteTrainerId !== undefined
        ? state.favoriteTrainerId
        : viewer?.favoriteTrainerId;
    if (favoriteTrainerId && row.trainerId !== favoriteTrainerId) return false;
  }

  if (row.ownerUserId && viewer?.blockedUserIds?.includes(row.ownerUserId)) return false;

  const genderTeams = row.genderTeams ?? 'ANY';
  if (genderTeams !== 'ANY' && viewer?.gender === 'PREFER_NOT_TO_SAY') return false;

  if (state.findDiscoveryEnabled && state.filterNoRating) {
    if (row.affectsRating !== false) return false;
  }

  if (state.filterSuitableRating && viewer) {
    const gameSport = parseGameSport(row.sport ?? 'PADEL');
    const userLevel = getDisplayLevelForSport(viewer as never, gameSport);
    const minLevel = row.minLevel ?? 0;
    const maxLevel = row.maxLevel ?? 10;
    if (userLevel < minLevel || userLevel > maxLevel) return false;
  }

  return true;
}

/**
 * Aggregate game counts + entity types per city calendar day from the cheap
 * server dayIndex. Used for badges and type pills when month cards truncate.
 *
 * Structural filters (club / entity / level / hide BAR / open slots / timeIsSet)
 * are already applied server-side — do not re-apply them here.
 * Residual client heuristics only: time-of-day panel, suitable rating,
 * favorite trainer, blocked organizer, gender gate, discovery no-rating.
 *
 * Available-slots MIX_PAIRS gender precision stays on the fat card list only
 * (server open-slot SQL is count-based); badge vs list can differ for MIX.
 */
export function aggregateFindDayIndexByDay(
  rows: FindDayIndexRow[],
  viewer: FindFilterViewer,
  state: FindFilterState,
  cityTimezone?: string | null,
): Map<string, FindDayIndexDayAgg> {
  const byDay = new Map<string, FindDayIndexDayAgg>();

  for (const row of rows) {
    if (!passesDayIndexResidualFilters(row, viewer, state, cityTimezone)) continue;

    const key = cityTimezone
      ? dateKeyInTimezone(new Date(row.startTime), cityTimezone)
      : format(startOfDay(new Date(row.startTime)), 'yyyy-MM-dd');

    const existing = byDay.get(key) ?? emptyIndexDayAgg();
    existing.gameCount += 1;

    const displayType = toFindDisplayEntityType(
      row.entityType as Parameters<typeof toFindDisplayEntityType>[0],
    );
    existing.entityTypes.add(displayType);
    if (
      displayType === 'TOURNAMENT' ||
      displayType === 'LEAGUE' ||
      row.entityType === 'LEAGUE_SEASON'
    ) {
      existing.hasLeagueTournament = true;
    }
    if (displayType === 'TRAINING') {
      existing.hasTraining = true;
    }

    byDay.set(key, existing);
  }

  return byDay;
}

/**
 * Overlay dayIndex counts/types onto fat-card day aggregates.
 * Count comes from index (complete under month truncate); types/flags union.
 */
export function mergeFindDayIndexIntoCardDays(
  fromCards: Map<string, FindDayAggregate>,
  indexByDay: Map<string, FindDayIndexDayAgg>,
): Map<string, FindDayAggregate> {
  const merged = new Map(fromCards);
  for (const [day, agg] of indexByDay) {
    const existing = merged.get(day);
    if (existing) {
      existing.gameCount = agg.gameCount;
      for (const t of agg.entityTypes) existing.entityTypes.add(t);
      existing.hasLeagueTournament =
        existing.hasLeagueTournament || agg.hasLeagueTournament;
      existing.hasTraining = existing.hasTraining || agg.hasTraining;
      merged.set(day, existing);
    } else {
      merged.set(day, {
        gameCount: agg.gameCount,
        gameIds: [],
        unreadCount: 0,
        hasLeagueTournament: agg.hasLeagueTournament,
        isUserParticipant: false,
        hasTraining: agg.hasTraining,
        participantEntityTypes: new Set(),
        entityTypes: new Set(agg.entityTypes),
      });
    }
  }
  return merged;
}

/** Badge counts only — thin wrapper over {@link aggregateFindDayIndexByDay}. */
export function countFindDayIndexByDay(
  rows: FindDayIndexRow[],
  viewer: FindFilterViewer,
  state: FindFilterState,
  cityTimezone?: string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [day, agg] of aggregateFindDayIndexByDay(rows, viewer, state, cityTimezone)) {
    counts.set(day, agg.gameCount);
  }
  return counts;
}
