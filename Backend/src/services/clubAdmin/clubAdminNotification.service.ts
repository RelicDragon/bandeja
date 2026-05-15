import { ChatContextType, ChatType } from '@prisma/client';
import { MessageService } from '../chat/message.service';
import { UserChatService } from '../chat/userChat.service';

export class ClubAdminNotificationService {
  static async sendCourtCancellationDm(
    adminUserId: string,
    hostUserId: string,
    message: string
  ): Promise<void> {
    const trimmed = message.trim().slice(0, 500);
    if (!trimmed) return;

    const chat = await UserChatService.getOrCreateChatWithUser(adminUserId, hostUserId);
    await MessageService.createMessageWithEvent({
      chatContextType: ChatContextType.USER,
      contextId: chat.id,
      senderId: adminUserId,
      content: trimmed,
      mediaUrls: [],
      chatType: ChatType.PUBLIC,
    });
  }
}
