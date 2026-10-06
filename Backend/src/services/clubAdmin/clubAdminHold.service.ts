import { randomUUID } from 'node:crypto';
import { CourtSlotHoldLabel } from '@prisma/client';
import type { CreateHoldResponse, HoldDeleteScope, HoldOverlapDetails } from '@bandeja/shared/clubAdmin/contract';
import {
  addDaysToDate,
  clubLocalDate,
  clubLocalMinutes,
  clubWallTimeToUtc,
  daysBetweenInclusive,
  isValidInstant,
} from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import { CourtOccupancyService } from '../game/courtOccupancy.service';
import { ClubAdminService } from './clubAdmin.service';
import { clubAdminError, clubAdminNotFound, clubAdminValidation } from './clubAdminErrors';
import { logClubActivity } from './clubAdminActivity.service';

export const MAX_HOLD_MINUTES = 24 * 60;
export const MAX_REPEAT_WEEKS = 26;
const MAX_NOTE_LENGTH = 500;

const HOLD_LABELS = new Set<string>(Object.values(CourtSlotHoldLabel));

export function parseHoldLabel(raw: unknown, field = 'label'): CourtSlotHoldLabel {
  if (typeof raw !== 'string' || !HOLD_LABELS.has(raw)) throw clubAdminValidation(field, 'unknown hold label');
  return raw as CourtSlotHoldLabel;
}

export function parseInstant(raw: unknown, field: string): Date {
  if (!isValidInstant(raw)) throw clubAdminValidation(field, 'must be an ISO-8601 instant');
  return new Date(raw);
}

export function parseOptionalText(raw: unknown, field: string, max = MAX_NOTE_LENGTH): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') throw clubAdminValidation(field, 'must be a string');
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function parseOptionalBoolean(raw: unknown, field: string): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'boolean') throw clubAdminValidation(field, 'must be a boolean');
  return raw;
}

/** Window rules shared by create and update: end > start, at most 24 h, not entirely past. */
export function assertHoldWindow(startTime: Date, endTime: Date, now: Date = new Date()): void {
  if (endTime <= startTime) throw clubAdminValidation('endTime', 'must be after startTime');
  if (endTime.getTime() - startTime.getTime() > MAX_HOLD_MINUTES * 60_000) {
    throw clubAdminValidation('endTime', 'a hold cannot exceed 24 hours');
  }
  if (endTime <= now) throw clubAdminError(400, 'clubAdmin.holdInPast', 'Hold is entirely in the past');
}

/** The court must be this club's and active. */
export async function assertHoldCourt(clubId: string, courtId: unknown): Promise<{ id: string; name: string }> {
  if (typeof courtId !== 'string' || !courtId) throw clubAdminValidation('courtId', 'is required');
  const court = await prisma.court.findFirst({
    where: { id: courtId, clubId },
    select: { id: true, name: true, isActive: true },
  });
  if (!court) throw clubAdminNotFound('Court');
  if (!court.isActive) throw clubAdminError(400, 'clubAdmin.courtInactive', 'Court is inactive');
  return court;
}

export interface HoldInterval {
  start: Date;
  end: Date;
}

/**
 * Weekly occurrences at the same club-local wall time (DST-safe): occurrence 0 is the
 * requested window, occurrence i starts on the same weekday i weeks later.
 */
export function weeklyOccurrences(start: Date, end: Date, weeks: number, timezone: string): HoldInterval[] {
  const startDate = clubLocalDate(start, timezone);
  const startMin = clubLocalMinutes(start, timezone);
  const endDate = clubLocalDate(end, timezone);
  const endMin = clubLocalMinutes(end, timezone) + 1440 * (daysBetweenInclusive(startDate, endDate) - 1);
  const out: HoldInterval[] = [{ start, end }];
  for (let i = 1; i < weeks; i++) {
    const date = addDaysToDate(startDate, 7 * i);
    out.push({ start: clubWallTimeToUtc(date, startMin, timezone), end: clubWallTimeToUtc(date, endMin, timezone) });
  }
  return out;
}

type Overlap = HoldOverlapDetails['overlaps'][number];

