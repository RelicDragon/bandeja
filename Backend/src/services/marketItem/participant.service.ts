import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { GroupChannelService } from '../chat/groupChannel.service';

export class MarketItemParticipantService {
  // NOTE: These methods are DEPRECATED in the new private buyer-seller chat system.
  // Buyers are automatically added to their private chat when they express interest or click "Ask seller".
  // Keeping these for backward compatibility, but they now work with buyer-specific chats.

  static async joinMarketItemChat(marketItemId: string, userId: string) {
    // Find buyer's specific chat with seller
    const groupChannel = await prisma.groupChannel.findUnique({
      where: {
        GroupChannel_marketItemId_buyerId_key: {
          marketItemId,
          buyerId: userId,
        },
      },
    });
    if (!groupChannel) {
      throw new ApiError(404, 'Chat not found. Use "Ask seller" or "Express interest" to create a chat.');
    }
    return GroupChannelService.joinGroupChannel(groupChannel.id, userId);
  }

  static async leaveMarketItemChat(marketItemId: string, userId: string) {
    // Find buyer's specific chat with seller
    const groupChannel = await prisma.groupChannel.findUnique({
      where: {
        GroupChannel_marketItemId_buyerId_key: {
          marketItemId,
          buyerId: userId,
        },
      },
    });
    if (!groupChannel) {
      throw new ApiError(404, 'Chat not found');
    }
    return GroupChannelService.leaveGroupChannel(groupChannel.id, userId);
  }

  static async isParticipant(marketItemId: string, userId: string): Promise<boolean> {
    // Find buyer's specific chat with seller
    const groupChannel = await prisma.groupChannel.findUnique({
      where: {
        GroupChannel_marketItemId_buyerId_key: {
          marketItemId,
          buyerId: userId,
        },
      },
    });
    if (!groupChannel) return false;
    return GroupChannelService.isParticipant(groupChannel.id, userId);
  }
}
