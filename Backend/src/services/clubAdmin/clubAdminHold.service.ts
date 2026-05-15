import { CourtSlotHoldLabel } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ClubAdminService } from './clubAdmin.service';

const MAX_HOLD_HOURS = 6;

export class ClubAdminHoldService {
  static async createHold(
    userId: string,
    clubId: string,
    data: {
      courtId: string;
      startTime: string;
      endTime: string;
      label: CourtSlotHoldLabel;
      note?: string;
    }
  ) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const court = await prisma.court.findFirst({ where: { id: data.courtId, clubId } });
    if (!court) throw new ApiError(404, 'Court not found');

    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    if (endTime <= startTime) throw new ApiError(400, 'endTime must be after startTime');
    const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    if (hours > MAX_HOLD_HOURS) {
      throw new ApiError(400, `Hold duration cannot exceed ${MAX_HOLD_HOURS} hours`);
    }

    return prisma.courtSlotHold.create({
      data: {
        clubId,
        courtId: data.courtId,
        startTime,
        endTime,
        label: data.label,
        note: data.note?.slice(0, 500) ?? null,
        createdByUserId: userId,
      },
    });
  }

  static async updateHold(
    userId: string,
    holdId: string,
    data: Partial<{
      startTime: string;
      endTime: string;
      label: CourtSlotHoldLabel;
      note: string | null;
    }>
  ) {
    const hold = await prisma.courtSlotHold.findUnique({ where: { id: holdId } });
    if (!hold) throw new ApiError(404, 'Hold not found');
    await ClubAdminService.assertClubAdmin(userId, hold.clubId);

    const startTime = data.startTime ? new Date(data.startTime) : hold.startTime;
    const endTime = data.endTime ? new Date(data.endTime) : hold.endTime;
    if (endTime <= startTime) throw new ApiError(400, 'endTime must be after startTime');
    const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    if (hours > MAX_HOLD_HOURS) {
      throw new ApiError(400, `Hold duration cannot exceed ${MAX_HOLD_HOURS} hours`);
    }

    return prisma.courtSlotHold.update({
      where: { id: holdId },
      data: {
        ...(data.startTime && { startTime }),
        ...(data.endTime && { endTime }),
        ...(data.label && { label: data.label }),
        ...(data.note !== undefined && { note: data.note?.slice(0, 500) ?? null }),
      },
    });
  }

  static async deleteHold(userId: string, holdId: string) {
    const hold = await prisma.courtSlotHold.findUnique({ where: { id: holdId } });
    if (!hold) throw new ApiError(404, 'Hold not found');
    await ClubAdminService.assertClubAdmin(userId, hold.clubId);
    await prisma.courtSlotHold.delete({ where: { id: holdId } });
  }
}