/** Everything on `courtId` (games, live holds, external bookings) overlapping any interval. */
export async function findHoldOverlaps(
  clubId: string,
  courtId: string,
  intervals: HoldInterval[],
  excludeHoldIds: ReadonlySet<string> = new Set()
): Promise<Overlap[][]> {
  if (intervals.length === 0) return [];
  const rangeStart = new Date(Math.min(...intervals.map((i) => i.start.getTime())));
  const rangeEnd = new Date(Math.max(...intervals.map((i) => i.end.getTime())));
  const { blocks } = await CourtOccupancyService.getOccupancy({
    clubId,
    rangeStart,
    rangeEnd,
    courtId,
    gameCourtFilter: 'admin',
  });
  return intervals.map(({ start, end }) =>
    blocks
      .filter((b) => b.courtId === courtId)
      .filter((b) => !(b.kind === 'hold' && b.holdId && excludeHoldIds.has(b.holdId)))
      .filter((b) => new Date(b.startTime) < end && new Date(b.endTime) > start)
      .map((b) => ({
        kind: b.kind,
        courtId,
        startTime: b.startTime,
        endTime: b.endTime,
        id: b.kind === 'game' ? (b.gameId ?? null) : b.kind === 'hold' ? (b.holdId ?? null) : null,
      }))
  );
}

function overlapError(overlaps: Overlap[]) {
  const details: HoldOverlapDetails = { overlaps };
  return clubAdminError(409, 'clubAdmin.holdOverlap', 'The court is already booked at that time', details);
}

export interface HoldActor {
  userId: string;
  clubId: string;
  timezone: string;
}

export class ClubAdminHoldService {
  /**
   * `POST /clubs/:clubId/holds`. The response keeps the legacy shape (the first hold row) and
   * adds `CreateHoldResponse` fields. Overlap detection (409 `holdOverlap`, repeat skipping) runs
   * only with `detectOverlap: true` — shipped builds share this path and never send it.
   */
  static async createHold(actor: HoldActor, data: Record<string, unknown>) {
    const { userId, clubId, timezone } = actor;
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const label = parseHoldLabel(data.label);
    const startTime = parseInstant(data.startTime, 'startTime');
    const endTime = parseInstant(data.endTime, 'endTime');
    const note = parseOptionalText(data.note, 'note');
    const customerName = parseOptionalText(data.customerName, 'customerName', 100);
    const customerPhone = parseOptionalText(data.customerPhone, 'customerPhone', 40);
    // Store builds post here without `detectOverlap` and swallow errors: they always create.
    const detectOverlap = parseOptionalBoolean(data.detectOverlap, 'detectOverlap') === true;
    const force = parseOptionalBoolean(data.force, 'force') ?? false;
    const repeatWeeks = data.repeatWeeks === undefined || data.repeatWeeks === null ? 1 : data.repeatWeeks;
    if (typeof repeatWeeks !== 'number' || !Number.isInteger(repeatWeeks) || repeatWeeks < 1 || repeatWeeks > MAX_REPEAT_WEEKS) {
      throw clubAdminValidation('repeatWeeks', `must be an integer 1..${MAX_REPEAT_WEEKS}`);
    }
    assertHoldWindow(startTime, endTime);
    const court = await assertHoldCourt(clubId, data.courtId);

    const occurrences = weeklyOccurrences(startTime, endTime, repeatWeeks, timezone);
    const skipped: CreateHoldResponse['skipped'] = [];
    let toCreate = occurrences;
    if (detectOverlap && !force) {
      const overlaps = await findHoldOverlaps(clubId, court.id, occurrences);
      const clashing = overlaps.flat();
      if (repeatWeeks === 1 && clashing.length > 0) throw overlapError(clashing);
      toCreate = occurrences.filter((_, i) => overlaps[i].length === 0);
      for (let i = 0; i < occurrences.length; i++) {
        if (overlaps[i].length > 0) {
          skipped.push({ startTime: occurrences[i].start.toISOString(), endTime: occurrences[i].end.toISOString() });
        }
      }
      if (toCreate.length === 0) throw overlapError(clashing);
    }

    const seriesId = repeatWeeks > 1 ? randomUUID() : null;
    const rows = await prisma.$transaction(
      toCreate.map((occ) =>
        prisma.courtSlotHold.create({
          data: {
            clubId,
            courtId: court.id,
            startTime: occ.start,
            endTime: occ.end,
            label,
            note: note ?? null,
            customerName: customerName ?? null,
            customerPhone: customerPhone ?? null,
            seriesId,
            createdByUserId: userId,
          },
        })
      )
    );
    await logClubActivity(clubId, userId, 'HOLD_CREATED', {
      court: court.name,
      label,
      startTime: rows[0].startTime.toISOString(),
      endTime: rows[0].endTime.toISOString(),
      count: rows.length,
    });
    const response: CreateHoldResponse = { holdIds: rows.map((r) => r.id), seriesId, skipped };
    return { ...rows[0], ...response };
  }

