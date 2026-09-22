/**
 * PRD 359 demo data — seats-left on the join button, queue position on the badge.
 *
 * Creates seven public PADEL games in the viewer's Home city, each one pinned to
 * a single state the card must render. Idempotent: re-running deletes and
 * recreates the set. `--clean` removes it and exits.
 *
 *   cd Backend
 *   npx ts-node --transpile-only scripts/seed-prd359-demo.ts
 *   npx ts-node --transpile-only scripts/seed-prd359-demo.ts --clean
 *
 * Optional env: VIEWER_EMAIL (default relic.ilya@gmail.com).
 *
 * Dev only. It writes straight to the tables and deliberately skips the
 * create-game service, so there is no chat, no system message and no
 * notification — the point is the card, not the workflow.
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

const NAME_PREFIX = 'PRD359';
const VIEWER_EMAIL = process.env.VIEWER_EMAIL ?? 'relic.ilya@gmail.com';

type Seat = { userId: string; status: 'PLAYING' | 'IN_QUEUE'; role?: 'OWNER' | 'PARTICIPANT'; minutesAgo?: number };

async function clean(): Promise<number> {
  const { count } = await prisma.game.deleteMany({
    where: { name: { startsWith: NAME_PREFIX } },
  });
  return count;
}

async function main(): Promise<void> {
  const cleanOnly = process.argv.includes('--clean');

  const removed = await clean();
  console.log(`removed ${removed} existing ${NAME_PREFIX} game(s)`);
  if (cleanOnly) return;

  const viewer = await prisma.user.findFirst({
    where: { email: VIEWER_EMAIL },
    select: { id: true, firstName: true, gender: true, currentCityId: true },
  });
  if (!viewer?.currentCityId) throw new Error(`No user ${VIEWER_EMAIL} with a Home city`);
  const cityId = viewer.currentCityId;

  // Fillers are anyone else in the same city, so the roster avatars look real.
  const pool = await prisma.user.findMany({
    where: { currentCityId: cityId, id: { not: viewer.id } },
    select: { id: true, firstName: true, gender: true },
    orderBy: { id: 'asc' },
    take: 400,
  });
  const men = pool.filter((u) => u.gender === 'MALE');
  const women = pool.filter((u) => u.gender === 'FEMALE');
  if (men.length < 8 || women.length < 2) {
    throw new Error(`Not enough users in city ${cityId} (${men.length} men, ${women.length} women)`);
  }

  let manCursor = 0;
  let womanCursor = 0;
  const nextMan = () => men[manCursor++ % men.length].id;
  const nextWoman = () => women[womanCursor++ % women.length].id;

  const startOfTomorrow = new Date();
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  startOfTomorrow.setHours(9, 0, 0, 0);

  type Scenario = {
    label: string;
    expect: string;
    maxParticipants: number;
    genderTeams?: 'ANY' | 'MIX_PAIRS';
    seats: () => Seat[];
  };

  const scenarios: Scenario[] = [
    {
      label: '1 seat left',
      expect: 'Join the game · 1 seat left   (narrow: · 1 left)',
      maxParticipants: 4,
      seats: () => [
        { userId: nextMan(), status: 'PLAYING', role: 'OWNER' },
        { userId: nextMan(), status: 'PLAYING' },
        { userId: nextMan(), status: 'PLAYING' },
      ],
    },
    {
      label: '2 seats left',
      expect: 'Join the game · 2 seats left   (narrow: · 2 left)',
      maxParticipants: 4,
      seats: () => [
        { userId: nextMan(), status: 'PLAYING', role: 'OWNER' },
        { userId: nextMan(), status: 'PLAYING' },
      ],
    },
    {
      label: '3 open, control',
      expect: 'Join the game — no suffix (3 open is not scarce)',
      maxParticipants: 6,
      seats: () => [
        { userId: nextMan(), status: 'PLAYING', role: 'OWNER' },
        { userId: nextMan(), status: 'PLAYING' },
        { userId: nextMan(), status: 'PLAYING' },
      ],
    },
    {
      label: 'full, 2 waiting',
      expect: 'Join the queue · 2 waiting',
      maxParticipants: 4,
      seats: () => [
        { userId: nextMan(), status: 'PLAYING', role: 'OWNER' },
        { userId: nextMan(), status: 'PLAYING' },
        { userId: nextMan(), status: 'PLAYING' },
        { userId: nextMan(), status: 'PLAYING' },
        { userId: nextMan(), status: 'IN_QUEUE', minutesAgo: 90 },
        { userId: nextMan(), status: 'IN_QUEUE', minutesAgo: 60 },
      ],
    },
    {
      label: 'you are 2nd in queue',
      expect: 'Badge reads "In queue · 2nd" on Find, My and the Chats row',
      maxParticipants: 4,
      seats: () => [
        { userId: nextMan(), status: 'PLAYING', role: 'OWNER' },
        { userId: nextMan(), status: 'PLAYING' },
        { userId: nextMan(), status: 'PLAYING' },
        { userId: nextMan(), status: 'PLAYING' },
        // Queue order is joinedAt ascending: this one first, viewer second.
        { userId: nextMan(), status: 'IN_QUEUE', minutesAgo: 120 },
        { userId: viewer.id, status: 'IN_QUEUE', minutesAgo: 60 },
      ],
    },
    {
      label: 'MIX_PAIRS, 1 seat per gender',
      expect: 'Card strip says 2/4; a MALE viewer sees "· 1 seat left", not 2',
      maxParticipants: 4,
      genderTeams: 'MIX_PAIRS',
      seats: () => [
        { userId: nextMan(), status: 'PLAYING', role: 'OWNER' },
        { userId: nextWoman(), status: 'PLAYING' },
      ],
    },
    {
      label: 'MIX_PAIRS, male half full',
      expect: 'Card strip says 2/4 but a MALE viewer sees NO count (his half is full)',
      maxParticipants: 4,
      genderTeams: 'MIX_PAIRS',
      seats: () => [
        { userId: nextMan(), status: 'PLAYING', role: 'OWNER' },
        { userId: nextMan(), status: 'PLAYING' },
      ],
    },
  ];

  console.log(`\nviewer: ${viewer.firstName} <${VIEWER_EMAIL}> gender=${viewer.gender} city=${cityId}\n`);

  for (const [index, scenario] of scenarios.entries()) {
    const startTime = new Date(startOfTomorrow.getTime() + index * 2 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
    const seats = scenario.seats();

    const game = await prisma.game.create({
      data: {
        entityType: 'GAME',
        gameType: 'CLASSIC',
        sport: 'PADEL',
        name: `${NAME_PREFIX} · ${scenario.label}`,
        cityId,
        startTime,
        endTime,
        timeIsSet: true,
        maxParticipants: scenario.maxParticipants,
        playersPerMatch: 4,
        minLevel: 1,
        maxLevel: 7,
        isPublic: true,
        allowDirectJoin: true,
        genderTeams: scenario.genderTeams ?? 'ANY',
        venueText: 'PRD 359 demo',
        participants: {
          create: seats.map((seat) => ({
            userId: seat.userId,
            role: seat.role ?? 'PARTICIPANT',
            status: seat.status,
            joinedAt: new Date(Date.now() - (seat.minutesAgo ?? 240) * 60 * 1000),
          })),
        },
      },
      select: { id: true, name: true },
    });

    console.log(`${game.name}`);
    console.log(`  /games/${game.id}`);
    console.log(`  → ${scenario.expect}\n`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
