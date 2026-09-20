import api from './axios';
import type { ApiResponse, Sport } from '@/types';
import type { StorySegment } from './stories';

/**
 * PRD 353 — monthly recap story and share card.
 *
 * The payload the backend stores is deliberately **language-free**: no month
 * name, no formatted percentage, no pluralised noun. Everything user-facing is
 * formatted here with `Intl` for the active locale, so a user who switches
 * language never sees a stale English month.
 */

export type RecapVariant = 'FULL' | 'LOW_ACTIVITY';

export type RecapSlideKind =
  | 'COVER'
  | 'GAMES'
  | 'WINS'
  | 'LEVEL'
  | 'PARTNER'
  | 'STREAK'
  | 'CLUB'
  | 'LOW_ACTIVITY'
  | 'OUTRO';

export type RecapPartner = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  wins: number;
  games: number;
};

export type RecapClub = {
  clubId: string;
  name: string;
  avatar: string | null;
  games: number;
};

export type RecapLevel = {
  before: number;
  after: number;
  /** Negative is normal. The copy stays neutral — see `recap.level.neutral`. */
  delta: number;
  points: number[];
};

export type RecapSportGroup = {
  sport: Sport;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  winRatePct: number | null;
  playedDays: number[];
  level: RecapLevel | null;
  partner: RecapPartner | null;
  club: RecapClub | null;
};

export type RecapOwner = {
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  isPremium: boolean;
};

export type RecapTotals = {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  winRatePct: number | null;
  playedDays: number[];
  clubs: number;
  partners: number;
};

export type RecapSlide = {
  key: string;
  kind: RecapSlideKind;
  sport: Sport | null;
  /** Unchecked by default in the share sheet. Only a level drop sets this. */
  sensitive: boolean;
};

export type MonthlyRecapPayload = {
  version: number;
  monthKey: string;
  monthStart: string;
  daysInMonth: number;
  /** Monday-based index (0 = Monday) of the 1st, for the dot calendar. */
  weekdayOffset: number;
  variant: RecapVariant;
  sports: RecapSportGroup[];
  totals: RecapTotals;
  streak: { weeks: number; best: number } | null;
  owner: RecapOwner;
  slides: RecapSlide[];
};

/** One slide's slice of the recap, carried by a `MONTHLY_RECAP` story segment. */
export type RecapSegmentPayload = {
  monthKey: string;
  monthStart: string;
  slideKey: string;
  kind: RecapSlideKind;
  sport: Sport | null;
  sports: Sport[];
  variant: RecapVariant;
  sensitive: boolean;
  owner: RecapOwner;
  totals?: RecapTotals;
  games?: {
    count: number;
    daysInMonth: number;
    weekdayOffset: number;
    playedDays: number[];
  };
  wins?: { wins: number; losses: number; ties: number; games: number; winRatePct: number };
  level?: RecapLevel;
  partner?: RecapPartner;
  streak?: { weeks: number; best: number };
  club?: RecapClub;
};

export type MonthlyRecapDto = {
  monthKey: string;
  payload: MonthlyRecapPayload;
  viewedAt: string | null;
  sharedAt: string | null;
  sharedSlideKeys: string[];
  createdAt: string;
};

export type MonthlyRecapCard = {
  monthKey: string;
  monthStart: string;
  games: number;
  winRatePct: number | null;
  variant: RecapVariant;
  viewedAt: string | null;
  sharedAt: string | null;
};

export type MonthlyRecapListResponse = {
  recaps: MonthlyRecapCard[];
  /** The newest recap the owner has not opened yet — the Home rail bubble. */
  unviewed: MonthlyRecapCard | null;
};

export type MonthlyRecapDetail = {
  recap: MonthlyRecapDto;
  segments: StorySegment[];
};

export type RecapShareResult = {
  storyId: string;
  sharedSlideKeys: string[];
  segmentKeys: string[];
  expiresAt: string;
};

export type RecapExportResult = {
  imageUrl: string;
  width: number;
  height: number;
};

export const recapApi = {
  list: async (): Promise<MonthlyRecapListResponse> => {
    const response = await api.get<ApiResponse<MonthlyRecapListResponse>>('/users/me/recaps');
    return response.data.data;
  },

  get: async (monthKey: string): Promise<MonthlyRecapDetail> => {
    const response = await api.get<ApiResponse<MonthlyRecapDetail>>(
      `/users/me/recaps/${encodeURIComponent(monthKey)}`,
    );
    return response.data.data;
  },

  markViewed: async (monthKey: string): Promise<{ viewedAt: string }> => {
    const response = await api.post<ApiResponse<{ viewedAt: string }>>(
      `/users/me/recaps/${encodeURIComponent(monthKey)}/viewed`,
    );
    return response.data.data;
  },

  share: async (monthKey: string, slideKeys: string[]): Promise<RecapShareResult> => {
    const response = await api.post<ApiResponse<RecapShareResult>>(
      `/users/me/recaps/${encodeURIComponent(monthKey)}/share`,
      { slideKeys },
    );
    return response.data.data;
  },

  exportCard: async (monthKey: string): Promise<RecapExportResult> => {
    const response = await api.post<ApiResponse<RecapExportResult>>(
      `/users/me/recaps/${encodeURIComponent(monthKey)}/export`,
    );
    return response.data.data;
  },
};
