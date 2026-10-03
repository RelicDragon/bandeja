import type { CostShare, GameCostSummary } from '@/api/gameCost';
import { attendanceDotStyle, type AttendanceDotState } from '@/features/attendance/attendanceVisuals';
import type { BasicUser, Game, GameParticipant } from '@/types';

/**
 * The unified roster card: the decisions it makes, as pure functions.
 *
 * One person, one row. Attendance and the cost share are columns of that row,
 * not separate lists. Privacy lives here as well as on the server: another
 * player's amount reaches a row only when the viewer collects
 * (`canManage || canConfirm`). `projectCostSummary` already redacts the
 * payload; this is the second lock, so a stale full cache cannot leak.
 */

/** From this many seats up, one segment per seat turns into noise. */
export const SEGMENTED_SEAT_LIMIT = 12;
/** Rows shown before "Show all". */
export const COLLAPSED_ROW_LIMIT = 8;
/** Up to this many free seats render as individual dashed rows. */
export const OPEN_SPOT_ROW_LIMIT = 3;

export type RosterFilter = 'ALL' | 'CONFIRMED' | 'UNSURE' | 'UNANSWERED' | 'UNPAID' | 'SETTLED';

export interface RosterRowModel {
  userId: string;
  user: BasicUser;
  role: GameParticipant['role'];
  /** `undefined` until attendance details land, or when the game has none. */
  attendance: AttendanceDotState | undefined;
  /** Present only when the viewer may see this amount. */
  share: CostShare | null;
  isViewer: boolean;
  isPayer: boolean;
}

/** The answer line under a name. A confirmed owner reads as "Owner" (same green). */
export function rowStatusLabelKey(row: RosterRowModel): string | null {
  if (!row.attendance) return null;
  if (row.attendance === 'CONFIRMED' && row.role === 'OWNER') return 'games.owner';
  return attendanceDotStyle(row.attendance).labelKey;
}

export interface RosterGroup {
  key: 'ALL' | 'MALE' | 'FEMALE';
  /** `MALE` / `FEMALE` drive the invite gender for mixed pairs. */
  gender: 'MALE' | 'FEMALE' | undefined;
  rows: RosterRowModel[];
  /** Seats in this group; `null` when unlimited (BAR). */
  capacity: number | null;
}

export function canSeeAllShares(summary: GameCostSummary | null | undefined): boolean {
  return Boolean(summary && (summary.canManage || summary.canConfirm));
}

function shareFor(
  userId: string,
  viewerUserId: string | undefined,
  summary: GameCostSummary | null | undefined,
): CostShare | null {
  if (!summary?.available) return null;
  if (userId !== viewerUserId && !canSeeAllShares(summary)) return null;
  return summary.shares.find((share) => share.userId === userId) ?? null;
}

export function buildRosterRow(
  participant: GameParticipant,
  options: {
    viewerUserId: string | undefined;
    attendanceByUserId: Record<string, AttendanceDotState> | undefined;
    cost: GameCostSummary | null | undefined;
  },
): RosterRowModel {
  const share = shareFor(participant.userId, options.viewerUserId, options.cost);
  return {
    userId: participant.userId,
    user: participant.user,
    role: participant.role,
    attendance: options.attendanceByUserId?.[participant.userId],
    share,
    isViewer: participant.userId === options.viewerUserId,
    isPayer: Boolean(options.cost?.payerUserId && options.cost.payerUserId === participant.userId),
  };
}

/** The viewer's row first, everyone else in roster order. */
function pinViewer(rows: RosterRowModel[]): RosterRowModel[] {
  const mine = rows.filter((row) => row.isViewer);
  return mine.length ? [...mine, ...rows.filter((row) => !row.isViewer)] : rows;
}

/**
 * PLAYING participants, grouped the way the game seats them. Mixed pairs get a
 * Men and a Women group of `max / 2` each; men-only / women-only games filter
 * to that gender, exactly as the old carousel did.
 */
