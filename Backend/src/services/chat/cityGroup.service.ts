import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ChatContextType, ParticipantRole } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ChatMuteService } from './chatMute.service';

function isPrismaUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export class CityGroupService {
  static async getCityGroupChannel(cityId: string) {
    return prisma.groupChannel.findUnique({
      where: { id: cityId, isCityGroup: true }
    });
  }

  static async ensureCityGroupExists(cityId: string) {
    const city = await prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true, name: true }
    });
    if (!city) {
      throw new ApiError(404, 'City not found');
    }
    const existing = await prisma.groupChannel.findUnique({
      where: { id: cityId }
    });
    if (existing) {
      if (!existing.isCityGroup) {
        throw new ApiError(409, 'Channel exists but is not a city group');
      }
      return existing;
    }
    try {
      return await prisma.groupChannel.create({
        data: {
        id: city.id,
        name: city.name,
        isChannel: false,
        isPublic: true,
        isCityGroup: true,
          participantsCount: 0
        }
      });
    } catch (err: unknown) {
      if (isPrismaUniqueViolation(err)) {
        const created = await prisma.groupChannel.findUnique({
          where: { id: cityId }
        });
        if (created?.isCityGroup) return created;
      }
      throw err;
    }
  }

  static async addUserToCityGroup(
    userId: string,
    cityId: string,
    options: { mute?: boolean; pin?: boolean } = {}
  ) {
    const { mute = true, pin = true } = options;
    const channel = await this.getCityGroupChannel(cityId);
    if (!channel) {
      return;
    }
    const groupChannelId = channel.id;

    const existing = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: { groupChannelId, userId }
      }
    });
    if (!existing) {
      await prisma.groupChannelParticipant.create({
        data: {
          groupChannelId,
          userId,
          role: ParticipantRole.PARTICIPANT
        }
      });
      await prisma.groupChannel.update({
        where: { id: groupChannelId },
        data: { participantsCount: { increment: 1 } }
      });
    }

    if (mute) {
      await ChatMuteService.muteChat(userId, ChatContextType.GROUP, groupChannelId);
    }

    if (pin) {
      await prisma.pinnedGroupChannel.upsert({
        where: {
          userId_groupChannelId: { userId, groupChannelId }
        },
        update: { pinnedAt: new Date() },
        create: { userId, groupChannelId }
      });
    }
  }

  static async removeUserFromCityGroup(userId: string, cityId: string) {
    const channel = await this.getCityGroupChannel(cityId);
    if (!channel) {
      return;
    }
    const groupChannelId = channel.id;

    const participant = await prisma.groupChannelParticipant.findUnique({
      where: {
        groupChannelId_userId: { groupChannelId, userId }
      }
    });
    if (participant) {
      await prisma.groupChannelParticipant.delete({
        where: {
          groupChannelId_userId: { groupChannelId, userId }
        }
      });
      const current = await prisma.groupChannel.findUnique({
        where: { id: groupChannelId },
        select: { participantsCount: true }
      });
      const nextCount = current ? Math.max(0, current.participantsCount - 1) : 0;
      await prisma.groupChannel.update({
        where: { id: groupChannelId },
        data: { participantsCount: nextCount }
      });
    }

    await prisma.pinnedGroupChannel
      .delete({
        where: { userId_groupChannelId: { userId, groupChannelId } }
      })
      .catch(() => {});
  }
}