  /**
   * `PATCH /holds/:holdId` (legacy, never checks overlaps) and `PATCH /clubs/:clubId/holds/:holdId`
   * (v2, `checkOverlap`: checks only when the body opts in with `detectOverlap: true`).
   */
  static async updateHold(
    actor: HoldActor,
    holdId: string,
    data: Record<string, unknown>,
    options: { checkOverlap: boolean }
  ) {
    const { userId, clubId } = actor;
    const hold = await prisma.courtSlotHold.findFirst({ where: { id: holdId, clubId, deletedAt: null } });
    if (!hold) throw clubAdminNotFound('Hold');
    await ClubAdminService.assertClubAdmin(userId, hold.clubId);

    const label = data.label !== undefined ? parseHoldLabel(data.label) : undefined;
    const note = parseOptionalText(data.note, 'note');
    const customerName = parseOptionalText(data.customerName, 'customerName', 100);
    const customerPhone = parseOptionalText(data.customerPhone, 'customerPhone', 40);
    const detectOverlap = parseOptionalBoolean(data.detectOverlap, 'detectOverlap') === true;
    const force = parseOptionalBoolean(data.force, 'force') ?? false;
    const startTime = data.startTime !== undefined ? parseInstant(data.startTime, 'startTime') : hold.startTime;
    const endTime = data.endTime !== undefined ? parseInstant(data.endTime, 'endTime') : hold.endTime;
    const courtChanged = data.courtId !== undefined && data.courtId !== hold.courtId;
    const timeChanged =
      startTime.getTime() !== hold.startTime.getTime() || endTime.getTime() !== hold.endTime.getTime();
    if (timeChanged || courtChanged) assertHoldWindow(startTime, endTime);
    const court = courtChanged ? await assertHoldCourt(hold.clubId, data.courtId) : null;
    const courtId = court?.id ?? hold.courtId;

    if (options.checkOverlap && detectOverlap && !force && (timeChanged || courtChanged)) {
      const [overlaps] = await findHoldOverlaps(clubId, courtId, [{ start: startTime, end: endTime }], new Set([hold.id]));
      if (overlaps.length > 0) throw overlapError(overlaps);
    }

    const updated = await prisma.courtSlotHold.update({
      where: { id: holdId },
      data: {
        ...(timeChanged ? { startTime, endTime } : {}),
        ...(courtChanged ? { courtId } : {}),
        ...(label ? { label } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(customerName !== undefined ? { customerName } : {}),
        ...(customerPhone !== undefined ? { customerPhone } : {}),
      },
    });
    const courtName = court?.name ?? (await prisma.court.findUnique({ where: { id: courtId }, select: { name: true } }))?.name ?? null;
    await logClubActivity(clubId, userId, 'HOLD_UPDATED', {
      court: courtName,
      label: updated.label,
      startTime: updated.startTime.toISOString(),
      endTime: updated.endTime.toISOString(),
    });
    return updated;
  }

  /** Soft delete. `following` = this hold and every later live hold of its series. */
  static async deleteHold(actor: HoldActor, holdId: string, scope: HoldDeleteScope = 'one'): Promise<{ deletedIds: string[] }> {
    const { userId, clubId } = actor;
    const hold = await prisma.courtSlotHold.findFirst({
      where: { id: holdId, clubId, deletedAt: null },
      include: { court: { select: { name: true } } },
    });
    if (!hold) throw clubAdminNotFound('Hold');
    await ClubAdminService.assertClubAdmin(userId, hold.clubId);

    const targets =
      scope === 'following' && hold.seriesId
        ? await prisma.courtSlotHold.findMany({
            where: { clubId, seriesId: hold.seriesId, deletedAt: null, startTime: { gte: hold.startTime } },
            select: { id: true },
          })
        : [{ id: hold.id }];
    const ids = targets.map((t) => t.id);
    await prisma.courtSlotHold.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: userId },
    });
    await logClubActivity(clubId, userId, 'HOLD_DELETED', {
      court: hold.court.name,
      label: hold.label,
      startTime: hold.startTime.toISOString(),
      count: ids.length,
    });
    return { deletedIds: ids };
  }
}

export function parseHoldDeleteScope(raw: unknown): HoldDeleteScope {
  if (raw === undefined || raw === null || raw === '' || raw === 'one') return 'one';
  if (raw === 'following') return 'following';
  throw clubAdminValidation('scope', 'must be one or following');
}
