import { CourtSlotHoldLabel } from '@prisma/client';
import { isValidInstant } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import { ClubAdminService } from './clubAdmin.service';
import { clubAdminError, clubAdminNotFound, clubAdminValidation } from './clubAdminErrors';

export const MAX_HOLD_MINUTES = 24 * 60;
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

/** Window rules shared by create and update: end > start, at most 24 h, not entirely past. */
export function assertHoldWindow(startTime: Date, endTime: Date, now: Date = new Date()): void {
  if (endTime <= startTime) throw clubAdminValidation('endTime', 'must be after startTime');
  if (endTime.getTime() - startTime.getTime() > MAX_HOLD_MINUTES * 60_000) {
    throw clubAdminValidation('endTime', 'a hold cannot exceed 24 hours');
  }
  if (endTime <= now) throw clubAdminError(400, 'clubAdmin.holdInPast', 'Hold is entirely in the past');
}

/** The court must be this club's and active. */
export async function assertHoldCourt(clubId: string, courtId: unknown): Promise<string> {
  if (typeof courtId !== 'string' || !courtId) throw clubAdminValidation('courtId', 'is required');
  const court = await prisma.court.findFirst({ where: { id: courtId, clubId }, select: { id: true, isActive: true } });
  if (!court) throw clubAdminNotFound('Court');
  if (!court.isActive) throw clubAdminError(400, 'clubAdmin.courtInactive', 'Court is inactive');
  return court.id;
}

export class ClubAdminHoldService {
  static async createHold(
    userId: string,
    clubId: string,
    data: { courtId: unknown; startTime: unknown; endTime: unknown; label: unknown; note?: unknown }
  ) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const label = parseHoldLabel(data.label);
    const startTime = parseInstant(data.startTime, 'startTime');
    const endTime = parseInstant(data.endTime, 'endTime');
    const note = parseOptionalText(data.note, 'note');
    assertHoldWindow(startTime, endTime);
    const courtId = await assertHoldCourt(clubId, data.courtId);

    return prisma.courtSlotHold.create({
      data: {
        clubId,
        courtId,
        startTime,
        endTime,
        label,
        note: note ?? null,
        createdByUserId: userId,
      },
    });
  }

  static async updateHold(userId: string, clubId: string, holdId: string, data: Record<string, unknown>) {
    const hold = await prisma.courtSlotHold.findFirst({ where: { id: holdId, clubId } });
    if (!hold) throw clubAdminNotFound('Hold');
    await ClubAdminService.assertClubAdmin(userId, hold.clubId);

    const label = data.label !== undefined ? parseHoldLabel(data.label) : undefined;
    const note = parseOptionalText(data.note, 'note');
    const startTime = data.startTime !== undefined ? parseInstant(data.startTime, 'startTime') : hold.startTime;
    const endTime = data.endTime !== undefined ? parseInstant(data.endTime, 'endTime') : hold.endTime;
    const courtChanged = data.courtId !== undefined && data.courtId !== hold.courtId;
    const timeChanged = data.startTime !== undefined || data.endTime !== undefined;
    if (timeChanged || courtChanged) assertHoldWindow(startTime, endTime);
    const courtId = courtChanged ? await assertHoldCourt(hold.clubId, data.courtId) : hold.courtId;

    return prisma.courtSlotHold.update({
      where: { id: holdId },
      data: {
        ...(timeChanged ? { startTime, endTime } : {}),
        ...(courtChanged ? { courtId } : {}),
        ...(label ? { label } : {}),
        ...(note !== undefined ? { note } : {}),
      },
    });
  }

  static async deleteHold(userId: string, clubId: string, holdId: string) {
    const hold = await prisma.courtSlotHold.findFirst({ where: { id: holdId, clubId } });
    if (!hold) throw clubAdminNotFound('Hold');
    await ClubAdminService.assertClubAdmin(userId, hold.clubId);
    await prisma.courtSlotHold.delete({ where: { id: holdId } });
  }
}
