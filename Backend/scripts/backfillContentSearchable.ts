import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { computeContentSearchable } from '../src/utils/messageSearchContent';

const BATCH_SIZE = 500;

async function backfill() {
  const messages = await prisma.chatMessage.findMany({
    where: {
      OR: [{ content: { not: null } }, { pollId: { not: null } }]
    },
    include: { poll: { select: { question: true } } }
  });

  let updated = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((m) =>
        prisma.chatMessage.update({
          where: { id: m.id },
          data: {
            contentSearchable: computeContentSearchable(m.content, m.poll?.question)
          }
        })
      )
    );
    updated += batch.length;
    if (updated % 1000 === 0 || updated === messages.length) {
      console.log(`Backfill progress: ${updated}/${messages.length}`);
    }
  }

  console.log(`Backfill complete: ${updated} messages updated.`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
