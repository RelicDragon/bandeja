import { format, startOfDay } from 'date-fns';
import type { Game, User } from '@/types';
import {
  passesAvailableGamePanelFilters,
  type AvailableGamePanelFilterState,
} from '@/utils/availableGamePanelFilters';
import { passesFindNoRatingFilter } from '@/utils/findDiscovery';
import {
  passesFindAvailableSlotsFilter,
  passesFindHideBarGamesFilter,
  passesFindSuitableRatingFilter,
} from '@/utils/findAvailabilityFilters';
import { filterGamesForCalendarDay } from '@/utils/calendarSelectedDayFilter';

export type FindDisplayEntityType = 'GAME' | 'TOURNAMENT' | 'TRAINING' | 'LEAGUE' | 'BAR';

export type FindFilterViewer = Pick<
  User,
  | 'id'
  | 'gender'
  | 'blockedUserIds'
  | 'favoriteTrainerId'
  | 'isAdmin'
  | 'level'
  | 'sportProfiles'
  | 'primarySport'
  | 'sportsEnabled'
  | 'approvedLevel'
> | null | undefined;

export function resolveFindFilterViewer(
  user: User | null | undefined,
  isAdmin?: boolean,
): FindFilterViewer {
  if (user) {
    return { ...user, isAdmin: Boolean(isAdmin ?? user.isAdmin) };
  }
  if (isAdmin) {
    return { isAdmin: true } as FindFilterViewer;
  }
  return user;
}

export interface FindFilterState {
  filterAvailableSlots: boolean;
  filterSuitableRating: boolean;
  hideBarGames: boolean;
  gameFilter: boolean;
  trainingFilter: boolean;
  tournamentFilter: boolean;
  leaguesFilter: boolean;
  showPrivateGames: boolean;
  findDiscoveryEnabled: boolean;
  filterNoRating: boolean;
  panel: AvailableGamePanelFilterState;
  /** When set, overrides viewer.favoriteTrainerId for training chip filter. */
  favoriteTrainerId?: string | null;
}

export type FindFilterMode = 'list' | 'calendar';

export interface FindFilterOptions {
  /**
   * `list` — LEAGUE_SEASON may pass without time set.
   * `calendar` — require timeIsSet so the game can sit on a day cell.
   */
  mode?: FindFilterMode;
  /** Stop after visibility/gender (used for calendar participant pills). */
  phase?: 'visibility' | 'full';
}

export function toFindDisplayEntityType(entityType: Game['entityType']): FindDisplayEntityType {
  return entityType === 'LEAGUE_SEASON' ? 'LEAGUE' : entityType;
}

function resolveFavoriteTrainerId(
  viewer: FindFilterViewer,
  state: FindFilterState,
): string | null | undefined {
  return state.favoriteTrainerId !== undefined
    ? state.favoriteTrainerId
    : viewer?.favoriteTrainerId;
}

function passesTimeSetGate(game: Game, mode: FindFilterMode): boolean {
  if (game.timeIsSet !== false) return true;
  if (mode === 'calendar') return false;
  return game.entityType === 'LEAGUE_SEASON';
}

function isLeagueEntity(game: Game): boolean {
  return game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON';
}

function findOrganizer(game: Game) {
  if (game.entityType === 'TRAINING') {
    return (
      (game.trainerId
        ? game.participants?.find((p) => p.userId === game.trainerId)
        : null) || game.participants?.find((p) => p.role === 'OWNER')
    );
  }
  return game.participants?.find((p) => p.role === 'OWNER');
}

/** Visibility + panel + discovery + bar + blocked + gender (shared by list + calendar). */
export function passesFindVisibilityFilter(
  game: Game,
  viewer: FindFilterViewer,
  state: FindFilterState,
  options?: Pick<FindFilterOptions, 'mode'>,
): boolean {
  const mode = options?.mode ?? 'list';
  if (!passesTimeSetGate(game, mode)) return false;

  if (!passesAvailableGamePanelFilters(game, state.panel)) return false;

  if (state.findDiscoveryEnabled) {
    if (!passesFindNoRatingFilter(game, state.filterNoRating)) return false;
  }

  if (!passesFindHideBarGamesFilter(game, state.hideBarGames)) return false;

  const organizer = findOrganizer(game);
  if (organizer && viewer?.blockedUserIds?.includes(organizer.userId)) {
    return false;
  }

  const isPublic = game.isPublic;
  const isParticipant =
    !!viewer?.id && game.participants?.some((p) => p.userId === viewer.id);
  const isLeagueGame = isLeagueEntity(game);
  const showPrivateAsAdmin = Boolean(viewer?.isAdmin && state.showPrivateGames);

  if (
    !isPublic &&
    !isParticipant &&
    !(state.leaguesFilter && isLeagueGame) &&
    !showPrivateAsAdmin
  ) {
    return false;
  }

  const genderTeams = game.genderTeams ?? 'ANY';
  if (genderTeams !== 'ANY' && viewer?.gender === 'PREFER_NOT_TO_SAY') {
    return false;
  }

  return true;
}

