/**
 * The principal's own court bookings, assembled server-side for the agent
 * (docs/plans/ai-agent-booking.md §14.6 `list_my_bookings`, slice 7a).
 *
 * Sources:
 *   - `GameExternalBooking` rows on games where the principal is OWNER / ADMIN / PLAYING
 *     (∩ agent game visibility, without the platform-admin bypass: this is "my" list);
 *     includes Nspadel `nspadel:` ids, which exist nowhere else;
 *   - the principal's own Weltner receipts (`WeltnerBooking`): CONFIRMED, plus SUBMITTING /
 *     UNKNOWN reported as `UNKNOWN`; REJECTED never;
 *   - the principal's own Nspadel receipts (`NspadelBooking`, slice 7d), same states; a receipt
 *     shares the synthetic `nspadel:<court>:<date>:<start>` id with the games that link it;
 *   - the app-synced booking-list mirror (`ExternalBookingMirror`, slice 7k): the user's own
 *     Booktime / Padeloo / Klikteren bookings as the app last loaded them. A mirror row of a
 *     booking that is also linked to a game (same provider + external id) folds into the linked
 *     `geb:` item (ref, times and courts from the link), but its CANCELLED state and its owner
 *     (the booker) still count. A (provider, club) whose list was synced completely within 24 h
 *     is "covered": `list_my_bookings` stops reporting it as incomplete (upcoming range only).
 *
 * A booking linked to several games is one item with `linkedGameIds[]` (grouped by
 * provider + external id). Times are ISO instants plus the **club's** city timezone.
 *
 * `bookingRef` is server-minted and opaque: `weltner:<WeltnerBooking.id>` /
 * `nspadel:<NspadelBooking.id>` for the user's own receipt, else `geb:<GameExternalBooking.id>` (lowest id of the group), else
 * `mirror:<ExternalBookingMirror.id>`. Raw provider ids (`externalBookingId`) stay internal: the DTO for the model
 * is `toAgentBookingDto`. `resolveBookingRef` only resolves refs inside the principal's own
 * list; anything else is the same 404.
 *
 * `canCancel` (§14.4): the provider can cancel (Booktime / Padeloo / Klikteren; Weltner and
 * Nspadel never), the booking is CONFIRMED and not started, and either
 *   - the principal is its booker (`GameExternalBooking.bookedByUserId`, slice 7c), or
 *   - no row of the booking has a booker (legacy rows) and the principal is OWNER / ADMIN of a
 *     linked game (only they can link a booking) and has a connection (auth row) to that
 *     provider at that club.
 * A booking whose booker is another user is never cancellable by the principal.
 */
import {
  ClubIntegrationType,
  ExternalBookingMirrorState,
  NspadelBookingState,
  ParticipantRole,
  ParticipantStatus,
  WeltnerBookingState,
  type Prisma,
} from '@prisma/client';
import type { AgentBookingState } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { agentVisibleGamesWhere } from '../access/agentGameAccess';
import type { AgentPrincipal } from '../access/agentPrincipal';

/** Providers whose bookings the app can cancel (client execution, §14.5). */
export const AGENT_CANCELLABLE_PROVIDERS: ReadonlySet<ClubIntegrationType> = new Set([
  ClubIntegrationType.BOOKTIME,
  ClubIntegrationType.PADELOO,
  ClubIntegrationType.KLIKTEREN,
]);

/** Providers whose per-user booking list only the app can read; without a mirror the agent's list is partial. */
export const AGENT_APP_LISTED_PROVIDERS: readonly ClubIntegrationType[] = [
  ClubIntegrationType.BOOKTIME,
  ClubIntegrationType.PADELOO,
  ClubIntegrationType.KLIKTEREN,
];

const WELTNER_LISTED_STATES: WeltnerBookingState[] = [
  WeltnerBookingState.CONFIRMED,
  WeltnerBookingState.SUBMITTING,
  WeltnerBookingState.UNKNOWN,
];

const NSPADEL_LISTED_STATES: NspadelBookingState[] = [
  NspadelBookingState.CONFIRMED,
  NspadelBookingState.SUBMITTING,
  NspadelBookingState.UNKNOWN,
];

/** Rows read per source before merging (a user's bookings are few; this only bounds a bad case). */
const SOURCE_ROW_CAP = 300;

export type AgentBookingSource = 'geb' | 'weltner' | 'nspadel' | 'mirror';

