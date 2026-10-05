/**
 * Court-reservation vocabulary: slot state / summary kind / reschedule
 * outcome → i18n key, tone and icon. Time params are ISO instants; the UI
 * formats them in the club's timezone (see `timeParams`).
 *
 * i18n keys (namespace `courtReservation.*`, proposed English):
 *   courtReservation.slot.planned              "Planned"
 *   courtReservation.slot.reported             "Reserved"
 *   courtReservation.slot.linked               "Reserved · {{provider}}"
 *   courtReservation.slot.unknownTime          "Reserved · {{provider}} · time unknown"
 *   courtReservation.slot.gap                  "Gap {{from}}–{{to}}"
 *   courtReservation.summary.planned           "Planned"
 *   courtReservation.summary.partial           "{{reserved}} of {{total}} reserved"
 *   courtReservation.summary.reserved          "All courts reserved"
 *   courtReservation.summary.reservedWithGap   "Reserved, gap at {{time}}"
 *   courtReservation.reschedule.unchanged      "No change"
 *   courtReservation.reschedule.keep           "Keep reservation"
 *   courtReservation.reschedule.move           "Move reservation"
 *   courtReservation.reschedule.extend         "Extend reservation"
 *   courtReservation.reschedule.switch_court   "Switch court"
 *   courtReservation.reschedule.blocked        "Court not available"
 *   courtReservation.reschedule.manual         "Ask the club"
 *   courtReservation.blocker.club              "The club has {{court}} reserved at {{time}}."
 *   courtReservation.blocker.hold              "The club is holding {{court}} at {{time}}."
 *   courtReservation.blocker.game              "{{name}} has {{court}} at {{time}}."
 *   courtReservation.blocker.gameUnnamed       "Another game has {{court}} at {{time}}."
 *   courtReservation.blocker.plannedGame       "{{name}} is planned on {{court}} at {{time}}."
 *   courtReservation.blocker.plannedGameUnnamed "Another game is planned on {{court}} at {{time}}."
 *
 * Provider names: `{{provider}}` receives the display name from
 * {@link providerDisplayName} (brand names, not translated).
 */
import type { CourtSlotView, ReservationSummary, ReservationSummaryKind } from './courtReservations';
import type { OccupancyBlock, SlotOutcome } from './planReschedule';
import { parseInstantMs } from './coverageIntervals';

export type ReservationTone = 'neutral' | 'warning' | 'success' | 'danger';

export type ReservationCopy = {
  i18nKey: string;
  tone: ReservationTone;
  /** Tabler icon id (without the `Icon` prefix), e.g. `calendar-check`. */
  icon: string;
  params: Record<string, string | number>;
  /** Names of `params` that hold ISO instants the UI must format. */
  timeParams: string[];
};

export const COURT_RESERVATION_I18N_KEYS = {
  slot: {
    planned: 'courtReservation.slot.planned',
    reported: 'courtReservation.slot.reported',
    linked: 'courtReservation.slot.linked',
    unknownTime: 'courtReservation.slot.unknownTime',
    gap: 'courtReservation.slot.gap',
  },
  summary: {
    planned: 'courtReservation.summary.planned',
    partial: 'courtReservation.summary.partial',
    reserved: 'courtReservation.summary.reserved',
    reservedWithGap: 'courtReservation.summary.reservedWithGap',
  },
  reschedule: {
    unchanged: 'courtReservation.reschedule.unchanged',
    keep: 'courtReservation.reschedule.keep',
    move: 'courtReservation.reschedule.move',
    extend: 'courtReservation.reschedule.extend',
    switch_court: 'courtReservation.reschedule.switch_court',
    blocked: 'courtReservation.reschedule.blocked',
    manual: 'courtReservation.reschedule.manual',
  },
  blocker: {
    club: 'courtReservation.blocker.club',
    hold: 'courtReservation.blocker.hold',
    game: 'courtReservation.blocker.game',
    gameUnnamed: 'courtReservation.blocker.gameUnnamed',
    plannedGame: 'courtReservation.blocker.plannedGame',
    plannedGameUnnamed: 'courtReservation.blocker.plannedGameUnnamed',
  },
} as const;

const PROVIDER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  BOOKTIME: 'Booktime',
  PADELOO: 'Padeloo',
  KLIKTEREN: 'Klikteren',
  NSPADELSUPABASE: 'NS Padel',
  WELTNER: 'Weltner',
};

export function providerDisplayName(provider: string | null | undefined): string {
  if (!provider) return '';
  return PROVIDER_DISPLAY_NAMES[provider] ?? provider;
}

function copy(
  i18nKey: string,
  tone: ReservationTone,
  icon: string,
  params: Record<string, string | number> = {},
  timeParams: string[] = [],
): ReservationCopy {
  return { i18nKey, tone, icon, params, timeParams };
}

export type SlotCopy = {
  /** Main chip: Planned / Reserved / Reserved · Provider. */
  label: ReservationCopy;
  /** One line per gap ("Gap 11:00–11:30"); empty when fully covered. */
  gaps: ReservationCopy[];
};

