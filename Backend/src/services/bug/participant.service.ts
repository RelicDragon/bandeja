import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { GroupChannelService } from '../chat/groupChannel.service';

export class BugParticipantService {
  static async joinBugChat(bugId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { bugId }
    });
    if (!groupChannel) {
      throw new ApiError(404, 'Bug not found');
    }
    return GroupChannelService.joinGroupChannel(groupChannel.id, userId);
  }

  static async leaveBugChat(bugId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { bugId }
    });
    if (!groupChannel) {
      throw new ApiError(404, 'Bug not found');
    }
    return GroupChannelService.leaveGroupChannel(groupChannel.id, userId);
  }

  static async isParticipant(bugId: string, userId: string): Promise<boolean> {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { bugId }
    });
    if (!groupChannel) return false;
    return GroupChannelService.isParticipant(groupChannel.id, userId);
  }
}

