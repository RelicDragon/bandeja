import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { BugStatus, ChatContextType } from '@prisma/client';

const FINISHED_STATUS_MESSAGE_PREFIX =
  '{"type":"BUG_STATUS_CHANGED","variables":{"status":"finished"},"text":"Bug status changed to finished"}';

async function backfill() {
  const bugs = await prisma.bug.findMany({
    where: { status: BugStatus.FINISHED },
    include: { groupChannel: { select: { id: true } } },
  });

  let updated = 0;
  for (let i = 0; i < bugs.length; i++) {
    const bug = bugs[i];
    const channelId = bug.groupChannel?.id;
    if (!channelId) continue;

    const msg = await prisma.chatMessage.findFirst({
      where: {
        chatContextType: ChatContextType.GROUP,
        contextId: channelId,
        content: { startsWith: FINISHED_STATUS_MESSAGE_PREFIX },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (msg) {
      await prisma.bug.update({
        where: { id: bug.id },
        data: { finishedAt: msg.createdAt },
      });
      updated++;
      if (updated % 50 === 0) console.log(`Backfill progress: ${updated} updated, ${i + 1}/${bugs.length} processed`);
    }
  }

  console.log(`Backfill complete: ${updated} finished bugs updated with finishedAt.`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
