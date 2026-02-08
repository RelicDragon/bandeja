import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { ParticipantRole } from '@prisma/client';

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

    const groupChannel = await prisma.groupChannel.create({
      data: {
        name: groupName,
        isChannel: false,
        isPublic: true,
        bugId: bug.id,
        cityId: owner?.currentCityId ?? null,
        participantsCount: 1
      }
    });

    await prisma.groupChannelParticipant.create({
      data: {
        groupChannelId: groupChannel.id,
        userId: bug.senderId,
        role: ParticipantRole.OWNER
      }
    });

    for (const p of bug.participants) {
      if (p.userId === bug.senderId) continue;
      await prisma.groupChannelParticipant.upsert({
        where: {
          groupChannelId_userId: { groupChannelId: groupChannel.id, userId: p.userId }
        },
        create: {
          groupChannelId: groupChannel.id,
          userId: p.userId,
          role: ParticipantRole.PARTICIPANT
        },
        update: {}
      });
    }

    const participantCount = await prisma.groupChannelParticipant.count({
      where: { groupChannelId: groupChannel.id }
    });
    await prisma.groupChannel.update({
      where: { id: groupChannel.id },
      data: { participantsCount: participantCount }
    });

    await prisma.chatMessage.updateMany({
      where: { chatContextType: 'BUG', contextId: bug.id },
      data: { chatContextType: 'GROUP', contextId: groupChannel.id }
    });

    await prisma.chatMute.updateMany({
      where: { chatContextType: 'BUG', contextId: bug.id },
      data: { chatContextType: 'GROUP', contextId: groupChannel.id }
    });

    await prisma.chatDraft.updateMany({
      where: { chatContextType: 'BUG', contextId: bug.id },
      data: { chatContextType: 'GROUP', contextId: groupChannel.id }
    });

    const lastMsg = await prisma.chatMessage.findFirst({
      where: { chatContextType: 'GROUP', contextId: groupChannel.id },
      orderBy: { createdAt: 'desc' },
      select: { content: true, updatedAt: true }
    });
    if (lastMsg?.content) {
      const preview = lastMsg.content.length > 500 ? lastMsg.content.substring(0, 497) + '...' : lastMsg.content;
      await prisma.groupChannel.update({
        where: { id: groupChannel.id },
        data: { lastMessagePreview: preview, updatedAt: lastMsg.updatedAt }
      });
    }

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
