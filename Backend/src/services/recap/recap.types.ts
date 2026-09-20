import type { Sport } from '@prisma/client';

/**
 * PRD 353 — the wire/storage shape of a monthly recap.
 *
 * `MonthlyRecap.payload` is this object verbatim. It is deliberately
 * **language-free**: no month name, no formatted percentage, no pluralised
 * noun. Everything user-facing is formatted on the client with `Intl` for the
 * viewer's locale and time format, so one stored payload serves all 11 locales
 * and a user who switches language never sees a stale English month.
 *
 * `version` exists because the rows are kept for 12 months: a reader must be
 * able to recognise a payload written by an older build.
 */
export const MONTHLY_RECAP_PAYLOAD_VERSION = 1;

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
  /** Matches won together inside the recap month. */
  wins: number;
  /** Matches played together inside the recap month. */
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
  /** `after - before`, rounded to 2 dp. Negative is normal and must read neutrally. */
  delta: number;
  /** Sparkline points, oldest first, always at least two entries. */
  points: number[];
};

/** One sport's numbers. A multisport recap has one group per sport played. */
export type RecapSportGroup = {
  sport: Sport;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  /** 0–100, rounded to a whole point. `null` when no decided game was played. */
  winRatePct: number | null;
  /** Day-of-month numbers (1-based) with at least one finished game. */
  playedDays: number[];
  level: RecapLevel | null;
  partner: RecapPartner | null;
  club: RecapClub | null;
};

export type RecapSlide = {
  /** Stable, unique inside one recap: `cover`, `games:PADEL`, `outro`. */
  key: string;
  kind: RecapSlideKind;
  /** `null` for slides that are not scoped to a single sport. */
  sport: Sport | null;
  /**
   * The slide is unchecked by default in the share sheet. Only a level drop
   * sets this — a bad month is the user's business, not their followers'.
   */
  sensitive: boolean;
};

export type MonthlyRecapPayload = {
  version: typeof MONTHLY_RECAP_PAYLOAD_VERSION;
  /** `YYYY-MM`. */
  monthKey: string;
  /** ISO timestamp of 00:00 on the 1st, UTC. The client formats the label. */
  monthStart: string;
  daysInMonth: number;
  /**
   * Monday-based index (0 = Monday) of the 1st, so the dot calendar can be laid
   * out without the client re-deriving the month's geometry.
   */
  weekdayOffset: number;
  variant: RecapVariant;
  /** Every sport the user finished a game in, most games first. */
  sports: RecapSportGroup[];
  totals: {
    games: number;
    wins: number;
    losses: number;
    ties: number;
    winRatePct: number | null;
    playedDays: number[];
    clubs: number;
    partners: number;
  };
  /** Consecutive play-streak weeks at the end of the month, and the personal best. */
  streak: { weeks: number; best: number } | null;
  owner: {
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    isPremium: boolean;
  };
  /** Ordered slide list. Drives the viewer, the share sheet and the segments. */
  slides: RecapSlide[];
};

/**
 * The `MONTHLY_RECAP` story-segment payload: one slide's worth of the recap.
 *
 * The viewer renders these client-side (no server images) so the numerals can
 * count up and the copy can be in the viewer's language. Each segment carries
 * only its own slice of the payload — repeating the whole recap on every slide
 * would multiply the response by the slide count for no gain.
 */
export type RecapSegmentPayload = {
  monthKey: string;
  monthStart: string;
  slideKey: string;
  kind: RecapSlideKind;
  sport: Sport | null;
  /** Every sport in the recap, so the viewer can draw the sport tab strip. */
  sports: Sport[];
  variant: RecapVariant;
  sensitive: boolean;
  owner: MonthlyRecapPayload['owner'];
  totals?: MonthlyRecapPayload['totals'];
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

/** One recap as the API returns it. */
export type MonthlyRecapDto = {
  monthKey: string;
  payload: MonthlyRecapPayload;
  viewedAt: string | null;
  sharedAt: string | null;
  sharedSlideKeys: string[];
  createdAt: string;
};

/** Compact card for the Profile → Statistics → Recaps row. */
export type MonthlyRecapCardDto = {
  monthKey: string;
  monthStart: string;
  games: number;
  winRatePct: number | null;
  variant: RecapVariant;
  viewedAt: string | null;
  sharedAt: string | null;
};
