import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { ChatContextType, ChatSyncEventType, ParticipantRole } from '@prisma/client';
import { ChatSyncEventService } from '../src/services/chat/chatSyncEvent.service';

async function migrate() {
  const bugs = await prisma.bug.findMany({
    include: {
      sender: { select: { id: true } },
      participants: { include: { user: { select: { id: true } } } }
    }
  });

  console.log(`Migrating ${bugs.length} bugs to groups...`);

  for (const bug of bugs) {
    const groupName = bug.text.length > 100 ? bug.text.substring(0, 97) + '...' : bug.text;
    const owner = await prisma.user.findUnique({
      where: { id: bug.senderId },
      select: { currentCityId: true }
    });

    const groupChannel = await prisma.$transaction(async (tx) => {
      const gc = await tx.groupChannel.create({
        data: {
          name: groupName,
          isChannel: false,
          isPublic: true,
          bugId: bug.id,
          cityId: owner?.currentCityId ?? null,
          participantsCount: 1
        }
      });

      await tx.groupChannelParticipant.create({
        data: {
          groupChannelId: gc.id,
          userId: bug.senderId,
          role: ParticipantRole.OWNER
        }
      });

      for (const p of bug.participants) {
        if (p.userId === bug.senderId) continue;
        await tx.groupChannelParticipant.upsert({
          where: {
            groupChannelId_userId: { groupChannelId: gc.id, userId: p.userId }
          },
          create: {
            groupChannelId: gc.id,
            userId: p.userId,
            role: ParticipantRole.PARTICIPANT
          },
          update: {}
        });
      }

      const participantCount = await tx.groupChannelParticipant.count({
        where: { groupChannelId: gc.id }
      });
      await tx.groupChannel.update({
        where: { id: gc.id },
        data: { participantsCount: participantCount }
      });

      await tx.chatMessage.updateMany({
        where: { chatContextType: ChatContextType.BUG, contextId: bug.id },
        data: { chatContextType: ChatContextType.GROUP, contextId: gc.id }
      });

      await tx.chatMute.updateMany({
        where: { chatContextType: ChatContextType.BUG, contextId: bug.id },
        data: { chatContextType: ChatContextType.GROUP, contextId: gc.id }
      });

      await tx.chatDraft.updateMany({
        where: { chatContextType: ChatContextType.BUG, contextId: bug.id },
        data: { chatContextType: ChatContextType.GROUP, contextId: gc.id }
      });

      const lastMsg = await tx.chatMessage.findFirst({
        where: { chatContextType: ChatContextType.GROUP, contextId: gc.id },
        orderBy: { createdAt: 'desc' },
        select: { content: true, updatedAt: true }
      });
      if (lastMsg?.content) {
        const preview = lastMsg.content.length > 500 ? lastMsg.content.substring(0, 497) + '...' : lastMsg.content;
        await tx.groupChannel.update({
          where: { id: gc.id },
          data: { lastMessagePreview: preview, updatedAt: lastMsg.updatedAt }
        });
      }

      await ChatSyncEventService.appendEventInTransaction(
        tx,
        ChatContextType.BUG,
        bug.id,
        ChatSyncEventType.THREAD_LOCAL_INVALIDATE,
        {}
      );
      await ChatSyncEventService.appendEventInTransaction(
        tx,
        ChatContextType.GROUP,
        gc.id,
        ChatSyncEventType.THREAD_LOCAL_INVALIDATE,
        {}
      );

      return gc;
    });

    console.log(`Migrated bug ${bug.id} -> group ${groupChannel.id}`);
  }

  console.log(`Migration complete. Migrated ${bugs.length} bugs.`);
}

migrate()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