export function buildRosterGroups(
  game: Pick<Game, 'participants' | 'genderTeams' | 'maxParticipants' | 'entityType'>,
  options: {
    viewerUserId: string | undefined;
    attendanceByUserId: Record<string, AttendanceDotState> | undefined;
    cost: GameCostSummary | null | undefined;
  },
): RosterGroup[] {
  const playing = game.participants.filter((p) => p.status === 'PLAYING');
  const toRows = (list: GameParticipant[]) =>
    pinViewer(list.map((participant) => buildRosterRow(participant, options)));
  const unlimited = game.entityType === 'BAR';

  if (game.genderTeams === 'MIX_PAIRS') {
    const perGender = Math.floor(game.maxParticipants / 2);
    return [
      {
        key: 'MALE',
        gender: 'MALE',
        rows: toRows(playing.filter((p) => p.user.gender === 'MALE')),
        capacity: perGender,
      },
      {
        key: 'FEMALE',
        gender: 'FEMALE',
        rows: toRows(playing.filter((p) => p.user.gender === 'FEMALE')),
        capacity: perGender,
      },
    ];
  }
  const onlyGender =
    game.genderTeams === 'MEN' ? 'MALE' : game.genderTeams === 'WOMEN' ? 'FEMALE' : undefined;
  return [
    {
      key: 'ALL',
      gender: onlyGender,
      rows: toRows(onlyGender ? playing.filter((p) => p.user.gender === onlyGender) : playing),
      capacity: unlimited ? null : game.maxParticipants,
    },
  ];
}

export function openSeats(group: RosterGroup): number {
  if (group.capacity == null) return 0;
  return Math.max(0, group.capacity - group.rows.length);
}

export interface RosterCounts {
  total: number;
  confirmed: number;
  unsure: number;
  unanswered: number;
  noShow: number;
  unpaid: number;
  settled: number;
}

export function countRows(rows: readonly RosterRowModel[]): RosterCounts {
  const counts: RosterCounts = {
    total: rows.length,
    confirmed: 0,
    unsure: 0,
    unanswered: 0,
    noShow: 0,
    unpaid: 0,
    settled: 0,
  };
  for (const row of rows) {
    if (row.attendance === 'CONFIRMED') counts.confirmed += 1;
    else if (row.attendance === 'UNSURE') counts.unsure += 1;
    else if (row.attendance === 'NO_SHOW') counts.noShow += 1;
    else if (row.attendance === 'UNANSWERED') counts.unanswered += 1;
    if (row.share) {
      if (row.share.state === 'SETTLED') counts.settled += 1;
      else counts.unpaid += 1;
    }
  }
  return counts;
}

export function matchesFilter(row: RosterRowModel, filter: RosterFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'CONFIRMED':
    case 'UNSURE':
    case 'UNANSWERED':
      return row.attendance === filter;
    case 'UNPAID':
      return Boolean(row.share && row.share.state !== 'SETTLED');
    case 'SETTLED':
      return row.share?.state === 'SETTLED';
  }
}

/**
 * Which filter chips exist. Money chips only for collectors, and only when the
 * ledger actually has rows; attendance chips only once answers exist. A chip
 * with zero matches is dropped, except `ALL` and the one currently active.
 */
export function availableFilters(
  counts: RosterCounts,
  options: { hasAttendance: boolean; collector: boolean; active: RosterFilter },
): { filter: RosterFilter; count: number }[] {
  const out: { filter: RosterFilter; count: number }[] = [{ filter: 'ALL', count: counts.total }];
  const push = (filter: RosterFilter, count: number) => {
    if (count > 0 || filter === options.active) out.push({ filter, count });
  };
  if (options.hasAttendance) {
    push('CONFIRMED', counts.confirmed);
    push('UNSURE', counts.unsure);
    push('UNANSWERED', counts.unanswered);
  }
  if (options.collector) {
    push('UNPAID', counts.unpaid);
    push('SETTLED', counts.settled);
  }
  return out;
}

/** One entry per seat for the segmented strip: a row's state, or `null` when open. */
export type SeatState = AttendanceDotState | 'TAKEN' | null;

export function seatStates(group: RosterGroup): SeatState[] {
  const seats: SeatState[] = group.rows.map((row) => row.attendance ?? 'TAKEN');
  for (let i = 0; i < openSeats(group); i += 1) seats.push(null);
  return seats;
}

/** Two seats, no gender split: the face-off layout instead of a strip. */
export function isFaceOff(
  game: Pick<Game, 'maxParticipants' | 'genderTeams' | 'entityType'>,
): boolean {
  return game.entityType !== 'BAR' && game.maxParticipants === 2 && game.genderTeams !== 'MIX_PAIRS';
}
