import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import {
  createCityGroupWelcomeMessage,
  cityGroupHasWelcomeMessage,
  isWelcomeSenderValid,
} from '../src/services/chat/cityGroupWelcome.service';

async function backfill() {
  const senderId = process.env.CITY_GROUP_WELCOME_SENDER_ID;
  if (!senderId) {
    console.error('CITY_GROUP_WELCOME_SENDER_ID is required. Set it in .env and run again.');
    process.exit(1);
  }
  if (!(await isWelcomeSenderValid(senderId))) {
    console.error('CITY_GROUP_WELCOME_SENDER_ID must be a valid user ID. No user found with that id.');
    process.exit(1);
  }

  const cityGroups = await prisma.groupChannel.findMany({
    where: { isCityGroup: true },
    select: { id: true, name: true },
  });

  console.log(`Found ${cityGroups.length} city groups. Backfilling welcome messages...`);
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const gc of cityGroups) {
    try {
      const hasWelcome = await cityGroupHasWelcomeMessage(gc.id, senderId);
      if (hasWelcome) {
        skipped++;
        continue;
      }
      await createCityGroupWelcomeMessage(gc.id, senderId);
      created++;
      console.log(`Created welcome message for ${gc.name} (${gc.id})`);
    } catch (e) {
      errors++;
      console.error(`Error for ${gc.id} (${gc.name}):`, e);
    }
  }

  console.log(`Done. Created: ${created}, skipped (already had): ${skipped}, errors: ${errors}.`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
