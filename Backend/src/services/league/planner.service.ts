import { addDays, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { GameStatus, RoundType } from '@prisma/client';
import { getUserTimezone } from '../user-timezone.service';
import {
  type AvailabilityBucketBoundariesLike,
  type BucketId,
  type WeekdayKey,
  type WeeklyAvailabilityLike,
  parseBoundaries,
  buildBucketMasks,
  bucketAggregateState,
  userFitsBucket,
  WEEKDAY_FROM_SHORT,
} from './plannerAvailability.util';

const BUCKET_ORDER: BucketId[] = ['night', 'morning', 'afternoon', 'evening'];

type PlannerUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  level: number;
  socialLevel: number;
  gender: string;
  approvedLevel: boolean;
  isTrainer: boolean;
  weeklyAvailability: unknown;
  availabilityBucketBoundaries: unknown;
};

function plannerSampleFreeUser(u: PlannerUser) {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    avatar: u.avatar,
    level: u.level,
    socialLevel: u.socialLevel,
    gender: u.gender,
    approvedLevel: u.approvedLevel,
    isTrainer: u.isTrainer,
  };
}

function getWeekdayKeyFromZonedDate(d: Date, timeZone: string): WeekdayKey {
  const short = formatInTimeZone(d, timeZone, 'EEE', { locale: enUS });
  const k = WEEKDAY_FROM_SHORT[short];
  if (!k) return 'mon';
  return k;
}

function addBusyHoursFromInterval(
  busyByUser: Map<string, Map<string, number>>,
  userIds: string[],
  start: Date,
  end: Date,
  timeZone: string
) {
  const MS_HOUR = 60 * 60 * 1000;
  if (end.getTime() <= start.getTime()) return;
  const startHourFloor = new Date(Math.floor(start.getTime() / MS_HOUR) * MS_HOUR);
  const endHourCeil = new Date(Math.ceil(end.getTime() / MS_HOUR) * MS_HOUR);
  let cursor = startHourFloor.getTime();
  const endMs = endHourCeil.getTime();
  let iters = 0;
  while (cursor < endMs && iters < 168) {
    const d = new Date(cursor);
    const dateStr = formatInTimeZone(d, timeZone, 'yyyy-MM-dd');
    const hourStr = formatInTimeZone(d, timeZone, 'H');
    const hour = Math.min(23, Math.max(0, parseInt(hourStr, 10) || 0));
    const bit = (1 << hour) >>> 0;
    for (const uid of userIds) {
      if (!busyByUser.has(uid)) busyByUser.set(uid, new Map());
      const m = busyByUser.get(uid)!;
      const prev = m.get(dateStr) ?? 0;
      m.set(dateStr, (prev | bit) >>> 0);
    }
    cursor += MS_HOUR;
    iters++;
  }
}

function getGameSideUserIds(game: {
  hasFixedTeams: boolean;
  fixedTeams: Array<{ teamNumber: number; players: Array<{ userId: string | null }> }>;
  participants: Array<{ userId: string; status: string }>;
}): { sideA: string[]; sideB: string[] } | null {
  const teams = [...(game.fixedTeams ?? [])].sort((a, b) => a.teamNumber - b.teamNumber);
  if (game.hasFixedTeams && teams.length >= 2) {
    const a = teams[0].players.map((p) => p.userId).filter((id): id is string => !!id && id.trim().length > 0);
    const b = teams[1].players.map((p) => p.userId).filter((id): id is string => !!id && id.trim().length > 0);
    if (a.length === 0 || b.length === 0) return null;
    return { sideA: a, sideB: b };
  }
  const playing = game.participants.filter((p) => p.status === 'PLAYING').map((p) => p.userId);
  if (playing.length < 2) return null;
  const mid = Math.ceil(playing.length / 2);
  return { sideA: playing.slice(0, mid), sideB: playing.slice(mid) };
}

/**
 * League fixture "fits" a recurring bucket when every listed user has availability overlap
 * in that bucket and no committed game hour intersects the bucket that day.
 * Fixed teams: **all** roster members must satisfy (not "any one").
 */
function allUsersFitSlot(
  userIds: string[],
  userById: Map<string, PlannerUser>,
  dayKey: WeekdayKey,
  bucket: BucketId,
  boundaries: AvailabilityBucketBoundariesLike,
  busyByUser: Map<string, Map<string, number>>,
  dateStr: string,
  bucketMask: number
): boolean {
  for (const uid of userIds) {
    const u = userById.get(uid);
    const wa = (u?.weeklyAvailability as WeeklyAvailabilityLike | null) ?? null;
    if (!userFitsBucket(wa, dayKey, bucket, boundaries)) return false;
    const dayBusy = busyByUser.get(uid)?.get(dateStr) ?? 0;
    if ((dayBusy & bucketMask) !== 0) return false;
  }
  return true;
}

export class LeaguePlannerService {
  static async getPlanner(
    leagueSeasonId: string,
    requesterUserId: string,
    opts: {
      weekStart: string;
      groupId?: string | null;
      aggregateUserId?: string | null;
      /** When set (2–4 user ids), aggregates treat the set as one unit (AND across members). */
      aggregateIntersectUserIds?: string[] | null;
    }
  ) {
    const { weekStart, groupId, aggregateUserId, aggregateIntersectUserIds } = opts;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      throw new ApiError(400, 'Invalid weekStart (use YYYY-MM-DD)');
    }