export function describeCourtSlot(
  slot: Pick<CourtSlotView, 'state' | 'provider' | 'gaps' | 'unknownTime'>,
): SlotCopy {
  const keys = COURT_RESERVATION_I18N_KEYS.slot;
  if (slot.state === 'planned') {
    return { label: copy(keys.planned, 'neutral', 'calendar-event'), gaps: [] };
  }
  if (slot.state === 'reported') {
    return { label: copy(keys.reported, 'success', 'circle-check'), gaps: [] };
  }
  const provider = providerDisplayName(slot.provider);
  if (slot.unknownTime) {
    return { label: copy(keys.unknownTime, 'warning', 'clock-question', { provider }), gaps: [] };
  }
  const hasGaps = slot.gaps.length > 0;
  return {
    label: copy(keys.linked, hasGaps ? 'warning' : 'success', 'calendar-check', { provider }),
    gaps: slot.gaps.map((g) => copy(keys.gap, 'warning', 'alert-triangle', { from: g.start, to: g.end }, ['from', 'to'])),
  };
}

export function describeReservationSummary(summary: ReservationSummary): ReservationCopy {
  const keys = COURT_RESERVATION_I18N_KEYS.summary;
  switch (summary.kind) {
    case 'planned':
      return copy(keys.planned, 'neutral', 'calendar-event');
    case 'partial':
      return copy(keys.partial, 'warning', 'calendar-half', { reserved: summary.reserved, total: summary.total });
    case 'reserved':
      return copy(keys.reserved, 'success', 'circle-check');
    case 'reserved_with_gap':
      return copy(keys.reservedWithGap, 'warning', 'alert-triangle', { time: summary.earliestGap.start }, ['time']);
  }
}

/** Tone/icon only, for compact badges that have just the kind. */
export function reservationSummaryTone(kind: ReservationSummaryKind): ReservationTone {
  return kind === 'reserved' ? 'success' : kind === 'planned' ? 'neutral' : 'warning';
}

const OUTCOME_COPY: Readonly<Record<SlotOutcome, { tone: ReservationTone; icon: string }>> = {
  unchanged: { tone: 'neutral', icon: 'check' },
  keep: { tone: 'success', icon: 'circle-check' },
  move: { tone: 'neutral', icon: 'arrows-right-left' },
  extend: { tone: 'neutral', icon: 'arrows-horizontal' },
  switch_court: { tone: 'warning', icon: 'replace' },
  blocked: { tone: 'danger', icon: 'ban' },
  manual: { tone: 'warning', icon: 'phone' },
};

export function describeRescheduleOutcome(outcome: SlotOutcome): ReservationCopy {
  const meta = OUTCOME_COPY[outcome];
  return copy(COURT_RESERVATION_I18N_KEYS.reschedule[outcome], meta.tone, meta.icon);
}

const BLOCKER_PRIORITY: Readonly<Record<OccupancyBlock['kind'], number>> = {
  club: 0,
  hold: 1,
  app_game_reserved: 2,
  app_game_planned: 3,
};

/**
 * The block to name when a court is not free: the one that starts first
 * inside the window (ties: club booking, then hold, then another game).
 * A clash's blocks can include rounding-only blocks; the caller passes the
 * window the game itself needs, so the named blocker is the real one.
 */
export function primaryBlocker(
  blocks: readonly OccupancyBlock[],
  window?: { start: string; end: string } | null,
): OccupancyBlock | null {
  const ws = window ? parseInstantMs(window.start) : null;
  const we = window ? parseInstantMs(window.end) : null;
  const scored = blocks
    .map((block) => ({ block, s: parseInstantMs(block.start), e: parseInstantMs(block.end) }))
    .filter((b): b is { block: OccupancyBlock; s: number; e: number } => b.s != null && b.e != null);
  const inside = ws != null && we != null ? scored.filter((b) => b.s < we && b.e > ws) : scored;
  const pool = inside.length > 0 ? inside : scored;
  pool.sort(
    (a, b) =>
      Math.max(a.s, ws ?? a.s) - Math.max(b.s, ws ?? b.s) ||
      BLOCKER_PRIORITY[a.block.kind] - BLOCKER_PRIORITY[b.block.kind],
  );
  return pool[0]?.block ?? null;
}

/**
 * "The club has Court 1 reserved at 19:30" — names what actually holds the
 * court. `time` is when it starts being taken inside the window (ISO).
 */
export function describeBlocker(
  block: OccupancyBlock,
  courtName: string,
  window?: { start: string } | null,
): ReservationCopy {
  const keys = COURT_RESERVATION_I18N_KEYS.blocker;
  const blockStart = parseInstantMs(block.start);
  const windowStart = window ? parseInstantMs(window.start) : null;
  const time =
    blockStart != null && windowStart != null && windowStart > blockStart ? (window as { start: string }).start : block.start;
  const name = block.label?.trim() ?? '';
  const params = { court: courtName, time, ...(name ? { name } : {}) };
  switch (block.kind) {
    case 'club':
      return copy(keys.club, 'danger', 'ban', params, ['time']);
    case 'hold':
      return copy(keys.hold, 'danger', 'ban', params, ['time']);
    case 'app_game_reserved':
      return copy(name ? keys.game : keys.gameUnnamed, 'danger', 'ban', params, ['time']);
    case 'app_game_planned':
      return copy(name ? keys.plannedGame : keys.plannedGameUnnamed, 'warning', 'alert-triangle', params, ['time']);
  }
}
