import type { BasicUser, PriceCurrency, WeatherSummary } from './index';

/**
 * Derived payloads attached to Home / Find / My game cards by
 * `Backend/src/services/game/availableGamesEnrichment.ts` (CONTRACT §5.6).
 *
 * Enrichment fans out with `.catch(() => null)`, so **every** field here is
 * optional on `Game` and may be `null`. Render nothing when it is missing —
 * never a placeholder or an error state.
 *
 * These shapes are the contract between the backend enrichment and six feature
 * PRDs. Changing a field means changing the backend projection in the same
 * change.
 */

/* ------------------------------------------------------------------ */
/* PRD 346 — attendance                                                */
/* ------------------------------------------------------------------ */

/** Mirrors the Prisma `ParticipantAttendance` enum. */
export type ParticipantAttendance = 'UNANSWERED' | 'CONFIRMED' | 'UNSURE';

export interface AttendanceSummaryEntry {
  userId: string;
  attendance: ParticipantAttendance;
}

/**
 * Feeds the organizer strip ("2 of 4 confirmed") and the card right-rail
 * avatar dots. Informative only — nothing here ever gates a seat.
 */
export interface AttendanceSummary {
  /** PLAYING participants who answered CONFIRMED. */
  confirmedCount: number;
  /** PLAYING participants who answered UNSURE. */
  unsureCount: number;
  /** PLAYING participants who have not answered yet. */
  unansweredCount: number;
  /** Denominator for the "3/4" fraction: PLAYING participants. */
  playingCount: number;
  /** The viewer's own answer, or `null` when the viewer is not PLAYING here. */
  viewerAttendance: ParticipantAttendance | null;
  /** Roster-ordered dots for the avatar stack. Omitted on list payloads that only need counts. */
  entries?: AttendanceSummaryEntry[];
}

/* ------------------------------------------------------------------ */
/* PRD 347 — spot opened                                               */
/* ------------------------------------------------------------------ */

/** Why a PLAYING seat was freed. */
export type SpotOpenedCause = 'LEAVE' | 'KICK' | 'INVITE_DECLINED' | 'SUBSTITUTION' | 'CAPACITY_INCREASE';

/**
 * The seat-opened event as the socket delivers it. The card itself only needs
 * `Game.spotOpenedAt` (CONTRACT §5.6); this richer shape drives the queue panel
 * and the roster slide-in.
 */
export interface SpotOpenedInfo {
  /** How many PLAYING seats were freed by this event. */
  freedCount: number;
  cause: SpotOpenedCause;
  /** ISO timestamp — equal to `Game.lastSeatOpenedAt` after the event. */
  lastSeatOpenedAt: string;
}

/* ------------------------------------------------------------------ */
/* PRD 348 — cost split                                                */
/* ------------------------------------------------------------------ */

/**
 * Per-player share shown on the card price row ("10 € per player") before the
 * full Cost card is loaded. Absent when the game has no known total.
 */
export interface PerHeadPrice {
  /** One player's share in minor units (cents). Never converted between currencies. */
  amountCents: number;
  /** The game's own currency. */
  currency: PriceCurrency;
  /** The total the share was derived from, in minor units. */
  totalCents: number;
  /** How many payers the total was divided by (PLAYING count, payer included). */
  payerCount: number;
  /**
   * `true` while the roster can still move the share, `false` once
   * `Game.costFrozenAt` is set. Drives the "≈" prefix and the lock icon.
   */
  estimated: boolean;
}

/* ------------------------------------------------------------------ */
/* PRD 345 — recurring series                                          */
/* ------------------------------------------------------------------ */

export type GameSeriesCadence = 'WEEKLY' | 'BIWEEKLY';

/** Feeds the `↻ Weekly` card pill and the "Part of …" line on game details. */
export interface SeriesCardLabel {
  seriesId: string;
  /** Organizer-given name, e.g. "Tuesday Regulars". */
  name: string;
  cadence: GameSeriesCadence;
  /** ISO-8601 weekday: 1 = Monday … 7 = Sunday. Format with the user's locale, never hard-coded. */
  weekday: number;
  /** Start time in the club's local zone, `HH:mm`. */
  startTimeLocal: string;
  /** 1-based position of this occurrence in the series ("12th week"); omitted when not computed. */
  occurrenceNumber?: number;
  /** Set once the series status is ENDED — suppresses every "next week?" prompt. */
  endedAt?: string | null;
}

/* ------------------------------------------------------------------ */
/* PRD 349 — live now rail                                             */
/* ------------------------------------------------------------------ */

/** One side (team) of the active match, as the rail score block renders it. */
export interface LiveGameSummarySide {
  /** 1 or 2 — matches `GameTeam.teamNumber`. */
  teamNumber: number;
  /** Players on this side, in display order. */
  players: BasicUser[];
  /** Completed set scores for this side, oldest first; index-aligned with the other side. */
  setScores: number[];
  /** Current game score exactly as the sport renders it: "40", "AD", "6". */
  currentGameScore: string;
  /** `true` for the side currently ahead (sets, then games). Drives the leading-side glow. */
  leading: boolean;
}