    const requester = await prisma.user.findUnique({
      where: { id: requesterUserId },
      select: {
        availabilityBucketBoundaries: true,
      },
    });
    if (!requester) throw new ApiError(401, 'User not found');

    const timeZone = await getUserTimezone(requesterUserId);

    const season = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      select: {
        id: true,
        game: {
          select: { hasFixedTeams: true },
        },
      },
    });
    if (!season?.game) throw new ApiError(404, 'League season not found');

    const hasFixedTeams = season.game.hasFixedTeams ?? false;

    const groups = await prisma.leagueGroup.findMany({
      where: { leagueSeasonId },
      select: { id: true, name: true },
    });
    const hasGroups = groups.length > 0;

    const standings = await prisma.leagueParticipant.findMany({
      where: { leagueSeasonId },
      include: {
        user: { select: USER_SELECT_FIELDS },
        leagueTeam: {
          include: {
            players: { include: { user: { select: USER_SELECT_FIELDS } } },
          },
        },
        currentGroup: { select: { id: true, name: true } },
      },
    });

    const wantType = hasFixedTeams ? 'TEAM' : 'USER';
    const filteredStandings = standings.filter((p) => p.participantType === wantType);

    const groupFilter = groupId && groupId !== 'ALL' ? groupId : null;
    const inScope = filteredStandings.filter((s) => {
      if (!groupFilter) return true;
      return s.currentGroupId === groupFilter;
    });

    const boundaries = parseBoundaries(requester.availabilityBucketBoundaries ?? undefined);
    const bucketMasks = buildBucketMasks(boundaries);

    const userById = new Map<string, PlannerUser>();
    const aggregateUserIds: string[] = [];

    for (const row of inScope) {
      if (hasFixedTeams && row.leagueTeam?.players) {
        for (const pl of row.leagueTeam.players) {
          const u = pl.user as PlannerUser | null;
          if (u?.id && !userById.has(u.id)) {
            userById.set(u.id, u as PlannerUser);
            aggregateUserIds.push(u.id);
          }
        }
      } else if (!hasFixedTeams && row.user) {
        const u = row.user as PlannerUser;
        if (!userById.has(u.id)) {
          userById.set(u.id, u as PlannerUser);
          aggregateUserIds.push(u.id);
        }
      }
    }

    let aggregateIdsFiltered: string[];
    if (aggregateIntersectUserIds && aggregateIntersectUserIds.length > 0) {
      const wanted = [...new Set(aggregateIntersectUserIds.map((x) => x.trim()).filter(Boolean))];
      if (wanted.length < 2 || wanted.length > 4) {
        throw new ApiError(400, 'aggregateIntersectUserIds must list 2–4 distinct user ids');
      }
      aggregateIdsFiltered = wanted.filter((id) => aggregateUserIds.includes(id));
      if (aggregateIdsFiltered.length !== wanted.length) {
        throw new ApiError(400, 'aggregateIntersectUserIds must be league participants in scope');
      }
    } else if (aggregateUserId && aggregateUserId.trim()) {
      aggregateIdsFiltered = aggregateUserIds.filter((id) => id === aggregateUserId);
      if (aggregateIdsFiltered.length === 0) {
        throw new ApiError(400, 'User is not in this league scope');
      }
    } else {
      aggregateIdsFiltered = aggregateUserIds;
    }

    const intersectMode = Boolean(aggregateIntersectUserIds && aggregateIntersectUserIds.length > 0);

    const weekAnchor = parseISO(`${weekStart}T12:00:00.000Z`);
    const days: Array<{
      date: string;
      weekdayKey: WeekdayKey;
      isPast: boolean;
      buckets: Array<{
        bucket: BucketId;
        freeCount: number;
        busyCount: number;
        sampleFreeUsers: ReturnType<typeof plannerSampleFreeUser>[];
      }>;
    }> = [];

    const todayStr = formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd');

    for (let i = 0; i < 7; i++) {
      const instant = addDays(weekAnchor, i);
      const dateStr = formatInTimeZone(instant, timeZone, 'yyyy-MM-dd');
      const weekdayKey = getWeekdayKeyFromZonedDate(instant, timeZone);
      const isPast = dateStr < todayStr;

      const buckets = BUCKET_ORDER.map((bucket) => {
        let freeCount = 0;
        let busyCount = 0;
        const sampleFreeUsers: ReturnType<typeof plannerSampleFreeUser>[] = [];
        if (intersectMode) {
          const states = aggregateIdsFiltered.map((uid) => {
            const u = userById.get(uid)!;
            const wa = (u.weeklyAvailability as WeeklyAvailabilityLike | null) ?? null;
            return bucketAggregateState(wa, weekdayKey, bucket, boundaries);
          });
          if (states.length > 0 && states.every((s) => s !== null)) {
            const allFree = states.every((s) => s === 'free');
            const anyBusy = states.some((s) => s === 'busy');
            if (allFree) {
              freeCount = 1;
              for (const uid of aggregateIdsFiltered) {
                const u = userById.get(uid)!;
                if (sampleFreeUsers.length < 4) {
                  sampleFreeUsers.push(plannerSampleFreeUser(u));
                }
              }
            } else if (anyBusy) busyCount = 1;
          }
        } else {
          for (const uid of aggregateIdsFiltered) {
            const u = userById.get(uid)!;
            const wa = (u.weeklyAvailability as WeeklyAvailabilityLike | null) ?? null;
            const st = bucketAggregateState(wa, weekdayKey, bucket, boundaries);
            if (st === 'free') {
              freeCount++;
              if (sampleFreeUsers.length < 4) {
                sampleFreeUsers.push(plannerSampleFreeUser(u));
              }
            } else if (st === 'busy') busyCount++;
          }
        }
        return { bucket, freeCount, busyCount, sampleFreeUsers };
      });
      days.push({ date: dateStr, weekdayKey, isPast, buckets });
    }

    const weekStartUtc = parseISO(`${weekStart}T00:00:00.000Z`);
    const weekEndUtc = addDays(weekStartUtc, 8);

    const scheduledGames = await prisma.game.findMany({
      where: {
        parentId: leagueSeasonId,
        timeIsSet: true,
        startTime: { lt: weekEndUtc },
        endTime: { gt: weekStartUtc },
        status: { not: GameStatus.ARCHIVED },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        participants: { where: { status: 'PLAYING' }, select: { userId: true } },
      },
    });

    const busyByUser = new Map<string, Map<string, number>>();
    for (const g of scheduledGames) {
      const uids = g.participants.map((p) => p.userId);
      addBusyHoursFromInterval(busyByUser, uids, g.startTime, g.endTime, timeZone);
    }

    const unscheduledGamesRaw = await prisma.game.findMany({
      where: {
        parentId: leagueSeasonId,
        timeIsSet: false,
        leagueRound: { roundType: RoundType.REGULAR },
        ...(groupFilter ? { leagueGroupId: groupFilter } : {}),
      },
      select: {
        id: true,
        name: true,
        hasFixedTeams: true,
        leagueGroupId: true,
        leagueGroup: { select: { id: true, name: true } },
        leagueRound: { select: { orderIndex: true } },
        fixedTeams: {
          orderBy: { teamNumber: 'asc' as const },
          select: { teamNumber: true, players: { select: { userId: true } } },
        },
        participants: { select: { userId: true, status: true } },
      },
    });

    const unscheduledGames = unscheduledGamesRaw.map((g) => {
      const sides = getGameSideUserIds(g as any);
      return {
        id: g.id,
        name: g.name,
        roundOrderIndex: g.leagueRound?.orderIndex ?? 0,
        leagueGroupId: g.leagueGroupId,
        groupName: g.leagueGroup?.name ?? null,
        sideAUserIds: sides?.sideA ?? [],
        sideBUserIds: sides?.sideB ?? [],
      };
    });

    const schedulableBySlot: Record<string, string[]> = {};

    for (const day of days) {
      if (day.isPast) continue;
      for (const bucket of BUCKET_ORDER) {
        const bucketMask = bucketMasks[bucket];
        const key = `${day.date}|${bucket}`;
        const fits: string[] = [];
        for (const ug of unscheduledGames) {
          if (!ug.sideAUserIds.length || !ug.sideBUserIds.length) continue;
          const okA = allUsersFitSlot(
            ug.sideAUserIds,
            userById,
            day.weekdayKey,
            bucket,
            boundaries,
            busyByUser,
            day.date,
            bucketMask
          );
          const okB = allUsersFitSlot(
            ug.sideBUserIds,
            userById,
            day.weekdayKey,
            bucket,
            boundaries,
            busyByUser,
            day.date,
            bucketMask
          );
          if (okA && okB) fits.push(ug.id);
        }
        if (fits.length) schedulableBySlot[key] = fits;
      }
    }

    const shortName = (uid: string) => {
      const u = userById.get(uid);
      const n = u?.firstName?.trim();
      return n || 'Player';
    };
    const sideLabel = (ids: string[]) => ids.map(shortName).join(' · ');

    return {
      weekStart,
      timeZone,
      hasFixedTeams,
      hasGroups,
      groupIds: groups.map((g) => g.id),
      boundaries,
      days,
      unscheduledGames: unscheduledGames.map((g) => ({
        id: g.id,
        name: g.name,
        roundOrderIndex: g.roundOrderIndex,
        leagueGroupId: g.leagueGroupId,
        groupName: g.groupName,
        sideAUserIds: g.sideAUserIds,
        sideBUserIds: g.sideBUserIds,
        sideALabel: sideLabel(g.sideAUserIds),
        sideBLabel: sideLabel(g.sideBUserIds),
      })),
      schedulableBySlot,
      participantSummaries: inScope.map((s) => ({
        standingId: s.id,
        userId: s.userId,
        leagueTeamId: s.leagueTeamId,
        groupId: s.currentGroupId,
        groupName: s.currentGroup?.name ?? null,
      })),
    };
  }
}