/** One booking of the principal. `externalBookingId` is internal: never send it to the model. */
export type AgentBookingItem = {
  ref: string;
  source: AgentBookingSource;
  provider: ClubIntegrationType;
  externalBookingId: string;
  clubId: string;
  clubName: string;
  timeZone: string;
  courtIds: string[];
  courtNames: string[];
  start: Date;
  end: Date;
  state: AgentBookingState;
  linkedGameIds: string[];
  /** Linked games where the principal is OWNER / ADMIN (may link, unlink, and — per provider — cancel). */
  managedGameIds: string[];
  canCancel: boolean;
};

type ClubInfo = { id: string; name: string; timeZone: string };

/** Normalized source row, before grouping. */
export type AgentBookingSourceRow = {
  source: AgentBookingSource;
  sourceId: string;
  provider: ClubIntegrationType;
  externalBookingId: string;
  club: ClubInfo;
  courtId: string | null;
  courtName: string | null;
  start: Date;
  end: Date;
  /** Provider state when the source knows it (Weltner receipts, mirror); null = infer from time. */
  knownState: 'CONFIRMED' | 'CANCELLED' | 'UNKNOWN' | null;
  gameId: string | null;
  managesGame: boolean;
  /** Who attached the booking (`GameExternalBooking.bookedByUserId`; the receipt owner for Weltner). Null = legacy/unknown. */
  bookedByUserId: string | null;
};

export type AgentBookingFilter = { range?: 'upcoming' | 'past'; clubId?: string; now: Date };

/**
 * Mirror hook (slice 7k). Returns the principal's mirrored rows and the `${provider}:${clubId}`
 * keys whose list the mirror covers completely; `resolve` finds one `mirror:<id>` of the
 * principal, `findByExternal` the principal's mirror row of one provider booking.
 */
export type AgentBookingMirror = {
  list: (userId: string, filter: AgentBookingFilter) => Promise<{
    rows: AgentBookingSourceRow[];
    coveredClubKeys: string[];
  }>;
  resolve: (userId: string, mirrorId: string) => Promise<AgentBookingSourceRow[]>;
  findByExternal: (
    userId: string,
    provider: ClubIntegrationType,
    externalBookingId: string,
  ) => Promise<AgentBookingSourceRow[]>;
};

export const EMPTY_AGENT_BOOKING_MIRROR: AgentBookingMirror = {
  list: async () => ({ rows: [], coveredClubKeys: [] }),
  resolve: async () => [],
  findByExternal: async () => [],
};

const CLUB_SELECT = { id: true, name: true, city: { select: { timezone: true } } } as const;

const GEB_SELECT = {
  id: true,
  gameId: true,
  externalBookingId: true,
  externalBookingProvider: true,
  courtId: true,
  bookingStart: true,
  bookingEnd: true,
  bookedByUserId: true,
  court: { select: { name: true, club: { select: CLUB_SELECT } } },
  game: {
    select: {
      startTime: true,
      endTime: true,
      club: { select: CLUB_SELECT },
      court: { select: { club: { select: CLUB_SELECT } } },
    },
  },
} satisfies Prisma.GameExternalBookingSelect;

type ClubRow = { id: string; name: string; city: { timezone: string } };

function clubInfo(club: ClubRow): ClubInfo {
  return { id: club.id, name: club.name, timeZone: club.city.timezone || 'UTC' };
}

/** OWNER / ADMIN (any status) or PLAYING — the games whose bookings are "mine". */
function bookingMemberWhere(userId: string): Prisma.GameParticipantWhereInput {
  return {
    userId,
    OR: [
      { role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] } },
      { status: ParticipantStatus.PLAYING },
    ],
  };
}

function bookingGamesWhere(userId: string): Prisma.GameWhereInput {
  return {
    AND: [
      { participants: { some: bookingMemberWhere(userId) } },
      // No platform-admin bypass: this is the user's own list.
      agentVisibleGamesWhere({ userId, isAdmin: false }),
    ],
  };
}

function gebRangeWhere(filter: AgentBookingFilter): Prisma.GameExternalBookingWhereInput {
  if (!filter.range) return {};
  const cmp = filter.range === 'past' ? { lt: filter.now } : { gte: filter.now };
  return {
    OR: [
      { bookingEnd: cmp },
      { bookingEnd: null, game: { endTime: cmp } },
    ],
  };
}

