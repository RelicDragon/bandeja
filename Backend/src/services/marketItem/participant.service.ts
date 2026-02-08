import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { GroupChannelService } from '../chat/groupChannel.service';

export class MarketItemParticipantService {
  static async joinMarketItemChat(marketItemId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { marketItemId },
    });
    if (!groupChannel) {
      throw new ApiError(404, 'Market item not found');
    }
    return GroupChannelService.joinGroupChannel(groupChannel.id, userId);
  }

  static async leaveMarketItemChat(marketItemId: string, userId: string) {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { marketItemId },
    });
    if (!groupChannel) {
      throw new ApiError(404, 'Market item not found');
    }
    return GroupChannelService.leaveGroupChannel(groupChannel.id, userId);
  }

  static async isParticipant(marketItemId: string, userId: string): Promise<boolean> {
    const groupChannel = await prisma.groupChannel.findUnique({
      where: { marketItemId },
    });
    if (!groupChannel) return false;
    return GroupChannelService.isParticipant(groupChannel.id, userId);
  }
}
