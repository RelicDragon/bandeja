import { format } from 'date-fns';
import type { Sport } from '@shared/sport';
import type { AchievementLeaderboardFamily } from '@shared/achievements';
import type { LeaderboardGenderFilter } from '@/components/leaderboard/leaderboardGender';
import {
  buildStructuralFilterHashPart,
  type FindStructuralApiParams,
} from '@/utils/findStructuralApiParams';

export interface AvailableGamesFilterParams {
  startDate?: Date;
  endDate?: Date;
  sport?: string;
  includeLeagues?: boolean;
  showPrivateGames?: boolean;
  cityId?: string;
  isAdmin?: boolean;
  structural?: FindStructuralApiParams;
  /** Month badge path — separate cache from day card pages. */
  indexOnly?: boolean;
  /** App UI locale for localizedText projections. */
  locale?: string;
}

export function buildAvailableGamesFilterHash(params: AvailableGamesFilterParams): string {
  const privateFlag = params.isAdmin && params.showPrivateGames ? '1' : '0';
  const sport = params.sport ?? 'primary';
  const cityId = params.cityId ?? 'no-city';
  const includeLeagues = String(!!params.includeLeagues);
  const structural = buildStructuralFilterHashPart(params.structural);
  const indexFlag = params.indexOnly ? 'i1' : 'i0';
  const locale = params.locale ?? 'en';

  if (params.startDate && params.endDate) {
    return `${cityId}-${format(params.startDate, 'yyyy-MM-dd')}-${format(params.endDate, 'yyyy-MM-dd')}-${includeLeagues}-${sport}-${privateFlag}-${structural}-${indexFlag}-${locale}`;
  }
  return `${cityId}-${includeLeagues}-${sport}-${privateFlag}-${structural}-${indexFlag}-${locale}`;
}

export function buildAvailableUpcomingFilterHash(params: Omit<AvailableGamesFilterParams, 'startDate' | 'endDate'>): string {
  const privateFlag = params.isAdmin && params.showPrivateGames ? '1' : '0';
  const sport = params.sport ?? 'primary';
  const cityId = params.cityId ?? 'no-city';
  const includeLeagues = String(!!params.includeLeagues);
  const structural = buildStructuralFilterHashPart(params.structural);
  const locale = params.locale ?? 'en';
  return `upcoming-${cityId}-${includeLeagues}-${sport}-${privateFlag}-${structural}-${locale}`;
}