/** Compact live score for one in-progress game. Only the active match is carried. */
export interface LiveGameSummary {
  matchId: string;
  /** Court label for the active match, when the game has courts linked. */
  courtName?: string | null;
  /** 1-based index of the set in progress. */
  currentSet: number;
  /** Exactly two sides, side 1 first. */
  sides: [LiveGameSummarySide, LiveGameSummarySide];
  /** ISO timestamp the match started — renders "Started 23 min ago". */
  startedAt?: string | null;
  /** Monotonic revision so a late socket frame never overwrites a newer score. */
  revision?: number;
}

/* ------------------------------------------------------------------ */
/* PRD 357 — weather alerts                                            */
/* ------------------------------------------------------------------ */

/** Severity classes from `weatherRisk.ts`; `none` means no pill is drawn. */
export type WeatherRiskSeverity = 'none' | 'likely' | 'heavy' | 'storm';

/** Rain / wind risk for an outdoor game starting within 48 h. */
export interface WeatherRisk {
  severity: WeatherRiskSeverity;
  /** Precipitation probability at `at`, 0–100. */
  pop: number;
  /** Sustained wind at `at`, km/h. */
  windKph: number;
  /** ISO timestamp the forecast sample applies to — normally the game start. */
  at: string;
  /**
   * `true` once the organizer chose "Keep as planned"
   * (`Game.weatherAlertState.keepAsPlannedAt`). The pill turns neutral grey and
   * no further alert is sent.
   */
  keptAsPlanned?: boolean;
}

/* ------------------------------------------------------------------ */
/* The enrichment payload itself                                       */
/* ------------------------------------------------------------------ */

/**
 * **The** list of fields `GET /games/available/enrichment` can attach to a card
 * — the single source of truth mirrored by
 * `Backend/src/services/game/availableGamesEnrichment.ts#AvailableGameEnrichFields`.
 *
 * `Game` extends this, the client-side merge
 * (`utils/attachAvailableGamesEnrichment.ts`) iterates
 * {@link GAME_CARD_ENRICHMENT_KEYS}, and the card memo signature
 * (`utils/gameCardPropsEqual.ts`) covers each field, so adding a field here is
 * the only edit a new card surface needs on the type side.
 *
 * Every field is optional and may be `null`: enrichment fans out with
 * `.catch(() => null)` on the backend, an absent key means "no change" and
 * `null` means "explicitly nothing". Render nothing when it is missing — never
 * a placeholder or an error state.
 */
export interface GameCardEnrichment {
  /** The viewer's private note on this game. */
  userNote?: string | null;
  /** Forecast chip payload for the card right rail. */
  weatherSummary?: WeatherSummary | null;
  /** Emoji reactions left on the card. */
  reactions?: Array<{ userId: string; emoji: string }>;
  /** PRD 347 — set while the "Spot opened" pill window (2 h) is still open. */
  spotOpenedAt?: string | null;
  /** PRD 349 — compact live score for the Live now rail. */
  liveSummary?: LiveGameSummary | null;
  /** PRD 357 — rain / wind risk pill for outdoor games within 48 h. */
  weatherRisk?: WeatherRisk | null;
  /** PRD 348 — derived per-player share for the card price row. */
  perHeadPrice?: PerHeadPrice | null;
  /** PRD 345 — `↻ Weekly` card pill and series link. */
  seriesLabel?: SeriesCardLabel | null;
  /** PRD 346 — confirmed / not-yet counts for the right rail. */
  attendanceSummary?: AttendanceSummary | null;
}

/**
 * Runtime mirror of `keyof GameCardEnrichment`, in wire order.
 *
 * `satisfies` rejects a key that is not on the contract;
 * {@link AllEnrichmentKeysListed} rejects a contract field that is missing from
 * this array. Both directions matter: the merge copies exactly these keys, so
 * an unlisted field would be fetched over the wire and silently dropped.
 */
export const GAME_CARD_ENRICHMENT_KEYS = [
  'userNote',
  'weatherSummary',
  'reactions',
  'spotOpenedAt',
  'liveSummary',
  'weatherRisk',
  'perHeadPrice',
  'seriesLabel',
  'attendanceSummary',
] as const satisfies readonly (keyof GameCardEnrichment)[];

export type GameCardEnrichmentKey = (typeof GAME_CARD_ENRICHMENT_KEYS)[number];

/** Fails to compile with `T` named in the error when `T` is not `never`. */
type AssertNever<T extends never> = T;

/**
 * Compile-time proof that {@link GAME_CARD_ENRICHMENT_KEYS} covers every field
 * of {@link GameCardEnrichment}. Add a field to the contract without adding its
 * key above and this line fails, naming the field you forgot.
 */
export type AllEnrichmentKeysListed = AssertNever<
  Exclude<keyof GameCardEnrichment, GameCardEnrichmentKey>
>;
