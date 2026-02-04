import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { updateLastMessagePreview } from '../src/services/chat/lastMessagePreview.service';
import { ChatContextType } from '@prisma/client';

async function backfill() {
  const userChats = await prisma.userChat.findMany({ select: { id: true } });
  const games = await prisma.game.findMany({ select: { id: true } });
  const bugs = await prisma.bug.findMany({ select: { id: true } });
  const groupChannels = await prisma.groupChannel.findMany({ select: { id: true } });

  let done = 0;
  const total =
    userChats.length + games.length + bugs.length + groupChannels.length;

  for (const { id } of userChats) {
    await updateLastMessagePreview(ChatContextType.USER, id);
    done++;
    if (done % 50 === 0) console.log(`Backfill progress: ${done}/${total}`);
  }
  for (const { id } of games) {
    await updateLastMessagePreview(ChatContextType.GAME, id);
    done++;
    if (done % 50 === 0) console.log(`Backfill progress: ${done}/${total}`);
  }
  for (const { id } of bugs) {
    await updateLastMessagePreview(ChatContextType.BUG, id);
    done++;
    if (done % 50 === 0) console.log(`Backfill progress: ${done}/${total}`);
  }
  for (const { id } of groupChannels) {
    await updateLastMessagePreview(ChatContextType.GROUP, id);
    done++;
    if (done % 50 === 0) console.log(`Backfill progress: ${done}/${total}`);
  }

  console.log(`Backfill complete: ${total} contexts updated.`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