function gebClubWhere(clubId: string | undefined): Prisma.GameExternalBookingWhereInput {
  if (!clubId) return {};
  return {
    OR: [
      { court: { clubId } },
      { courtId: null, game: { OR: [{ clubId }, { clubId: null, court: { clubId } }] } },
    ],
  };
}

async function loadGebRows(
  principal: Pick<AgentPrincipal, 'userId'>,
  where: Prisma.GameExternalBookingWhereInput,
): Promise<AgentBookingSourceRow[]> {
  const rows = await prisma.gameExternalBooking.findMany({
    where: { AND: [{ game: bookingGamesWhere(principal.userId) }, where] },
    select: {
      ...GEB_SELECT,
      game: {
        select: {
          ...GEB_SELECT.game.select,
          participants: { where: { userId: principal.userId }, select: { role: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
    take: SOURCE_ROW_CAP,
  });
  const out: AgentBookingSourceRow[] = [];
  for (const row of rows) {
    const club = row.court?.club ?? row.game.club ?? row.game.court?.club;
    if (!club) continue; // no club to show or scope it by
    out.push({
      source: 'geb',
      sourceId: row.id,
      provider: row.externalBookingProvider,
      externalBookingId: row.externalBookingId,
      club: clubInfo(club),
      courtId: row.courtId,
      courtName: row.court?.name ?? null,
      start: row.bookingStart ?? row.game.startTime,
      end: row.bookingEnd ?? row.game.endTime,
      knownState: null,
      gameId: row.gameId,
      managesGame: row.game.participants.some(
        (p) => p.role === ParticipantRole.OWNER || p.role === ParticipantRole.ADMIN,
      ),
      bookedByUserId: row.bookedByUserId,
    });
  }
  return out;
}

async function loadWeltnerRows(where: Prisma.WeltnerBookingWhereInput): Promise<AgentBookingSourceRow[]> {
  const rows = await prisma.weltnerBooking.findMany({
    where: { AND: [{ state: { in: WELTNER_LISTED_STATES } }, where] },
    select: {
      id: true,
      courtId: true,
      bookingStart: true,
      bookingEnd: true,
      state: true,
      userId: true,
      court: { select: { name: true } },
      club: { select: CLUB_SELECT },
    },
    orderBy: { bookingStart: 'asc' },
    take: SOURCE_ROW_CAP,
  });
  return rows.map((row) => ({
    source: 'weltner' as const,
    sourceId: row.id,
    provider: ClubIntegrationType.WELTNER,
    externalBookingId: `weltner:${row.id}`,
    club: clubInfo(row.club),
    courtId: row.courtId,
    courtName: row.court.name,
    start: row.bookingStart,
    end: row.bookingEnd,
    knownState: row.state === WeltnerBookingState.CONFIRMED ? ('CONFIRMED' as const) : ('UNKNOWN' as const),
    gameId: null,
    managesGame: false,
    bookedByUserId: row.userId,
  }));
}

async function loadNspadelRows(where: Prisma.NspadelBookingWhereInput): Promise<AgentBookingSourceRow[]> {
  const rows = await prisma.nspadelBooking.findMany({
    where: { AND: [{ state: { in: NSPADEL_LISTED_STATES } }, where] },
    select: {
      id: true,
      courtId: true,
      externalBookingId: true,
      bookingStart: true,
      bookingEnd: true,
      state: true,
      userId: true,
      court: { select: { name: true } },
      club: { select: CLUB_SELECT },
    },
    orderBy: { bookingStart: 'asc' },
    take: SOURCE_ROW_CAP,
  });
  return rows.map((row) => ({
    source: 'nspadel' as const,
    sourceId: row.id,
    provider: ClubIntegrationType.NSPADELSUPABASE,
    externalBookingId: row.externalBookingId,
    club: clubInfo(row.club),
    courtId: row.courtId,
    courtName: row.court?.name ?? null,
    start: row.bookingStart,
    end: row.bookingEnd,
    knownState: row.state === NspadelBookingState.CONFIRMED ? ('CONFIRMED' as const) : ('UNKNOWN' as const),
    gameId: null,
    managesGame: false,
    // The receipt owner is the booker (only they can see it; nobody can cancel Nspadel via the app).
    bookedByUserId: row.userId,
  }));
}

function nspadelRangeWhere(filter: AgentBookingFilter): Prisma.NspadelBookingWhereInput {
  if (!filter.range) return {};
  return { bookingEnd: filter.range === 'past' ? { lt: filter.now } : { gte: filter.now } };
}

function weltnerRangeWhere(filter: AgentBookingFilter): Prisma.WeltnerBookingWhereInput {
  if (!filter.range) return {};
  return { bookingEnd: filter.range === 'past' ? { lt: filter.now } : { gte: filter.now } };
}

/** A synced list older than this no longer makes the agent's list complete for that club. */
export const MIRROR_COVERAGE_MS = 24 * 60 * 60 * 1000;

function mirrorCourts(value: Prisma.JsonValue): { courtId: string | null; name: string | null }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const { courtId, name } = entry as Record<string, unknown>;
    return [{
      courtId: typeof courtId === 'string' ? courtId : null,
      name: typeof name === 'string' ? name : null,
    }];
  });
}

/** One source row per mirrored court (a court-less booking is one row without a court). */
async function loadMirrorRows(where: Prisma.ExternalBookingMirrorWhereInput): Promise<AgentBookingSourceRow[]> {
  const rows = await prisma.externalBookingMirror.findMany({
    where,
    select: {
      id: true,
      userId: true,
      provider: true,
      externalBookingId: true,
      courts: true,
      bookingStart: true,
      bookingEnd: true,
      state: true,
      club: { select: CLUB_SELECT },
    },
    orderBy: { bookingStart: 'asc' },
    take: SOURCE_ROW_CAP,
  });
  return rows.flatMap((row) => {
    const courts = mirrorCourts(row.courts);
    return (courts.length > 0 ? courts : [{ courtId: null, name: null }]).map((court) => ({
      source: 'mirror' as const,
      sourceId: row.id,
      provider: row.provider,
      externalBookingId: row.externalBookingId,
      club: clubInfo(row.club),
      courtId: court.courtId,
      courtName: court.name,
      start: row.bookingStart,
      end: row.bookingEnd,
      knownState: row.state === ExternalBookingMirrorState.CANCELLED ? ('CANCELLED' as const) : ('CONFIRMED' as const),
      gameId: null,
      managesGame: false,
      bookedByUserId: row.userId,
    }));
  });
}

/** The FE-synced mirror (`ExternalBookingMirror` + `ExternalBookingMirrorSync`), always scoped to `userId`. */
export const PRISMA_AGENT_BOOKING_MIRROR: AgentBookingMirror = {
  list: async (userId, filter) => {
    const [rows, syncs] = await Promise.all([
      loadMirrorRows({
        userId,
        ...(filter.range
          ? { bookingEnd: filter.range === 'past' ? { lt: filter.now } : { gte: filter.now } }
          : {}),
        ...(filter.clubId ? { clubId: filter.clubId } : {}),
      }),
      // The app syncs upcoming lists only, so a past list is never "covered".
      filter.range === 'past'
        ? Promise.resolve([])
        : prisma.externalBookingMirrorSync.findMany({
            where: {
              userId,
              complete: true,
              syncedAt: { gte: new Date(filter.now.getTime() - MIRROR_COVERAGE_MS) },
              ...(filter.clubId ? { clubId: filter.clubId } : {}),
            },
            select: { provider: true, clubId: true },
          }),
    ]);
    return { rows, coveredClubKeys: syncs.map((sync) => `${sync.provider}:${sync.clubId}`) };
  },
  resolve: (userId, mirrorId) => loadMirrorRows({ id: mirrorId, userId }),
  findByExternal: (userId, provider, externalBookingId) =>
    loadMirrorRows({ userId, provider, externalBookingId }),
};

/** `${provider}:${clubId}` for every club the principal is connected to via an app-listed provider. */
async function loadConnections(userId: string): Promise<Set<string>> {
  const select = { clubId: true } as const;
  const [booktime, padeloo, klikteren] = await Promise.all([
    prisma.userClubBooktimeAuth.findMany({ where: { userId }, select }),
    prisma.userClubPadelooAuth.findMany({ where: { userId }, select }),
    prisma.userClubKlikterenAuth.findMany({ where: { userId }, select }),
  ]);
  return new Set([
    ...booktime.map((r) => `${ClubIntegrationType.BOOKTIME}:${r.clubId}`),
    ...padeloo.map((r) => `${ClubIntegrationType.PADELOO}:${r.clubId}`),
    ...klikteren.map((r) => `${ClubIntegrationType.KLIKTEREN}:${r.clubId}`),
  ]);
}

function uniq<T>(values: (T | null)[]): T[] {
  return [...new Set(values.filter((v): v is T => v !== null))];
}

/** Groups source rows by provider + external id (dedupe of multi-game links) into items. */
export function mergeAgentBookingRows(
  rows: AgentBookingSourceRow[],
  connections: Set<string>,
  now: Date,
  principalUserId: string,
): AgentBookingItem[] {
  const groups = new Map<string, AgentBookingSourceRow[]>();
  for (const row of rows) {
    const key = `${row.provider}\u0000${row.externalBookingId}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const items: AgentBookingItem[] = [];
  for (const group of groups.values()) {
    // The owned receipt is the authority for times and state; else the linked item (lowest geb
    // id); a mirror row alone is its own item. A mirror row still contributes its fresher state.
    const gebRows = group.filter((r) => r.source === 'geb');
    const mirrorRows = group.filter((r) => r.source === 'mirror');
    const primary =
      group.find((r) => r.source === 'weltner') ??
      group.find((r) => r.source === 'nspadel') ??
      [...gebRows].sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1))[0] ??
      mirrorRows[0];
    // A booking known only from the mirror and cancelled at the club is not "mine" any more.
    if (primary.source === 'mirror' && primary.knownState === 'CANCELLED') continue;
    const timed = primary.source === 'geb' ? gebRows : [primary];
    const start = new Date(Math.min(...timed.map((r) => r.start.getTime())));
    const end = new Date(Math.max(...timed.map((r) => r.end.getTime())));
    const courtRows =
      primary.source === 'geb' ? timed : primary.source === 'mirror' ? mirrorRows : [primary];
    const knownState =
      primary.knownState ?? (mirrorRows.some((r) => r.knownState === 'CANCELLED') ? 'CANCELLED' : null);
    const state: AgentBookingState =
      knownState === 'UNKNOWN' || knownState === 'CANCELLED'
        ? knownState
        : end.getTime() <= now.getTime()
          ? 'PAST'
          : 'CONFIRMED';
    const linkedGameIds = uniq(group.map((r) => r.gameId)).sort();
    const managedGameIds = uniq(group.map((r) => (r.managesGame ? r.gameId : null))).sort();
    const bookers = uniq(group.map((r) => r.bookedByUserId));
    const mayCancelAsBooker =
      bookers.length > 0
        ? bookers.includes(principalUserId)
        : managedGameIds.length > 0 && connections.has(`${primary.provider}:${primary.club.id}`);
    const canCancel =
      AGENT_CANCELLABLE_PROVIDERS.has(primary.provider) &&
      state === 'CONFIRMED' &&
      start.getTime() > now.getTime() &&
      mayCancelAsBooker;
    items.push({
      ref: `${primary.source}:${primary.sourceId}`,
      source: primary.source,
      provider: primary.provider,
      externalBookingId: primary.externalBookingId,
      clubId: primary.club.id,
      clubName: primary.club.name,
      timeZone: primary.club.timeZone,
      courtIds: uniq(courtRows.map((r) => r.courtId)),
      courtNames: uniq(courtRows.map((r) => r.courtName)),
      start,
      end,
      state,
      linkedGameIds,
      managedGameIds,
      canCancel,
    });
  }
  return items;
}

export type AgentBookingList = {
  items: AgentBookingItem[];
  /** App-listed providers (Booktime / Padeloo / Klikteren) the user may have bookings with that this list can't see. */
  incompleteProviders: ClubIntegrationType[];
  listComplete: boolean;
};

export type AgentBookingDeps = { mirror?: AgentBookingMirror };

/**
 * The principal's bookings in `range` (upcoming: soonest first; past: most recent first),
 * optionally at one club, at most `limit` items.
 */
export async function listAgentBookings(
  principal: Pick<AgentPrincipal, 'userId'>,
  filter: AgentBookingFilter & { limit: number },
  deps: AgentBookingDeps = {},
): Promise<AgentBookingList> {
  const mirror = deps.mirror ?? PRISMA_AGENT_BOOKING_MIRROR;
  const [gebRows, weltnerRows, nspadelRows, mirrored, connections] = await Promise.all([
    loadGebRows(principal, { AND: [gebRangeWhere(filter), gebClubWhere(filter.clubId)] }),
    loadWeltnerRows({
      userId: principal.userId,
      ...weltnerRangeWhere(filter),
      ...(filter.clubId ? { clubId: filter.clubId } : {}),
    }),
    loadNspadelRows({
      userId: principal.userId,
      ...nspadelRangeWhere(filter),
      ...(filter.clubId ? { clubId: filter.clubId } : {}),
    }),
    mirror.list(principal.userId, filter),
    loadConnections(principal.userId),
  ]);
  const past = filter.range === 'past';
  const items = mergeAgentBookingRows(
    [...gebRows, ...weltnerRows, ...nspadelRows, ...mirrored.rows],
    connections,
    filter.now,
    principal.userId,
  )
    .sort((a, b) => (past ? b.start.getTime() - a.start.getTime() : a.start.getTime() - b.start.getTime()))
    .slice(0, filter.limit);

  // Incomplete: a connected (provider, club), or one we list bookings for, whose mirror is not fresh.
  const covered = new Set(mirrored.coveredClubKeys);
  const uncoveredKeys = [
    ...[...connections].filter((key) => !filter.clubId || key.endsWith(`:${filter.clubId}`)),
    ...items.map((item) => `${item.provider}:${item.clubId}`),
  ].filter((key) => !covered.has(key));
  const incompleteProviders = AGENT_APP_LISTED_PROVIDERS.filter((provider) =>
    uncoveredKeys.some((key) => key.startsWith(`${provider}:`)),
  );
  return { items, incompleteProviders, listComplete: incompleteProviders.length === 0 };
}

const BOOKING_REF_PATTERN = /^(geb|weltner|nspadel|mirror):([A-Za-z0-9_-]{1,64})$/;

function bookingNotFound(): ApiError {
  return new ApiError(404, 'Booking not found');
}

/**
 * Resolves a `bookingRef` inside the principal's own list (any range, any club). A ref of
 * another user, a malformed ref, or a booking the principal no longer sees is the same 404.
 * The returned item's `ref` is the canonical one (a `geb:` ref of the user's own Weltner /
 * Nspadel receipt resolves to its `weltner:` / `nspadel:` item).
 *
 * Refs also reach the model as user-typed text (`[booking:<ref>]` tokens from the app's
 * booking cards), so this lookup is the only authority: never trust a ref's shape alone.
 */
export async function resolveBookingRef(
  principal: Pick<AgentPrincipal, 'userId'>,
  ref: string,
  deps: AgentBookingDeps = {},
  now: Date = new Date(),
): Promise<AgentBookingItem> {
  const match = BOOKING_REF_PATTERN.exec(typeof ref === 'string' ? ref.trim() : '');
  if (!match) throw bookingNotFound();
  const [, kind, id] = match;
  const mirror = deps.mirror ?? PRISMA_AGENT_BOOKING_MIRROR;

  let seed: AgentBookingSourceRow[];
  if (kind === 'geb') seed = await loadGebRows(principal, { id });
  else if (kind === 'weltner') seed = await loadWeltnerRows({ id, userId: principal.userId });
  else if (kind === 'nspadel') seed = await loadNspadelRows({ id, userId: principal.userId });
  else seed = await mirror.resolve(principal.userId, id);
  const first = seed[0];
  if (!first) throw bookingNotFound();

  // The rest of the dedupe group: other visible links of the same booking, the owned receipt,
  // and the principal's own mirror row of it.
  const [links, receipts, nspadelReceipts, mirrored, connections] = await Promise.all([
    loadGebRows(principal, {
      externalBookingProvider: first.provider,
      externalBookingId: first.externalBookingId,
    }),
    first.provider === ClubIntegrationType.WELTNER && first.externalBookingId.startsWith('weltner:')
      ? loadWeltnerRows({ id: first.externalBookingId.slice('weltner:'.length), userId: principal.userId })
      : Promise.resolve([]),
    first.provider === ClubIntegrationType.NSPADELSUPABASE
      ? loadNspadelRows({ externalBookingId: first.externalBookingId, userId: principal.userId })
      : Promise.resolve([]),
    AGENT_APP_LISTED_PROVIDERS.includes(first.provider)
      ? mirror.findByExternal(principal.userId, first.provider, first.externalBookingId)
      : Promise.resolve([]),
    loadConnections(principal.userId),
  ]);
  const byKey = new Map<string, AgentBookingSourceRow>();
  for (const row of [...seed, ...links, ...receipts, ...nspadelReceipts, ...mirrored]) {
    byKey.set(`${row.source}:${row.sourceId}:${row.courtId ?? ''}`, row);
  }
  const [item] = mergeAgentBookingRows([...byKey.values()], connections, now, principal.userId);
  if (!item) throw bookingNotFound();
  return item;
}
