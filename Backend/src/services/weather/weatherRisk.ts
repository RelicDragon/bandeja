/**
 * PRD 357 — pure weather-risk classification and outdoor detection.
 *
 * Nothing in this file touches the database, the network or the clock. Every
 * decision the weather-alert feature makes about *whether* a game is at risk is
 * made here so it can be unit tested against fixtures.
 *
 * **Noise control is the feature.** Two rules are load-bearing and must never be
 * "simplified away":
 *
 * 1. An indoor game is never at risk, and a game whose courts are unknown is
 *    never at risk either — {@link detectOutdoor} returns `known: false` and
 *    every caller must treat that as "no alert, no pill", not as a neutral or
 *    "no data" state.
 * 2. A second alert is only justified when the severity *class* rose — see
 *    {@link severityRose}. Re-alerting on a 61 % → 64 % wobble is spam.
 */

/** Severity classes, ordered. `none` means "do not alert and do not badge". */
export type WeatherRiskSeverity = 'none' | 'likely' | 'heavy' | 'storm';

/** Monotonic rank used for the "did it get worse?" comparison. */
export const WEATHER_SEVERITY_RANK: Record<WeatherRiskSeverity, number> = {
  none: 0,
  likely: 1,
  heavy: 2,
  storm: 3,
};

// ---------------------------------------------------------------------------
// Thresholds — named constants, never inline numbers (PRD 357 user story 9).
// ---------------------------------------------------------------------------

/** Precipitation probability (%) at or above which rain counts as "likely". */
export const WEATHER_RISK_POP_THRESHOLD = 60;
/** Precipitation rate (mm/h) at or above which rain counts as "likely". */
export const WEATHER_RISK_PRECIP_MM_THRESHOLD = 1;
/** Wind (km/h) at or above which wind alone puts a game at risk. */
export const WEATHER_RISK_WIND_KPH_THRESHOLD = 40;

/** Probability (%) at or above which rain is classed `heavy` rather than `likely`. */
export const WEATHER_RISK_HEAVY_POP_THRESHOLD = 85;
/** Rate (mm/h) at or above which rain is classed `heavy`. */
export const WEATHER_RISK_HEAVY_PRECIP_MM_THRESHOLD = 4;
/** Wind (km/h) at or above which the window is classed `storm`. */
export const WEATHER_RISK_STORM_WIND_KPH_THRESHOLD = 60;
/** Rate (mm/h) at or above which the window is classed `storm`. */
export const WEATHER_RISK_STORM_PRECIP_MM_THRESHOLD = 8;

/** How far ahead a card pill is allowed to appear. */
export const WEATHER_RISK_CARD_HORIZON_HOURS = 48;

/** First alert window: start time this many hours away (inclusive bounds). */
export const WEATHER_FIRST_ALERT_MIN_HOURS = 11.5;
export const WEATHER_FIRST_ALERT_MAX_HOURS = 12.5;
/** Second alert window; only fires when the severity class rose. */
export const WEATHER_SECOND_ALERT_MIN_HOURS = 1.5;
export const WEATHER_SECOND_ALERT_MAX_HOURS = 2.5;

/** Open-Meteo condition keys that are a storm regardless of the numbers. */
const STORM_CONDITION_KEYS = new Set(['thunderstorm']);

/** One hour of forecast, narrowed to the fields the classifier reads. */
export interface WeatherRiskHour {
  /** ISO timestamp of the hour. */
  time: string;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  /** Open-Meteo condition key; only `thunderstorm` changes the outcome. */
  conditionKey?: string | null;
}

