import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { CityGroupService } from '../src/services/chat/cityGroup.service';

async function backfill() {
  const cities = await prisma.city.findMany({ select: { id: true, name: true } });
  console.log(`Ensuring city groups for ${cities.length} cities...`);
  let groupsCreated = 0;
  let cityErrors = 0;
  for (const city of cities) {
    try {
      const existing = await prisma.groupChannel.findUnique({
        where: { id: city.id }
      });
      await CityGroupService.ensureCityGroupExists(city.id);
      if (!existing) groupsCreated++;
    } catch (e) {
      cityErrors++;
      console.error(`City ${city.id} (${city.name}):`, e);
    }
  }
  console.log(`City groups ready. Created ${groupsCreated} new groups, ${cityErrors} city errors.`);

  const users = await prisma.user.findMany({
    where: { currentCityId: { not: null } },
    select: { id: true, currentCityId: true }
  });
  console.log(`Adding ${users.length} users to their city groups (mute + pin)...`);
  let done = 0;
  let errors = 0;
  for (const user of users) {
    if (!user.currentCityId) continue;
    try {
      await CityGroupService.addUserToCityGroup(user.id, user.currentCityId, {
        mute: true,
        pin: true
      });
      done++;
    } catch (e) {
      errors++;
      console.error(`User ${user.id} (city ${user.currentCityId}):`, e);
    }
    if ((done + errors) % 100 === 0) console.log(`Progress: ${done}/${users.length} (${errors} errors)`);
  }
  console.log(`Backfill complete: ${done} users added, ${errors} errors.`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
