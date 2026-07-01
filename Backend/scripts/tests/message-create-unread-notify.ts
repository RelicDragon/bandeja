import * as dotenv from 'dotenv';
import * as path from 'path';
import { ChatContextType, ChatType } from '@prisma/client';
import prisma from '../../src/config/database';
import { MessageService } from '../../src/services/chat/message.service';
import { notifyRecipientsOnMessageCreate } from '../../src/services/chat/messageCreateUnreadNotify.service';
import { ReadReceiptService } from '../../src/services/chat/readReceipt.service';
import { UserChatService } from '../../src/services/chat/userChat.service';

dotenv.config({ path: path.join(__dirname, '../../.env') });

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function waitForCondition(check: () => Promise<boolean>, label: string): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(false, label);
}

async function main(): Promise<void> {
  const suffix = Date.now();
  const sender = await prisma.user.create({
    data: {
      email: `msg-unread-sender-${suffix}@test.local`,
      firstName: 'Sender',
      lastName: 'Test',
    },
    select: { id: true },
  });
  const recipient = await prisma.user.create({
    data: {
      email: `msg-unread-recipient-${suffix}@test.local`,
      firstName: 'Recipient',
      lastName: 'Test',
    },
    select: { id: true },
  });

  try {
    const chat = await UserChatService.getOrCreateChatWithUser(sender.id, recipient.id);
    const message = await MessageService.createMessageWithEvent({
      chatContextType: ChatContextType.USER,
      contextId: chat.id,
      senderId: sender.id,
      content: `unread notify ${suffix}`,
      mediaUrls: [],
      chatType: ChatType.PUBLIC,
    });

    const contextKey = `USER:${chat.id}` as const;

    await waitForCondition(async () => {
      const row = await prisma.userUnreadState.findUnique({ where: { userId: recipient.id } });
      return row != null;
    }, 'recipient user revision bumped after message create');

    const senderRevision = await prisma.userUnreadState.findUnique({ where: { userId: sender.id } });
    assert(senderRevision == null, 'sender user revision unchanged after message create');

    let recipientRevision = await prisma.userUnreadState.findUnique({ where: { userId: recipient.id } });
    assert((recipientRevision?.unreadRevision ?? 0) >= 1, 'recipient user revision at least 1');

    const recipientContextRevision = await prisma.userContextUnreadState.findUnique({
      where: { userId_contextKey: { userId: recipient.id, contextKey } },
    });
    assert(recipientContextRevision != null, 'recipient context revision row exists');
    assert((recipientContextRevision?.unreadRevision ?? 0) >= 1, 'recipient context revision at least 1');

    const sqlCount = await ReadReceiptService.getUnreadCountForContext('USER', chat.id, recipient.id);
    assert(sqlCount >= 1, 'recipient unread count from SQL includes new message');

    await prisma.userContextUnreadState.deleteMany({
      where: { userId: recipient.id, contextKey },
    });
    await prisma.userUnreadState.deleteMany({ where: { userId: recipient.id } });

    await notifyRecipientsOnMessageCreate({
      chatContextType: ChatContextType.USER,
      contextId: chat.id,
      senderId: sender.id,
      recipientIds: [recipient.id],
    });

    recipientRevision = await prisma.userUnreadState.findUnique({ where: { userId: recipient.id } });
    assert(recipientRevision?.unreadRevision === 1, 'explicit notify bumps recipient user revision to 1');

    const contextAfterNotify = await prisma.userContextUnreadState.findUnique({
      where: { userId_contextKey: { userId: recipient.id, contextKey } },
    });
    assert(contextAfterNotify?.unreadRevision === 1, 'explicit notify bumps recipient context revision to 1');

    const senderRevisionAfterNotify = await prisma.userUnreadState.findUnique({
      where: { userId: sender.id },
    });
    assert(senderRevisionAfterNotify == null, 'explicit notify does not bump sender revision');

    assert(message.id.length > 0, 'message persisted');

    console.log('message-create-unread-notify: ok');
  } finally {
    await prisma.chatMessage.deleteMany({
      where: {
        chatContextType: ChatContextType.USER,
        senderId: sender.id,
      },
    });
    await prisma.userContextUnreadState.deleteMany({
      where: { userId: { in: [sender.id, recipient.id] } },
    });
    await prisma.userUnreadState.deleteMany({
      where: { userId: { in: [sender.id, recipient.id] } },
    });
    await prisma.userChat.deleteMany({
      where: { OR: [{ user1Id: sender.id }, { user2Id: sender.id }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: [sender.id, recipient.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
