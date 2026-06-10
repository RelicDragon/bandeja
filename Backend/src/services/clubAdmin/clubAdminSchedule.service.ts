import { ClubIntegrationType, ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import {
  countUnmappedExternalCourts,
  getSnapshotDateMeta,
  loadMergedBusySlots,
} from '../../shared/booktimeBusySnapshot';
import { UNASSIGNED_COURT_KEY } from '../../shared/clubScheduleConstants';
import { ScheduleConflict, ScheduleSlot } from './clubAdmin.types';

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
    dateStr: string,
    courtId?: string
  ): Promise<{
    slots: ScheduleSlot[];
    conflicts: ScheduleConflict[];
    isLoadingExternalSlots: boolean;
    externalSlotsFailed: boolean;
    snapshotFetchedAt: string | null;
    hasSnapshotForDate: boolean;
    unmappedExternalCourtCount: number;
  }> {
    const dayStart = new Date(dateStr);
    if (Number.isNaN(dayStart.getTime())) {
      dayStart.setHours(0, 0, 0, 0);
    } else {
      dayStart.setUTCHours(0, 0, 0, 0);
    }
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const gameWhere: Prisma.GameWhereInput = {
      timeIsSet: true,
      status: { in: [...ACTIVE_GAME_STATUSES] },
      OR: [{ clubId }, { court: { clubId } }],
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
    };
    if (courtId) {
      gameWhere.AND = [
        { OR: [{ courtId }, { courtId: null }, { gameCourts: { some: { courtId } } }] },
      ];
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { integrationType: true },
    });

    const [games, holds] = await Promise.all([
      prisma.game.findMany({
        where: gameWhere,
        include: {
          court: { select: { id: true, name: true } },
          gameCourts: { include: { court: { select: { id: true, name: true } } } },
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
      prisma.courtSlotHold.findMany({
        where: {
          clubId,
          ...(courtId ? { courtId } : {}),
          startTime: { lt: dayEnd },
          endTime: { gt: dayStart },
        },
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
      };

      if (game.gameCourts.length > 0) {
        for (const gc of game.gameCourts) {
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

    for (const hold of holds) {
      slots.push({
        type: 'hold',
        holdId: hold.id,
        courtId: hold.courtId,
        label: hold.label,
        note: hold.note,
        startTime: hold.startTime.toISOString(),
        endTime: hold.endTime.toISOString(),
      });
    }

    let isLoadingExternalSlots = false;
    let externalSlotsFailed = false;
    let snapshotFetchedAt: string | null = null;
    let hasSnapshotForDate = false;
    let unmappedExternalCourtCount = 0;

    if (club?.integrationType === ClubIntegrationType.BOOKTIME) {
      try {
        const [merged, dateMeta, unmappedCount] = await Promise.all([
          loadMergedBusySlots({
            clubId,
            rangeStart: dayStart,
            rangeEnd: dayEnd,
            filterCourtId: courtId,
            includeUnmapped: !courtId,
          }),
          getSnapshotDateMeta(clubId, dateStr),
          countUnmappedExternalCourts(clubId),
        ]);
        isLoadingExternalSlots = merged.isLoading;
        snapshotFetchedAt = dateMeta.snapshotFetchedAt?.toISOString() ?? null;
        hasSnapshotForDate = dateMeta.hasSnapshotForDate;
        unmappedExternalCourtCount = unmappedCount;

        for (const slot of merged.slots) {
          if (courtId && slot.courtId !== courtId) continue;
          slots.push({
            type: 'external',
            courtId: slot.courtId!,
            courtName: slot.courtName,
            startTime: slot.startTime,
            endTime: slot.endTime,
          });
        }
      } catch (err) {
        console.error('Club admin schedule booking snapshot error', err);
        externalSlotsFailed = true;
      }
    }

    slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return {
      slots,
      conflicts: detectScheduleConflicts(slots),
      isLoadingExternalSlots,
      externalSlotsFailed,
      snapshotFetchedAt,
      hasSnapshotForDate,
      unmappedExternalCourtCount,
    };
  }
}
