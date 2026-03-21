import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';

function trimmedLen(v: string | null | undefined): number {
  return (v ?? '').trim().length;
}

function hasDisplayName(firstName: string | null | undefined, lastName: string | null | undefined): boolean {
  return trimmedLen(firstName) >= 1 || trimmedLen(lastName) >= 1;
}

function generatePlaceholderFirstName(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: ' ',
    style: 'capital',
    length: 2,
  });
}

async function backfill() {
  const users = await prisma.user.findMany({
    select: { id: true, firstName: true, lastName: true, nameIsSet: true },
  });

  const idsWithName: string[] = [];
  const idsNeedPlaceholder: string[] = [];

  for (const u of users) {
    if (hasDisplayName(u.firstName, u.lastName)) {
      idsWithName.push(u.id);
    } else {
      idsNeedPlaceholder.push(u.id);
    }
  }

  let setTrueCount = 0;
  if (idsWithName.length > 0) {
    const r = await prisma.user.updateMany({
      where: { id: { in: idsWithName } },
      data: { nameIsSet: true },
    });
    setTrueCount = r.count;
  }

  let placeholderCount = 0;
  for (const id of idsNeedPlaceholder) {
    await prisma.user.update({
      where: { id },
      data: {
        firstName: generatePlaceholderFirstName(),
        lastName: null,
        nameIsSet: false,
      },
    });
    placeholderCount += 1;
  }

  console.log(
    `Backfill nameIsSet: ${users.length} users scanned; ` +
      `${setTrueCount} updated to nameIsSet=true (had first/last); ` +
      `${placeholderCount} got generated firstName + nameIsSet=false (no name).`
  );
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
