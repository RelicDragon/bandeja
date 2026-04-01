import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function backfill() {
  const noviSad = await prisma.city.findFirst({
    where: { name: 'Novi Sad' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  if (!noviSad) {
    console.error('City "Novi Sad" not found');
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    select: { id: true, currentCityId: true },
  });

  const idsNoviSad: string[] = [];
  const idsNotNoviSad: string[] = [];

  for (const u of users) {
    if (u.currentCityId === noviSad.id) {
      idsNoviSad.push(u.id);
    } else {
      idsNotNoviSad.push(u.id);
    }
  }

  let setTrueCount = 0;
  if (idsNoviSad.length > 0) {
    const r = await prisma.user.updateMany({
      where: { id: { in: idsNoviSad } },
      data: { cityIsSet: true },
    });
    setTrueCount = r.count;
  }

  let setFalseCount = 0;
  if (idsNotNoviSad.length > 0) {
    const r = await prisma.user.updateMany({
      where: { id: { in: idsNotNoviSad } },
      data: { cityIsSet: false },
    });
    setFalseCount = r.count;
  }

  console.log(
    `Backfill cityIsSet: ${users.length} users scanned; ` +
      `${setTrueCount} set to cityIsSet=true (Novi Sad); ` +
      `${setFalseCount} set to cityIsSet=false (not Novi Sad).`
  );
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