/** Slots + suitable rating + entity-type chips. */
export function passesFindListingFilter(
  game: Game,
  viewer: FindFilterViewer,
  state: FindFilterState,
): boolean {
  if (state.filterAvailableSlots && !passesFindAvailableSlotsFilter(game, viewer as User | null)) {
    return false;
  }

  if (state.filterSuitableRating && !passesFindSuitableRatingFilter(game, viewer as User | null)) {
    return false;
  }

  if (state.gameFilter && game.entityType !== 'GAME') return false;

  if (state.trainingFilter && game.entityType !== 'TRAINING') return false;

  if (state.trainingFilter) {
    const favoriteTrainerId = resolveFavoriteTrainerId(viewer, state);
    if (favoriteTrainerId) {
      const trainer =
        game.trainerId === favoriteTrainerId
          ? game.participants?.find((p) => p.userId === favoriteTrainerId)
          : null;
      if (!trainer) return false;
    }
  }

  if (state.tournamentFilter && game.entityType !== 'TOURNAMENT') return false;

  if (state.leaguesFilter && !isLeagueEntity(game)) return false;

  return true;
}

/** Single FindFilter Interface — list and calendar day counts must share this. */
export function passesFindFilter(
  game: Game,
  viewer: FindFilterViewer,
  state: FindFilterState,
  options?: FindFilterOptions,
): boolean {
  const phase = options?.phase ?? 'full';
  if (!passesFindVisibilityFilter(game, viewer, state, options)) return false;
  if (phase === 'visibility') return true;
  return passesFindListingFilter(game, viewer, state);
}

export interface FilterFindGamesOptions extends FindFilterOptions {
  selectedDay?: Date;
  /** List mode: drop ARCHIVED and past calendar days. Default true when mode is list. */
  listFromToday?: boolean;
}

export function filterFindGames(
  games: Game[],
  viewer: FindFilterViewer,
  state: FindFilterState,
  options?: FilterFindGamesOptions,
): Game[] {
  const mode = options?.mode ?? (options?.selectedDay ? 'calendar' : 'list');
  const listFromToday = options?.listFromToday ?? mode === 'list';

  let source = games;
  if (options?.selectedDay) {
    source = filterGamesForCalendarDay(games, options.selectedDay);
  } else if (listFromToday) {
    const today = startOfDay(new Date());
    source = games.filter((game) => {
      if (game.status === 'ARCHIVED') return false;
      if (game.timeIsSet !== false) {
        const gameDate = startOfDay(new Date(game.startTime));
        if (gameDate < today) return false;
      }
      return true;
    });
  }

  return source.filter((game) =>
    passesFindFilter(game, viewer, state, { ...options, mode }),
  );
}

export interface FindDayAggregate {
  gameCount: number;
  gameIds: string[];
  unreadCount: number;
  hasLeagueTournament: boolean;
  isUserParticipant: boolean;
  hasTraining: boolean;
  participantEntityTypes: Set<FindDisplayEntityType>;
  entityTypes: Set<FindDisplayEntityType>;
}

function emptyDayAggregate(): FindDayAggregate {
  return {
    gameCount: 0,
    gameIds: [],
    unreadCount: 0,
    hasLeagueTournament: false,
    isUserParticipant: false,
    hasTraining: false,
    participantEntityTypes: new Set(),
    entityTypes: new Set(),
  };
}

/**
 * Calendar day aggregation using the same FindFilter Interface as the list.
 * Participant pill metadata uses visibility phase (pre-slots/rating), matching prior calendar UX.
 */
export function aggregateFindGamesByDay(
  games: Game[],
  viewer: FindFilterViewer,
  state: FindFilterState,
  unreadCounts: Record<string, number> = {},
): Map<string, FindDayAggregate> {
  const dataMap = new Map<string, FindDayAggregate>();

  for (const game of games) {
    if (
      !passesFindFilter(game, viewer, state, {
        mode: 'calendar',
        phase: 'visibility',
      })
    ) {
      continue;
    }

    const gameDate = format(startOfDay(new Date(game.startTime)), 'yyyy-MM-dd');
    const isUserParticipantInGame =
      !!viewer?.id && game.participants?.some((p) => p.userId === viewer.id);

    if (isUserParticipantInGame) {
      const existing = dataMap.get(gameDate) ?? emptyDayAggregate();
      existing.participantEntityTypes.add(toFindDisplayEntityType(game.entityType));
      dataMap.set(gameDate, existing);
    }

    if (
      !passesFindFilter(game, viewer, state, {
        mode: 'calendar',
        phase: 'full',
      })
    ) {
      continue;
    }

    const existing = dataMap.get(gameDate) ?? emptyDayAggregate();
    existing.gameCount += 1;
    existing.gameIds.push(game.id);
    existing.unreadCount += unreadCounts[game.id] || 0;
    existing.entityTypes.add(toFindDisplayEntityType(game.entityType));

    if (
      game.entityType === 'TOURNAMENT' ||
      game.entityType === 'LEAGUE' ||
      game.entityType === 'LEAGUE_SEASON'
    ) {
      existing.hasLeagueTournament = true;
    }
    if (game.entityType === 'TRAINING') {
      existing.hasTraining = true;
    }
    if (isUserParticipantInGame) {
      existing.isUserParticipant = true;
    }

    dataMap.set(gameDate, existing);
  }

  return dataMap;
}
