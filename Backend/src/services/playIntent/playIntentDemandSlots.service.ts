/**
 * `GET /play-intents/slots` — open demand grouped by day × part of day, for the
 * viewer to organize ("create a game and invite them") or join ("I'm in").
 * Bucketing and fit live in `playIntentDemandSlots.ts`.
 *
 * Population: OPEN GAME intents in the city + sport (not MATCHED — those are
 * in a proposal or reserved by an invite, and inviting them would not link),
 * not expired, not consumed by a seat, window still reachable, not blocked
 * either way, not already PLAYING that day. Per viewer, uncached: the city
 * pool is small and the result carries per-viewer fit.
 */
import { EntityType, PlayIntentStatus, type Sport } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '../../config/database';
import { getSportConfig } from '../../sport/sportRegistry';
import { PlayIntentService } from './playIntent.service';
import { PlayIntentMatchService } from './playIntentMatch.service';
import { intentWindowIsReachable } from './playIntentFreshness';
import { buildDemandSlots, type DemandIntent, type DemandSlot } from './playIntentDemandSlots';

/** Intents accept today .. today+2 (`MAX_DAY_OFFSET` in playIntent.service). */
const DEMAND_DAY_COUNT = 3;

export type DemandSlotsResult = {
  todayKey: string;
  cityTimezone: string;
  sport: Sport;
  partySize: number;
  viewerLevel: number | null;
  viewerIntentId: string | null;
  slots: DemandSlot[];
};

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export class PlayIntentDemandSlotsService {
  static async getForViewer(
    viewerId: string,
    cityId: string,
    sport: Sport,
    now: Date = new Date(),
  ): Promise<DemandSlotsResult> {
    const city = await prisma.city.findUnique({ where: { id: cityId }, select: { timezone: true } });
    const timezone = city?.timezone || 'UTC';
    const todayKey = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
    const [hh, mm] = formatInTimeZone(now, timezone, 'HH:mm').split(':').map(Number);
    const nowMinutes = hh * 60 + mm;
    const dayKeys = Array.from({ length: DEMAND_DAY_COUNT }, (_, i) => addDays(todayKey, i));
    const partySize = getSportConfig(sport).defaultPlayersPerMatch;

    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { gender: true, sportProfiles: { select: { sport: true, level: true } } },
    });
    const viewerLevel = viewer?.sportProfiles.find((p) => p.sport === sport)?.level ?? null;

    const viewerIntentRow = await prisma.playIntent.findFirst({
      where: {
        userId: viewerId,
        cityId,
        sport,
        entityType: EntityType.GAME,
        status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
        expiresAt: { gt: now },
      },
      include: { user: { select: { gender: true, sportProfiles: { select: { sport: true, level: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const viewerIntent =
      viewerIntentRow && intentWindowIsReachable(viewerIntentRow, timezone, now) ? viewerIntentRow : null;

    const rows = await prisma.playIntent.findMany({
      where: {
        cityId,
        sport,
        entityType: EntityType.GAME,
        status: PlayIntentStatus.OPEN,
        expiresAt: { gt: now },
        userId: { not: viewerId },
        dateKeys: { hasSome: dayKeys },
        gameParticipants: { none: {} },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            gender: true,
            sportProfiles: { select: { sport: true, level: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const blocked = await prisma.blockedUser.findMany({
      where: { OR: [{ userId: viewerId }, { blockedUserId: viewerId }] },
      select: { userId: true, blockedUserId: true },
    });
    const blockedIds = new Set(blocked.map((b) => (b.userId === viewerId ? b.blockedUserId : b.userId)));

    const reachable = rows.filter(
      (row) => !blockedIds.has(row.userId) && intentWindowIsReachable(row, timezone, now),
    );
    const userIds = [...new Set(reachable.map((row) => row.userId))];
    const busyByDateKey = new Map<string, Set<string>>();
    for (const dateKey of dayKeys) {
      busyByDateKey.set(dateKey, await PlayIntentMatchService.usersBusyPlaying(userIds, [dateKey], cityId));
    }

    const intents: DemandIntent[] = reachable.map((row) => ({
      intentId: row.id,
      userId: row.userId,
      criteria: PlayIntentService.toCriteria(row),
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      avatar: row.user.avatar,
      gender: row.user.gender,
    }));

    const slots = buildDemandSlots({
      viewer: {
        userId: viewerId,
        level: viewerLevel,
        gender: viewer?.gender ?? null,
        intent: viewerIntent ? PlayIntentService.toCriteria(viewerIntent) : null,
      },
      intents,
      dayKeys,
      todayKey,
      nowMinutes,
      busyByDateKey,
    });

    return {
      todayKey,
      cityTimezone: timezone,
      sport,
      partySize,
      viewerLevel,
      viewerIntentId: viewerIntent?.status === PlayIntentStatus.OPEN ? viewerIntent.id : null,
      slots,
    };
  }
}