/** The classifier's verdict for one game window. */
export interface WeatherRiskAssessment {
  severity: WeatherRiskSeverity;
  /** Peak precipitation probability across the window, 0–100. */
  pop: number;
  /** Peak wind across the window, km/h. */
  windKph: number;
  /** Peak precipitation rate across the window, mm/h. */
  precipitationMm: number;
  /** ISO time of the hour that drove the verdict (the window start when `none`). */
  at: string;
  /** `true` when wind, not rain, is the reason — drives the slate/amber split. */
  windDriven: boolean;
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function severityForHour(hour: WeatherRiskHour): WeatherRiskSeverity {
  const pop = finiteOrZero(hour.precipitationProbability);
  const mm = finiteOrZero(hour.precipitationMm);
  const wind = finiteOrZero(hour.windSpeedKmh);

  if (
    (hour.conditionKey != null && STORM_CONDITION_KEYS.has(hour.conditionKey)) ||
    wind >= WEATHER_RISK_STORM_WIND_KPH_THRESHOLD ||
    mm >= WEATHER_RISK_STORM_PRECIP_MM_THRESHOLD
  ) {
    return 'storm';
  }
  if (pop >= WEATHER_RISK_HEAVY_POP_THRESHOLD || mm >= WEATHER_RISK_HEAVY_PRECIP_MM_THRESHOLD) {
    return 'heavy';
  }
  if (
    pop >= WEATHER_RISK_POP_THRESHOLD ||
    mm >= WEATHER_RISK_PRECIP_MM_THRESHOLD ||
    wind >= WEATHER_RISK_WIND_KPH_THRESHOLD
  ) {
    return 'likely';
  }
  return 'none';
}

/**
 * Classifies a game window. The window is the *whole* game — a shower that only
 * covers the second hour still puts the game at risk.
 *
 * An empty window (no forecast for those hours) is `none`, which the callers
 * read as "show nothing" rather than "no data".
 */
export function classifyWeatherRisk(hours: readonly WeatherRiskHour[]): WeatherRiskAssessment {
  if (hours.length === 0) {
    return {
      severity: 'none',
      pop: 0,
      windKph: 0,
      precipitationMm: 0,
      at: '',
      windDriven: false,
    };
  }

  let worst: WeatherRiskHour = hours[0];
  let worstSeverity: WeatherRiskSeverity = severityForHour(hours[0]);
  let pop = finiteOrZero(hours[0].precipitationProbability);
  let windKph = finiteOrZero(hours[0].windSpeedKmh);
  let precipitationMm = finiteOrZero(hours[0].precipitationMm);

  for (const hour of hours.slice(1)) {
    const severity = severityForHour(hour);
    if (WEATHER_SEVERITY_RANK[severity] > WEATHER_SEVERITY_RANK[worstSeverity]) {
      worstSeverity = severity;
      worst = hour;
    }
    pop = Math.max(pop, finiteOrZero(hour.precipitationProbability));
    windKph = Math.max(windKph, finiteOrZero(hour.windSpeedKmh));
    precipitationMm = Math.max(precipitationMm, finiteOrZero(hour.precipitationMm));
  }

  // The banner and the pill colour on *why*: only call it wind-driven when rain
  // on its own would not have crossed any threshold.
  const rainWouldAlert =
    pop >= WEATHER_RISK_POP_THRESHOLD || precipitationMm >= WEATHER_RISK_PRECIP_MM_THRESHOLD;
  const windWouldAlert = windKph >= WEATHER_RISK_WIND_KPH_THRESHOLD;

  return {
    severity: worstSeverity,
    pop: Math.round(pop),
    windKph: Math.round(windKph),
    precipitationMm,
    at: worstSeverity === 'none' ? hours[0].time : worst.time,
    windDriven: worstSeverity !== 'none' && windWouldAlert && !rainWouldAlert,
  };
}

/** `true` when `next` is a genuinely worse class than `previous`. */
export function severityRose(
  previous: WeatherRiskSeverity | null | undefined,
  next: WeatherRiskSeverity,
): boolean {
  const before = previous ? WEATHER_SEVERITY_RANK[previous] ?? 0 : 0;
  return WEATHER_SEVERITY_RANK[next] > before;
}

/** `true` when the class is worth an alert or a pill at all. */
export function isAlertableSeverity(severity: WeatherRiskSeverity): boolean {
  return WEATHER_SEVERITY_RANK[severity] >= WEATHER_SEVERITY_RANK.likely;
}

// ---------------------------------------------------------------------------
// Outdoor detection
// ---------------------------------------------------------------------------

/** The only court field that matters here. */
export interface CourtIndoorFlag {
  isIndoor: boolean;
}

export interface OutdoorDetectionInput {
  /** Courts linked through `GameCourt`, in order. */
  gameCourts: readonly CourtIndoorFlag[];
  /** `Game.court`, when the game has a single primary court. */
  primaryCourt?: CourtIndoorFlag | null;
  /** Active courts of the game's club — the fallback when no court is linked. */
  clubActiveCourts?: readonly CourtIndoorFlag[];
}

export type OutdoorDetectionSource = 'courts' | 'clubMajority' | 'unknown';

export interface OutdoorDetection {
  /** `true` only when we positively know at least one court is outdoor. */
  outdoor: boolean;
  /**
   * `false` when we cannot tell. **Never alert and never badge when this is
   * `false`** — an unknown court is not a safe "probably outdoor".
   */
  known: boolean;
  source: OutdoorDetectionSource;
  /** Outdoor courts actually linked to the game (0 when the source is the club). */
  outdoorCourtCount: number;
  /** Courts actually linked to the game (0 when the source is the club). */
  totalCourtCount: number;
}

const UNKNOWN_DETECTION: OutdoorDetection = {
  outdoor: false,
  known: false,
  source: 'unknown',
  outdoorCourtCount: 0,
  totalCourtCount: 0,
};

/**
 * Decides whether a game is played outdoors.
 *
 * Order: linked `GameCourt` rows and `Game.court` first (any `isIndoor === false`
 * makes the game outdoor, which is what the multi-court "1 of 2 courts outdoor"
 * copy counts); if the game has no court at all, the club's **active** courts
 * decide by strict majority; a tie or an empty club is `unknown`.
 */
export function detectOutdoor(input: OutdoorDetectionInput): OutdoorDetection {
  const linked: CourtIndoorFlag[] = [...input.gameCourts];
  if (input.primaryCourt && linked.length === 0) {
    linked.push(input.primaryCourt);
  }

  if (linked.length > 0) {
    const outdoorCourtCount = linked.filter((court) => court.isIndoor === false).length;
    return {
      outdoor: outdoorCourtCount > 0,
      known: true,
      source: 'courts',
      outdoorCourtCount,
      totalCourtCount: linked.length,
    };
  }

  const clubCourts = input.clubActiveCourts ?? [];
  if (clubCourts.length === 0) {
    return UNKNOWN_DETECTION;
  }

  const outdoor = clubCourts.filter((court) => court.isIndoor === false).length;
  const indoor = clubCourts.length - outdoor;
  if (outdoor === indoor) {
    // No majority either way — stay quiet rather than guess.
    return UNKNOWN_DETECTION;
  }

  return {
    outdoor: outdoor > indoor,
    known: true,
    source: 'clubMajority',
    outdoorCourtCount: 0,
    totalCourtCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Alert windows (pure time math; the scheduler injects `now`)
// ---------------------------------------------------------------------------

export type WeatherAlertWindow = 'first' | 'second';

const HOUR_MS = 60 * 60 * 1000;

/** Milliseconds-from-now bounds for an alert window, for building a Prisma range. */
export function alertWindowBounds(window: WeatherAlertWindow, now: Date): {
  from: Date;
  to: Date;
} {
  const [minHours, maxHours] =
    window === 'first'
      ? [WEATHER_FIRST_ALERT_MIN_HOURS, WEATHER_FIRST_ALERT_MAX_HOURS]
      : [WEATHER_SECOND_ALERT_MIN_HOURS, WEATHER_SECOND_ALERT_MAX_HOURS];
  return {
    from: new Date(now.getTime() + minHours * HOUR_MS),
    to: new Date(now.getTime() + maxHours * HOUR_MS),
  };
}

/** `true` when `startTime` sits inside the given alert window relative to `now`. */
export function isInAlertWindow(
  window: WeatherAlertWindow,
  startTime: Date,
  now: Date,
): boolean {
  const { from, to } = alertWindowBounds(window, now);
  const t = startTime.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

// ---------------------------------------------------------------------------
// Persisted alert state (`Game.weatherAlertState`)
// ---------------------------------------------------------------------------

/**
 * Restart-safe dedupe record. The in-memory reminder `Set`s in
 * `GameStatusScheduler` are lost on deploy; this is not, which is why it lives
 * on the row.
 */
export interface WeatherAlertState {
  /** Severity class of the last alert that was actually sent. */
  severity: WeatherRiskSeverity;
  /** ISO timestamps of every alert sent for this game, oldest first. */
  sentAt: string[];
  /** Set when the organizer chose "Keep as planned"; suppresses the 2 h alert. */
  keepAsPlannedAt?: string;
  /** ISO timestamp of the last scheduler pass over this game. */
  lastEvaluatedAt: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isSeverity(value: unknown): value is WeatherRiskSeverity {
  return typeof value === 'string' && value in WEATHER_SEVERITY_RANK;
}

/** Parses the Json column defensively — a malformed blob reads as "nothing sent yet". */
export function parseWeatherAlertState(value: unknown): WeatherAlertState | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isSeverity(raw.severity)) return null;
  return {
    severity: raw.severity,
    sentAt: isStringArray(raw.sentAt) ? raw.sentAt : [],
    ...(typeof raw.keepAsPlannedAt === 'string' ? { keepAsPlannedAt: raw.keepAsPlannedAt } : {}),
    lastEvaluatedAt:
      typeof raw.lastEvaluatedAt === 'string' ? raw.lastEvaluatedAt : new Date(0).toISOString(),
  };
}

export interface AlertDecisionInput {
  window: WeatherAlertWindow;
  severity: WeatherRiskSeverity;
  state: WeatherAlertState | null;
}

export type AlertDecisionReason =
  | 'send'
  | 'belowThreshold'
  | 'alreadySent'
  | 'keptAsPlanned'
  | 'severityUnchanged';

/**
 * The whole anti-spam rule in one place.
 *
 * - "Keep as planned" silences **every** later alert for the game, whichever
 *   window is being evaluated. The card pill and the details banner run on a
 *   48 h horizon, so an organizer can (and does) tap it hours before the 12 h
 *   pass ever runs.
 * - First window: send once, when the class is at least `likely`.
 * - Second window: send only when the class **rose** above the one already sent.
 */
export function decideAlert(input: AlertDecisionInput): {
  send: boolean;
  reason: AlertDecisionReason;
} {
  if (!isAlertableSeverity(input.severity)) {
    return { send: false, reason: 'belowThreshold' };
  }

  if (input.state?.keepAsPlannedAt) {
    return { send: false, reason: 'keptAsPlanned' };
  }

  const sentCount = input.state?.sentAt.length ?? 0;

  if (input.window === 'first') {
    if (sentCount > 0) return { send: false, reason: 'alreadySent' };
    return { send: true, reason: 'send' };
  }

  if (sentCount === 0) {
    // The 12 h pass never fired (game created late, or the forecast only turned
    // bad inside 12 h). Treat this as the first alert.
    return { send: true, reason: 'send' };
  }
  if (!severityRose(input.state?.severity, input.severity)) {
    return { send: false, reason: 'severityUnchanged' };
  }
  return { send: true, reason: 'send' };
}

/** Builds the next persisted state. `sentAtIso` is omitted when nothing was sent. */
export function nextWeatherAlertState(params: {
  previous: WeatherAlertState | null;
  severity: WeatherRiskSeverity;
  now: Date;
  sent: boolean;
}): WeatherAlertState {
  const { previous, severity, now, sent } = params;
  const sentAt = previous?.sentAt ? [...previous.sentAt] : [];
  if (sent) sentAt.push(now.toISOString());
  return {
    // Only a sent alert moves the recorded class — otherwise a transient dip
    // would let the same class alert twice.
    severity: sent ? severity : previous?.severity ?? 'none',
    sentAt,
    ...(previous?.keepAsPlannedAt ? { keepAsPlannedAt: previous.keepAsPlannedAt } : {}),
    lastEvaluatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// The whole per-game decision, as one pure function
// ---------------------------------------------------------------------------

export type WeatherEvaluationSkip = 'indoorOrUnknown' | 'noForecast';

export interface GameWeatherEvaluationInput {
  window: WeatherAlertWindow;
  detection: OutdoorDetection;
  hours: readonly WeatherRiskHour[];
  state: WeatherAlertState | null;
  now: Date;
}

export interface GameWeatherEvaluation {
  /** Non-null when the game was skipped before any forecast was considered. */
  skip: WeatherEvaluationSkip | null;
  assessment: WeatherRiskAssessment | null;
  send: boolean;
  reason: AlertDecisionReason | null;
  /** `true` for the 2 h "forecast got worse" copy. */
  escalated: boolean;
  /** The blob to persist, or `null` when the game was skipped. */
  nextState: WeatherAlertState | null;
}

/**
 * Everything the scheduler decides about one game, with no I/O. The service
 * supplies the rows; this decides. Keeping it separate is what lets the
 * scheduler behaviour be tested against a fixed clock without a database.
 */
export function evaluateGameWeather(
  input: GameWeatherEvaluationInput,
): GameWeatherEvaluation {
  const { window, detection, hours, state, now } = input;

  if (!detection.known || !detection.outdoor) {
    return {
      skip: 'indoorOrUnknown',
      assessment: null,
      send: false,
      reason: null,
      escalated: false,
      nextState: null,
    };
  }

  if (hours.length === 0) {
    return {
      skip: 'noForecast',
      assessment: null,
      send: false,
      reason: null,
      escalated: false,
      nextState: null,
    };
  }

  const assessment = classifyWeatherRisk(hours);
  const decision = decideAlert({ window, severity: assessment.severity, state });
  const escalated = decision.send && window === 'second' && (state?.sentAt.length ?? 0) > 0;

  return {
    skip: null,
    assessment,
    send: decision.send,
    reason: decision.reason,
    escalated,
    nextState: nextWeatherAlertState({
      previous: state,
      severity: assessment.severity,
      now,
      sent: decision.send,
    }),
  };
}