export const queryKeys = {
  userStatsAll: (userId: string) => ['users', 'stats', userId] as const,
  userStats: (userId: string, sport?: Sport) =>
    ['users', 'stats', userId, sport ?? 'default'] as const,
  socialConnections: (userId: string) =>
    ['users', userId, 'socialConnections'] as const,
  followingAchievementEarnersAll: (viewerUserId: string) =>
    ['users', viewerUserId, 'achievements'] as const,
  followingAchievementEarners: (viewerUserId: string, definitionId: string) =>
    ['users', viewerUserId, 'achievements', definitionId, 'following-earners'] as const,
  achievementLeaderboard: (
    family: AchievementLeaderboardFamily,
    scope: 'city' | 'global',
    gender: LeaderboardGenderFilter,
  ) => ['rankings', 'achievements', family, scope, gender] as const,
  questionnaire: {
    all: ['questionnaire'] as const,
    status: (userId: string, sport: Sport | 'inactive') =>
      ['questionnaire', 'status', userId, sport] as const,
  },
  games: {
    all: ['games'] as const,
    /** Pass locale for fetch keys; omit locale to invalidate all locales for the user. */
    my: (userId: string, locale?: string) =>
      locale != null
        ? (['games', 'my', userId, locale] as const)
        : (['games', 'my', userId] as const),
    available: (filterHash: string) => ['games', 'available', filterHash] as const,
    availableUpcoming: (filterHash: string) => ['games', 'availableUpcoming', filterHash] as const,
    past: (userId: string, locale?: string) =>
      locale != null
        ? (['games', 'past', userId, locale] as const)
        : (['games', 'past', userId] as const),
    detail: (gameId: string, locale?: string) =>
      locale != null
        ? (['games', 'detail', gameId, locale] as const)
        : (['games', 'detail', gameId] as const),
  },
  userGameNotes: {
    all: ['userGameNotes'] as const,
    detail: (gameId: string) => ['userGameNotes', gameId] as const,
  },
  /** PRD 345 — recurring game series. */
  series: {
    all: ['series'] as const,
    mine: ['series', 'mine'] as const,
    detail: (seriesId: string) => ['series', 'detail', seriesId] as const,
    /** "Same time next week?" prompt state, keyed by the *finished* occurrence. */
    nextPrompt: (gameId: string) => ['series', 'nextPrompt', gameId] as const,
  },
  /** PRD 346 — attendance confirmation and no-show notes. */
  attendance: {
    all: ['attendance'] as const,
    game: (gameId: string) => ['attendance', 'game', gameId] as const,
    myNotes: ['attendance', 'myNotes'] as const,
    myRate: (sport?: Sport) => ['attendance', 'myRate', sport ?? 'default'] as const,
  },
  /** PRD 348 — cost split ledger. */
  gameCost: {
    all: ['gameCost'] as const,
    shares: (gameId: string) => ['gameCost', 'shares', gameId] as const,
    owed: ['gameCost', 'owed'] as const,
  },
  cities: {
    all: ['cities'] as const,
  },
  weather: {
    day: (cityId: string, date: string) => ['weather', 'day', cityId, date] as const,
    game: (gameId: string, scope = 'game') => ['weather', 'game', gameId, scope] as const,
    preview: (cityId: string, startTime: string, endTime: string, scope = 'game') =>
      ['weather', 'preview', cityId, startTime, endTime, scope] as const,
  },
  /** PRD 349 — the "Live now" rail. */
  live: {
    all: ['live'] as const,
    /** `limit` is part of the key: Find asks for 10, Home for 3. */
    games: (cityId: string | undefined, limit: number) =>
      ['live', 'games', cityId ?? 'my-city', limit] as const,
    /** One game's live summary, for the game-details Live block. */
    game: (gameId: string) => ['live', 'game', gameId] as const,
  },
  /** PRD 350 — guided first-run onboarding. */
  onboarding: {
    all: ['onboarding'] as const,
    /** Routing state — `completedAt`, resume step, "no enabled sport" flag. */
    status: ['onboarding', 'status'] as const,
    /** Follow suggestions for step 5; city + sport are part of the key. */
    suggestedUsers: (cityId: string | undefined, sport: Sport | undefined, limit: number) =>
      ['onboarding', 'suggestedUsers', cityId ?? 'my-city', sport ?? 'primary', limit] as const,
    /** Player count behind the Welcome step's social-proof line. */
    cityStats: (cityId: string) => ['onboarding', 'cityStats', cityId] as const,
  },
  /**
   * PRD 354 — the public club page. The viewer id is part of the club key: the
   * payload carries `isFavorite` / `isAdmin`, so a guest's cached page must
   * never be handed to somebody who has just signed in.
   */
  clubPage: {
    all: ['clubPage'] as const,
    club: (clubId: string, viewerId: string | undefined) =>
      ['clubPage', 'club', clubId, viewerId ?? 'guest'] as const,
    regulars: (clubId: string, viewerId: string | undefined) =>
      ['clubPage', 'regulars', clubId, viewerId ?? 'guest'] as const,
    games: (clubId: string, viewerId: string | undefined) =>
      ['clubPage', 'games', clubId, viewerId ?? 'guest'] as const,
    today: (clubId: string) => ['clubPage', 'today', clubId] as const,
  },
  /**
   * PRD 352 — the pair leaderboard. City, sport, period and sort are all part
   * of the key: the cursor offsets only mean anything inside one ordering.
   */
  pairs: {
    all: ['pairs'] as const,
    leaderboard: (
      cityId: string | undefined,
      sport: Sport | undefined,
      period: string,
      sort: string,
    ) => ['pairs', 'leaderboard', cityId ?? 'my-city', sport ?? 'primary', period, sort] as const,
    detail: (pairId: string, sport: Sport | undefined) =>
      ['pairs', 'detail', pairId, sport ?? 'primary'] as const,
    partners: (userId: string, sport: Sport | undefined) =>
      ['pairs', 'partners', userId, sport ?? 'primary'] as const,
  },
  /**
   * PRD 355 — the cosmetics shop. The catalogue key carries the category chip
   * so switching chips does not blow away the previous list, and `equipped` is
   * keyed by the *viewed* user so one player's frame is never shown on another.
   */
  shop: {
    all: ['shop'] as const,
    catalog: (kind: string) => ['shop', 'catalog', kind] as const,
    item: (goodsId: string) => ['shop', 'item', goodsId] as const,
    collection: ['shop', 'collection'] as const,
    equipped: (userIds: string[]) => ['shop', 'equipped', [...userIds].sort().join(',')] as const,
    /** Followers + following, for the gift picker. */
    giftCandidates: ['shop', 'giftCandidates'] as const,
  },
  /**
   * PRD 351 — referrals. The summary is per-viewer by construction (the
   * endpoint derives everything from the token), so the key needs no argument;
   * the public resolver is keyed by code because it is shared across viewers
   * and is safe to cache — it returns a first name and an avatar.
   */
  referral: {
    all: ['referral'] as const,
    summary: () => ['referral', 'summary'] as const,
    status: () => ['referral', 'status'] as const,
    publicReferrer: (code: string) => ['referral', 'public', code] as const,
  },
  /**
   * PRD 353 — the monthly recap. `list` backs both the Profile row and the
   * Home rail bubble, so marking a recap viewed invalidates exactly one key.
   */
  recap: {
    all: ['recap'] as const,
    list: () => ['recap', 'list'] as const,
    detail: (monthKey: string) => ['recap', 'detail', monthKey] as const,
  },
  /** PRD 357 — weather alerts for outdoor games. */
  invitePicker: {
    all: ['invitePicker'] as const,
    /** One invite-modal load: players, teams, roster and invite state (PRD 361). `nonce` is per modal open. */
    bundle: (p: {
      nonce: number;
      gameId?: string;
      cityId?: string;
      sport?: string;
      search?: string;
      slotStart?: string | null;
      slotEnd?: string | null;
      trainerOnly: boolean;
      filterIdsKey: string;
    }) =>
      [
        'invitePicker',
        'bundle',
        p.nonce,
        p.gameId ?? '',
        p.cityId ?? '',
        p.sport ?? '',
        p.search ?? '',
        p.slotStart ?? '',
        p.slotEnd ?? '',
        p.trainerOnly ? '1' : '0',
        p.filterIdsKey,
      ] as const,
  },
  /** PRD 363 / 364 — `GET /public/platform-flags`, one entry per session. */
  platformFlags: {
    all: ['platformFlags'] as const,
  },
  weatherAlerts: {
    all: ['weatherAlerts'] as const,
    game: (gameId: string) => ['weatherAlerts', 'game', gameId] as const,
    indoorAlternatives: (gameId: string) =>
      ['weatherAlerts', 'indoorAlternatives', gameId] as const,
  },
};
