/**
 * `find_available_slots` orchestration: pick the clubs (one club, or up to 8 active
 * `isForPlaying` clubs of a city, favorites first), run the slot engine per club, cap the
 * answer at ~12 slots grouped by club, mint a `slotRef` per slot, and suggest nearby times
 * when the requested window is empty. Club loading is injectable so tests need no DB.
 */
import type { Sport } from '@prisma/client';
import type { AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../../config/database';
import { ApiError } from '../../../../utils/ApiError';
import type { AgentPrincipal } from '../../access/agentPrincipal';
import { agentSlotsT } from '../../i18n/agentSlotsI18n';
import { formatClockInZone } from './clubTime';
import { slotSourceKind, type SlotProvider } from './providerRules';
import { mintSlotRef } from './slotRef';
import {
  computeClubSlots,
  type CandidateSlot,
  type ClubSlotsResult,
  type SlotEngineClub,
  type SlotEngineSources,
} from './slotEngine';

export const MAX_CLUBS_PER_CITY = 8;
export const MAX_SLOTS = 12;
const MAX_NEARBY = 4;

export type SlotSearchArgs = {
  clubId?: string;
  cityId?: string;
  date: string;
  timeFrom?: string;
  timeTo?: string;
  durationMinutes: number;
  courts: number;
  sport?: Sport;
  /** Only these courts of `clubId` (a court the user named). */
  courtIds?: string[];
  /** Only indoor (true) or only outdoor (false) courts. */
  indoor?: boolean;
};

export type SlotSearchClub = SlotEngineClub & { cityName: string | null };

export type SlotSearchDeps = {
  sources: SlotEngineSources;
  /** Active, `isForPlaying` clubs only; for a city, already ranked and capped. */
  loadClubs: (principal: AgentPrincipal, args: SlotSearchArgs) => Promise<SlotSearchClub[]>;
};

/** What each confidence means, sent to the model with every result (plan §14.3). */
export const SLOT_CONFIDENCE_RULES = {
  live: 'Checked with the club booking system at asOf: the courts were free then. Say it is available now; it can still be taken before booking.',
  snapshot:
    'Cached copy of the club bookings from asOf. Never call it "free": say "no known conflicts as of <asOf, club time>". The app re-checks live when booking; in Telegram tell the user to open the club page to check live.',
  app_only:
    'The club has no booking integration (or no cached data for this date): only games and holds in the app were checked. Never call it "free"; say there are no conflicts with games in the app and that the court must be booked with the club.',
} as const;

const PROVIDER_RANK: Record<string, number> = { nspadel_live: 0, weltner_live: 0, snapshot: 1, app_only: 2 };

export async function loadSlotSearchClubs(principal: AgentPrincipal, args: SlotSearchArgs): Promise<SlotSearchClub[]> {
  const cityId = args.clubId ? undefined : args.cityId ?? principal.currentCityId ?? undefined;
  if (!args.clubId && !cityId) {
    throw new ApiError(400, 'No home city set; pass cityId (see list_cities) or clubId');
  }
  if (args.courtIds?.length && !args.clubId) throw new ApiError(400, 'courtIds needs clubId');
  const rows = await prisma.club.findMany({
    where: {
      isActive: true,
      isForPlaying: true,
      ...(args.clubId ? { id: args.clubId } : { cityId }),
      ...(args.sport ? { sports: { has: args.sport } } : {}),
    },
    select: {
      id: true,
      name: true,
      openingTime: true,
      closingTime: true,
      integrationType: true,
      sports: true,
      city: { select: { name: true, timezone: true } },
      courts: {
        where: {
          isActive: true,
          ...(args.sport ? { OR: [{ sport: null }, { sport: args.sport }] } : {}),
          ...(args.courtIds?.length ? { id: { in: args.courtIds } } : {}),
          ...(args.indoor != null ? { isIndoor: args.indoor } : {}),
        },
        select: { id: true, name: true, externalCourtId: true, isIndoor: true, sport: true },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  if (args.clubId && rows.length === 0) throw new ApiError(404, 'Club not found');
  if (!args.sport) assertSingleSport(rows);

  const favorites = new Set(
    args.clubId
      ? []
      : (
          await prisma.userFavoriteClub.findMany({
            where: { userId: principal.userId, club: { cityId } },
            select: { clubId: true },
          })
        ).map((row) => row.clubId),
  );
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      cityName: row.city?.name ?? null,
      timeZone: row.city?.timezone || 'UTC',
      openingTime: row.openingTime,
      closingTime: row.closingTime,
      provider: (row.integrationType ?? 'NONE') as SlotProvider,
      courts: row.courts.map(({ sport: _sport, ...court }) => court),
    }))
    .sort(
      (a, b) =>
        Number(favorites.has(b.id)) - Number(favorites.has(a.id)) ||
        PROVIDER_RANK[slotSourceKind(a.provider)] - PROVIDER_RANK[slotSourceKind(b.provider)] ||
        a.name.localeCompare(b.name),
    )
    .slice(0, MAX_CLUBS_PER_CITY);
}

/**
 * Without `sport`, a club with courts for several sports would offer whichever court sorts
 * first (a tennis court for a padel game). The model must take the sport from the game or
 * the conversation, or ask.
 */
export function assertSingleSport(clubs: Array<{ sports: Sport[]; courts: Array<{ sport: Sport | null }> }>): void {
  const sports = new Set<Sport>();
  for (const club of clubs) {
    const courtSports = club.courts.map((court) => court.sport).filter((sport): sport is Sport => sport != null);
    for (const sport of courtSports.length ? courtSports : club.sports) sports.add(sport);
  }
  if (sports.size > 1) {
    throw new ApiError(
      400,
      `sport is required: these courts are for ${[...sports].join(', ')}. Use the sport of the game being booked (get_game "sport") or the one the conversation is about; if that is unclear, ask the user which sport, then call again with sport.`,
    );
  }
}

export function confidenceNote(result: Pick<ClubSlotsResult, 'confidence' | 'asOf' | 'snapshotMissing'>, timeZone: string, locale: string): string {
  if (result.confidence === 'live') return agentSlotsT(locale, 'note.live');
  if (result.confidence === 'snapshot' && result.asOf) {
    return `${agentSlotsT(locale, 'note.snapshot', { time: formatClockInZone(result.asOf, timeZone) })}. ${agentSlotsT(locale, 'note.checkLive')}`;
  }
  return agentSlotsT(locale, result.snapshotMissing ? 'note.snapshotMissing' : 'note.appOnly');
}

/** Chronological, at most `MAX_SLOTS`, and every club with slots keeps a fair share. */
function pickSlots(perClub: CandidateSlot[][]): CandidateSlot[] {
  const withSlots = perClub.filter((slots) => slots.length > 0);
  if (withSlots.length === 0) return [];
  const perClubCap = Math.max(2, Math.ceil(MAX_SLOTS / withSlots.length));
  return withSlots
    .flatMap((slots) => slots.slice(0, perClubCap))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, MAX_SLOTS);
}

type SlotDto = {
  slotRef: string;
  date: string;
  start: string;
  end: string;
  startIso: string;
  endIso: string;
  courts: Array<{ name: string; indoor: boolean }>;
  /** Not in this slotRef; to book one of them, search again with courtIds. */
  otherFreeCourts?: Array<{ name: string; indoor: boolean }>;
  softConflicts?: number;
};

export async function findAvailableSlots(
  ctx: { principal: AgentPrincipal; locale: string; now: Date },
  args: SlotSearchArgs,
  deps: SlotSearchDeps,
): Promise<{ data: unknown; summary: string; entities: AgentEntityRef[] }> {
  const clubs = await deps.loadClubs(ctx.principal, args);
  if (clubs.length === 0) {
    return {
      data: {
        clubs: [],
        suggestion: 'No active clubs for playing match this search. Try search_clubs / list_cities, another city, or drop the sport filter.',
      },
      summary: agentSlotsT(ctx.locale, 'summary.none'),
      entities: [],
    };
  }

  const request = {
    date: args.date,
    timeFrom: args.timeFrom,
    timeTo: args.timeTo,
    durationMinutes: args.durationMinutes,
    courts: args.courts,
    now: ctx.now,
  };
  const results = await Promise.all(clubs.map((club) => computeClubSlots(club, request, deps.sources)));
  const byClub = new Map(clubs.map((club) => [club.id, club]));

  const inWindow = pickSlots(results.map((result) => result.slots.filter((slot) => slot.inWindow)));
  const hasWindow = Boolean(args.timeFrom || args.timeTo);
  let nearby: CandidateSlot[] = [];
  if (inWindow.length === 0 && hasWindow) {
    // Nearest starts to the requested window, from the same day's candidates.
    nearby = results
      .flatMap((result) => result.slots)
      .sort((a, b) => a.windowDistance - b.windowDistance || a.start.getTime() - b.start.getTime())
      .slice(0, MAX_NEARBY)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  const shown = inWindow.length > 0 ? inWindow : nearby;
  const refs = new Map<CandidateSlot, string>();
  for (const slot of shown) {
    refs.set(
      slot,
      mintSlotRef(
        {
          clubId: slot.clubId,
          courtIds: slot.courtIds,
          start: slot.start.toISOString(),
          durationMinutes: args.durationMinutes,
          provider: slot.provider,
          userId: ctx.principal.userId,
        },
        { now: ctx.now },
      ),
    );
  }

  const toDto = (slot: CandidateSlot): SlotDto => ({
    slotRef: refs.get(slot)!,
    date: slot.localDate,
    start: slot.localTime,
    end: formatClockInZone(slot.end, slot.timeZone),
    startIso: slot.start.toISOString(),
    endIso: slot.end.toISOString(),
    courts: slot.courtNames.map((name, index) => ({ name, indoor: slot.courtIndoor[index] ?? false })),
    ...(slot.otherFreeCourts.length > 0 ? { otherFreeCourts: slot.otherFreeCourts } : {}),
    ...(slot.softConflicts > 0 ? { softConflicts: slot.softConflicts } : {}),
  });

  const clubGroups = results.map((result) => {
    const club = byClub.get(result.clubId)!;
    const slots = shown.filter((slot) => slot.clubId === result.clubId);
    return {
      clubId: club.id,
      clubName: club.name,
      timeZone: club.timeZone,
      status: result.status,
      confidence: result.confidence,
      asOf: result.asOf ? result.asOf.toISOString() : null,
      note: confidenceNote(result, club.timeZone, ctx.locale),
      // Model-facing: which write plays at these slots (no integration → create_game, no booking).
      ...(result.confidence === 'app_only' && !result.snapshotMissing
        ? { bookableInApp: false, toPlayHere: "create_game with this clubId and the slot's start, without courtId (the court is booked with the club directly); create_game_with_booking / book_court cannot book here" }
        : {}),
      ...(result.status === 'duration_not_supported' ? { allowedDurations: result.allowedDurations } : {}),
      ...(result.hoursKnown ? {} : { hoursUnknown: true }),
      availableAllDay: result.slots.length,
      slots: slots.map(toDto),
    };
  });

  const entities: AgentEntityRef[] = [];
  for (const group of clubGroups) {
    const club = byClub.get(group.clubId)!;
    entities.push({ type: 'club', id: club.id, name: club.name, cityName: club.cityName });
  }
  for (const slot of shown) {
    const club = byClub.get(slot.clubId)!;
    entities.push({
      type: 'slot',
      slotRef: refs.get(slot)!,
      clubId: slot.clubId,
      clubName: club.name,
      courtNames: slot.courtNames,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      timeZone: slot.timeZone,
      confidence: slot.confidence,
      asOf: slot.confidence === 'snapshot' && slot.asOf ? slot.asOf.toISOString() : null,
    });
  }

  const clubsWithSlots = new Set(shown.map((slot) => slot.clubId)).size;
  const suggestion =
    inWindow.length > 0
      ? undefined
      : nearby.length > 0
        ? 'Nothing starts inside the requested window; the slots listed are the nearest times the same day. Offer them as alternatives.'
        : 'Nothing is available that day for this duration and court count. Suggest another date, a different duration (see allowedDurations), fewer courts, or another club.';

  return {
    data: {
      date: args.date,
      durationMinutes: args.durationMinutes,
      courts: args.courts,
      window: hasWindow ? { from: args.timeFrom ?? null, to: args.timeTo ?? null, rule: 'slots that start inside the window' } : null,
      confidenceRules: SLOT_CONFIDENCE_RULES,
      timesAre: 'local wall clock of each club (timeZone); startIso/endIso are UTC instants',
      bookingHint:
        'Pass a slotRef unchanged to the booking tools; it expires in 15 minutes and only works for this user. A slotRef books exactly the courts in its "courts" list, all of them. otherFreeCourts are free too but not in the ref: to book one of them, call again with courtIds (court ids from get_club); never raise "courts" to reach a court.',
      ...(suggestion ? { suggestion, nearbyTimes: nearby.length > 0 } : {}),
      clubs: clubGroups,
    },
    summary:
      shown.length > 0
        ? agentSlotsT(ctx.locale, 'summary.slots', { count: shown.length, clubs: clubsWithSlots })
        : agentSlotsT(ctx.locale, 'summary.none'),
    entities,
  };
}
