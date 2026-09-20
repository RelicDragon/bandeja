import api from './axios';
import type { Game } from '@/types';

/**
 * PRD 345 — recurring game series.
 *
 * `/series/*` is the series itself; the two "same time next week?" endpoints
 * hang off a game, because the thing the user answers about is an occurrence.
 * `POST /games/:nextGameId/series-next` takes the **next** occurrence's id —
 * the same `targetId` the push action token carries — so the shade button and
 * the in-app button hit one code path.
 */

export type SeriesCadence = 'WEEKLY' | 'BIWEEKLY';
export type SeriesStatus = 'ACTIVE' | 'ENDED';
export type SeriesEditScope = 'occurrence' | 'future';

/** Hours before the start when unclaimed regular seats stop being held. */
export const SEAT_DEADLINE_CHOICES = [24, 48, 72] as const;
export type SeatDeadlineChoice = (typeof SEAT_DEADLINE_CHOICES)[number];

export interface SeriesRegularUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  isPremium?: boolean;
}

export interface SeriesRegular {
  user: SeriesRegularUser | null;
  addedAt: string;
  gamesPlayed: number;
  wins: number;
  winRate: number | null;
  attendanceRate: number | null;
  confirmedForNext: boolean;
}

export interface SeriesSkip {
  /** `YYYY-MM-DD`, club-local. */
  occurrenceDate: string;
  undoable: boolean;
}

export interface SeriesViewerStats {
  games: number;
  winRate: number | null;
  streakWeeks: number;
}

export interface SeriesNextOccurrenceSummary {
  gameId: string;
  startTime: string;
  occurrenceDate: string;
  seatDeadlineAt: string;
  confirmedCount: number;
  regularCount: number;
  viewerIsPlaying: boolean;
}

export interface SeriesSummary {
  id: string;
  name: string;
  entityType: string;
  cadence: SeriesCadence;
  /** ISO-8601: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** `HH:mm`, club-local. */
  startTimeLocal: string;
  durationMinutes: number;
  horizonDays: number;
  seatDeadlineHours: number;
  endsOn: string | null;
  status: SeriesStatus;
  groupChannelId: string | null;
  clubId: string | null;
  courtIds: string[];
  timezone: string;
  createdAt: string;
  endedAt: string | null;
  owner: SeriesRegularUser | null;
  isOwner: boolean;
  occurrenceCount: number;
}

export interface SeriesDetail {
  series: SeriesSummary;
  upcoming: Game[];
  past: Game[];
  /** Dates inside the horizon that the scheduler has not materialised yet. */
  plannedDayKeys: string[];
  skips: SeriesSkip[];
  regulars: SeriesRegular[];
  stats: SeriesViewerStats;
  nextOccurrence: SeriesNextOccurrenceSummary | null;
}

export interface SeriesListItem {
  id: string;
  name: string;
  cadence: SeriesCadence;
  weekday: number;
  startTimeLocal: string;
  status: SeriesStatus;
  endsOn: string | null;
  regularCount: number;
  nextOccurrenceAt: string | null;
}

export interface MySeriesResponse {
  series: SeriesListItem[];
  activeCount: number;
  maxActive: number;
  seatDeadlineChoices: number[];
}

export interface SeriesNextPromptRegular {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  confirmed: boolean;
}

/** PRD 345 — the card pill / "Part of X · week N" label for one occurrence. */
export interface SeriesCardLabelDto {
  seriesId: string;
  name: string;
  cadence: SeriesCadence;
  weekday: number;
  startTimeLocal: string;
  occurrenceNumber?: number;
  endedAt?: string | null;
}

/**
 * Everything the game-details series surfaces need in one round trip. Either
 * half may be null on its own: an ended series still has a `label`, and a game
 * whose series has no future occurrence has a `label` but no `next`.
 */
export interface SeriesGameContext {
  label: SeriesCardLabelDto | null;
  viewerIsOwner: boolean;
  /** The knobs the Repeat sheet edits — `label` alone would re-save defaults. */
  settings: {
    endsOn: string | null;
    seatDeadlineHours: number;
    horizonDays: number;
  };
  next: SeriesNextPrompt | null;
}

