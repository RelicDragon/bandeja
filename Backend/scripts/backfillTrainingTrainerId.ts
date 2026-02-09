import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { EntityType } from '@prisma/client';

async function backfill() {
  const trainings = await prisma.game.findMany({
    where: { entityType: EntityType.TRAINING, trainerId: null },
    select: {
      id: true,
      participants: {
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, isTrainer: true } },
        },
      },
    },
  });

  let updated = 0;
  for (const game of trainings) {
    const trainerParticipant = game.participants
      .filter((p) => p.user.isTrainer)
      .sort((a, b) => {
        const order = { OWNER: 0, ADMIN: 1, PARTICIPANT: 2 };
        return order[a.role] - order[b.role];
      })[0];

    if (trainerParticipant) {
      await prisma.game.update({
        where: { id: game.id },
        data: { trainerId: trainerParticipant.userId },
      });
      updated++;
    }
  }

  console.log(`Backfill complete: ${updated}/${trainings.length} trainings updated.`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
