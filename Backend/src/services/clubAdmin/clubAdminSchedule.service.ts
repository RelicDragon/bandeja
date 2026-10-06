import { ClubIntegrationType, ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import {
  countUnmappedExternalCourts,
  getSnapshotDateMeta,
} from '../../shared/booktimeBusySnapshot';
import { UNASSIGNED_COURT_KEY } from '../../shared/clubScheduleConstants';
import {
  CourtOccupancyService,
  mapExternalBlockToScheduleSlot,
  mapHoldBlockToScheduleSlot,
} from '../game/courtOccupancy.service';
import { ScheduleConflict, ScheduleSlot } from './clubAdmin.types';
import { clubDayWindowUtc, clubLocalDate, isClubDate } from '@bandeja/shared/clubAdmin/clubTime';
import { clubAdminNotFound, clubAdminValidation } from './clubAdminErrors';
import { gameBelongsToClubWhere } from './clubAdminGameScope';
import type { ClubAdminCourtRef, ClubDayHours } from '@bandeja/shared/clubAdmin/contract';
import { loadClubHoursSource, resolveDayHours } from './clubAdminHours.service';
import { loadBillingSummaries } from './clubAdminBillingSummary.service';

/** Providers whose busy snapshots live in our tables (`Club*BusySnapshot`). */
export const SNAPSHOT_INTEGRATIONS: ReadonlySet<ClubIntegrationType> = new Set([
  ClubIntegrationType.BOOKTIME,
  ClubIntegrationType.PADELOO,
  ClubIntegrationType.KLIKTEREN,
]);

export { UNASSIGNED_COURT_KEY };

const ACTIVE_GAME_STATUSES = ['ANNOUNCED', 'STARTED'] as const;

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function scheduleSlotCourtKey(slot: ScheduleSlot): string | null {
  if (slot.type === 'game') return slot.courtId ?? UNASSIGNED_COURT_KEY;
  return slot.courtId;
}

export function detectScheduleConflicts(slots: ScheduleSlot[]): ScheduleConflict[] {
  const byCourt = new Map<string, ScheduleSlot[]>();
  for (const slot of slots) {
    const courtId = scheduleSlotCourtKey(slot);
    if (!courtId) continue;
    if (!byCourt.has(courtId)) byCourt.set(courtId, []);
    byCourt.get(courtId)!.push(slot);
  }

  const conflicts: ScheduleConflict[] = [];
  for (const [courtId, courtSlots] of byCourt) {
    for (let i = 0; i < courtSlots.length; i++) {
      for (let j = i + 1; j < courtSlots.length; j++) {
        const a = courtSlots[i];
        const b = courtSlots[j];
        const aStart = new Date(a.startTime);
        const aEnd = new Date(a.endTime);
        const bStart = new Date(b.startTime);
        const bEnd = new Date(b.endTime);
        if (!overlaps(aStart, aEnd, bStart, bEnd)) continue;
        const kinds = [a.type, b.type].filter(
          (k): k is ScheduleConflict['kinds'][number] =>
            k === 'game' || k === 'game_court' || k === 'external' || k === 'hold'
        );
        conflicts.push({
          courtId,
          startTime: new Date(Math.max(aStart.getTime(), bStart.getTime())).toISOString(),
          endTime: new Date(Math.min(aEnd.getTime(), bEnd.getTime())).toISOString(),
          kinds: [...new Set(kinds)],
        });
      }
    }
  }
  return conflicts;
}

export class ClubAdminScheduleService {
  static async buildDaySchedule(
    clubId: string,
    dateInput: string | undefined,
    courtId?: string
  ): Promise<{
    slots: ScheduleSlot[];
    conflicts: ScheduleConflict[];
    isLoadingExternalSlots: boolean;
    externalSlotsFailed: boolean;
    snapshotFetchedAt: string | null;
    hasSnapshotForDate: boolean;
    unmappedExternalCourtCount: number;
    date: string;
    timezone: string;
    hours: ClubDayHours | null;
    slotMinutes: number;
    courts: ClubAdminCourtRef[];
  }> {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        integrationType: true,
        currency: true,
        defaultSlotMinutes: true,
        city: { select: { timezone: true } },
      },
    });
    if (!club) throw clubAdminNotFound('Club');
    const timezone = club.city.timezone;
    if (dateInput !== undefined && !isClubDate(dateInput)) throw clubAdminValidation('date', 'must be yyyy-MM-dd');
    const dateStr = dateInput ?? clubLocalDate(new Date(), timezone);
    // Club-local calendar day (23 h / 25 h on DST days) — games, holds and snapshots agree.
    const { start: dayStart, end: dayEnd } = clubDayWindowUtc(dateStr, timezone);

    const gameWhere: Prisma.GameWhereInput = {
      timeIsSet: true,
      status: { in: [...ACTIVE_GAME_STATUSES] },
      ...gameBelongsToClubWhere(clubId),
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
    };
    if (courtId) {
      gameWhere.AND = [
        { OR: [{ courtId }, { courtId: null }, { gameCourts: { some: { courtId } } }] },
      ];
    }

    const integrationType = club.integrationType;
    const hasSnapshots = integrationType != null && SNAPSHOT_INTEGRATIONS.has(integrationType);

    const [games, occupancyResult, dateMeta, unmappedCount, hoursSource, courtRows] = await Promise.all([
      prisma.game.findMany({
        where: gameWhere,
        include: {
          court: { select: { id: true, name: true } },
          gameCourts: { include: { court: { select: { id: true, name: true, clubId: true } } } },
          participants: {
            where: { role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] } },
            take: 1,
            orderBy: { role: 'asc' },
            include: { user: { select: USER_SELECT_FIELDS } },
          },
          _count: { select: { participants: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      CourtOccupancyService.getOccupancy({
        clubId,
        rangeStart: dayStart,
        rangeEnd: dayEnd,
        courtId,
        includeUnmapped: !courtId,
        gameCourtFilter: 'admin',
        sources: { games: false, holds: true, externals: true },
      }),
      hasSnapshots
        ? getSnapshotDateMeta(clubId, dateStr, integrationType)
        : Promise.resolve({ snapshotFetchedAt: null, hasSnapshotForDate: false }),
      hasSnapshots ? countUnmappedExternalCourts(clubId, integrationType) : Promise.resolve(0),
      loadClubHoursSource(clubId, timezone, { fromDate: dateStr, toDate: dateStr }),
      prisma.court.findMany({
        where: { clubId },
        select: { id: true, name: true, isIndoor: true, sport: true, isActive: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const slots: ScheduleSlot[] = [];

    for (const game of games) {
      const hostUser = game.participants[0]?.user;
      const host = hostUser
        ? {
            id: hostUser.id,
            firstName: hostUser.firstName,
            lastName: hostUser.lastName,
            avatar: hostUser.avatar,
          }
        : { id: '', firstName: null, lastName: null, avatar: null };

      const base = {
        gameId: game.id,
        startTime: game.startTime.toISOString(),
        endTime: game.endTime.toISOString(),
        hasBookedCourt: game.hasBookedCourt,
        status: game.status,
        entityType: game.entityType,
        name: game.name,
        host,
        participantCount: game._count.participants,
        maxParticipants: game.maxParticipants,
      };

      // Only this club's court slots go on this club's grid.
      const clubSlots = game.gameCourts.filter((gc) => gc.court.clubId === clubId);
      if (clubSlots.length > 0) {
        for (const gc of clubSlots) {
          if (courtId && gc.courtId !== courtId) continue;
          slots.push({
            type: 'game_court',
            ...base,
            courtId: gc.courtId,
          });
        }
      } else if (!courtId || game.courtId === courtId || game.courtId === null) {
        slots.push({
          type: 'game',
          ...base,
          courtId: game.courtId,
        });
      }
    }

    let externalSlotsFailed = false;
    try {
      for (const block of occupancyResult.blocks) {
        if (block.kind === 'hold') {
          const holdSlot = mapHoldBlockToScheduleSlot(block);
          if (holdSlot) slots.push(holdSlot);
          continue;
        }
        if (block.kind === 'external') {
          if (courtId && block.courtId !== courtId) continue;
          const externalSlot = mapExternalBlockToScheduleSlot(block);
          if (externalSlot) slots.push(externalSlot);
        }
      }
    } catch (err) {
      console.error('Club admin schedule booking snapshot error', err);
      externalSlotsFailed = true;
    }

    slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
    await enrichScheduleSlots(clubId, club.currency, slots);
    return {
      slots,
      conflicts: detectScheduleConflicts(slots),
      isLoadingExternalSlots: occupancyResult.isLoadingExternalSlots,
      externalSlotsFailed,
      snapshotFetchedAt: dateMeta.snapshotFetchedAt?.toISOString() ?? null,
      hasSnapshotForDate: dateMeta.hasSnapshotForDate,
      unmappedExternalCourtCount: unmappedCount,
      date: dateStr,
      timezone,
      hours: resolveDayHours(hoursSource, dateStr),
      slotMinutes: club.defaultSlotMinutes ?? DEFAULT_SLOT_MINUTES,
      courts: courtRows.map((c) => ({ ...c, sport: c.sport ?? null })),
    };
  }
}

export const DEFAULT_SLOT_MINUTES = 30;

/**
 * Console v2 additive fields: hold customer/series (never on occupancy blocks — those also
 * feed player-facing availability) and billing summaries for games and holds.
 */
async function enrichScheduleSlots(clubId: string, currency: string, slots: ScheduleSlot[]): Promise<void> {
  const holdIds = [...new Set(slots.flatMap((s) => (s.type === 'hold' ? [s.holdId] : [])))];
  const holdRows = holdIds.length
    ? await prisma.courtSlotHold.findMany({
        where: { id: { in: holdIds } },
        select: { id: true, seriesId: true, customerName: true, customerPhone: true },
      })
    : [];
  const holdById = new Map(holdRows.map((h) => [h.id, h]));
  const gameTargets = new Map<string, { gameId: string; courtId: string | null; startTime: Date; endTime: Date }>();
  for (const s of slots) {
    if ((s.type === 'game' || s.type === 'game_court') && !gameTargets.has(s.gameId)) {
      gameTargets.set(s.gameId, { gameId: s.gameId, courtId: s.courtId, startTime: new Date(s.startTime), endTime: new Date(s.endTime) });
    }
  }
  const summaries = await loadBillingSummaries(clubId, currency, {
    games: [...gameTargets.values()],
    holds: slots.flatMap((s) =>
      s.type === 'hold' ? [{ holdId: s.holdId, courtId: s.courtId, startTime: new Date(s.startTime), endTime: new Date(s.endTime) }] : []
    ),
  });
  for (const s of slots) {
    if (s.type === 'hold') {
      const row = holdById.get(s.holdId);
      s.seriesId = row?.seriesId ?? null;
      s.customerName = row?.customerName ?? null;
      s.customerPhone = row?.customerPhone ?? null;
      s.billing = summaries.hold.get(s.holdId) ?? null;
    } else if (s.type === 'game' || s.type === 'game_court') {
      s.billing = summaries.game.get(s.gameId) ?? null;
    }
  }
}