export interface SeriesNextPrompt {
  seriesId: string;
  seriesName: string;
  cadence: SeriesCadence;
  ownerId: string;
  viewerIsOwner: boolean;
  viewerIsRegular: boolean;
  nextGameId: string;
  nextStartTime: string;
  nextOccurrenceDate: string | null;
  nextClubName: string | null;
  seatDeadlineAt: string;
  confirmedCount: number;
  regularCount: number;
  viewerIsPlaying: boolean;
  regulars: SeriesNextPromptRegular[];
}

export interface CreateSeriesFromGamePayload {
  cadence: SeriesCadence;
  name?: string | null;
  endsOn?: string | null;
  seatDeadlineHours?: number;
  horizonDays?: number;
  weekday?: number;
  keepRegularUserIds?: string[];
}

export interface UpdateSeriesPayload {
  name?: string;
  cadence?: SeriesCadence;
  weekday?: number;
  startTimeLocal?: string;
  durationMinutes?: number;
  endsOn?: string | null;
  seatDeadlineHours?: number;
  horizonDays?: number;
  template?: Record<string, unknown>;
  scope?: SeriesEditScope;
  fromDayKey?: string;
}

export interface UpdateSeriesResult {
  seriesId: string;
  scope: SeriesEditScope;
  updatedGameIds: string[];
  /** Occurrences left alone because their results already started. */
  lockedGameIds: string[];
  /** Occurrences left alone because they already began. */
  startedGameIds: string[];
  rescheduled: boolean;
}

export interface EndSeriesResult {
  seriesId: string;
  deletedGameIds: string[];
  keptGameIds: string[];
}

export const seriesApi = {
  listMine: () => api.get<{ data: MySeriesResponse }>('/series'),

  getDetail: (seriesId: string, fresh = false) =>
    api.get<{ data: SeriesDetail }>(`/series/${seriesId}${fresh ? '?fresh=1' : ''}`),

  update: (seriesId: string, payload: UpdateSeriesPayload) =>
    api.patch<{ data: UpdateSeriesResult }>(`/series/${seriesId}`, payload),

  end: (seriesId: string) =>
    api.post<{ data: EndSeriesResult }>(`/series/${seriesId}/end`),

  skipOccurrence: (seriesId: string, occurrenceDate: string) =>
    api.post<{ data: { occurrenceDate: string; deletedGameId: string | null } }>(
      `/series/${seriesId}/skips`,
      { occurrenceDate },
    ),

  undoSkip: (seriesId: string, occurrenceDate: string) =>
    api.delete<{ data: { occurrenceDate: string } }>(
      `/series/${seriesId}/skips/${occurrenceDate}`,
    ),

  addRegular: (seriesId: string, userId?: string) =>
    api.post<{ data: { userId: string; isRegular: boolean } }>(
      `/series/${seriesId}/regulars`,
      userId ? { userId } : {},
    ),

  removeRegular: (seriesId: string, userId: string) =>
    api.delete<{ data: { userId: string; isRegular: boolean } }>(
      `/series/${seriesId}/regulars/${userId}`,
    ),

  openChat: (seriesId: string) =>
    api.post<{ data: { groupChannelId: string } }>(`/series/${seriesId}/chat`),

  /** "Make this a weekly game" from an existing one-off game. */
  createFromGame: (gameId: string, payload: CreateSeriesFromGamePayload) =>
    api.post<{ data: { seriesId: string } }>(`/games/${gameId}/series`, payload),

  /** Series context for one occurrence — `null` when it is not part of a series. */
  getGameContext: (gameId: string) =>
    api.get<{ data: SeriesGameContext | null }>(`/games/${gameId}/series-next`),

  /** `gameId` is the **next** occurrence's id (see `getNextPrompt().nextGameId`). */
  respondToNext: (gameId: string, action: 'accept' | 'decline') =>
    api.post<{ data: { message: string; action: 'accept' | 'decline' } }>(
      `/games/${gameId}/series-next`,
      { action },
    ),
};
